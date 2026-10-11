"""``Idempotency-Key`` support for mutating routes.

A client that retries a request (lost connection, double click, reconnect)
sends the same ``Idempotency-Key`` header. The first request runs normally and
its 2xx response is stored for ``IDEMPOTENCY_TTL_HOURS``; any repeat with the
same key returns that stored response (header ``Idempotent-Replayed: true``)
instead of running again. So a retried competition submission can never
create a second submission.

* Same key, different request body or route: ``422``.
* Same key while the first request is still running: ``409``.
* Non-2xx responses are not stored, so the client can fix the problem and
  retry with the same key.

The header is optional; without it requests behave exactly as before. Keys are
stored in the database (works on PostgreSQL and SQLite, and across processes).
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import timedelta
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from starlette.datastructures import Headers
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import Settings
from app.core.database import utcnow
from app.core.metrics import IDEMPOTENT_REPLAYS
from app.models.idempotency import IdempotencyKey
from app.security.tokens import decode_session_token

log = logging.getLogger("pyarena.idempotency")

HEADER = "idempotency-key"
KEY_PATTERN = re.compile(r"^[A-Za-z0-9_.:\-]{8,128}$")
MAX_BODY_BYTES = 256 * 1024

# Routes that accept the header (with or without the /v1 version prefix).
IDEMPOTENT_ROUTES = (
    re.compile(r"^/api(?:/v1)?/execute$"),
    re.compile(r"^/api(?:/v1)?/submissions$"),
    re.compile(r"^/api(?:/v1)?/competitions/\d+/submissions$"),
)


def _json_response(status: int, detail: str, code: str) -> tuple[int, bytes]:
    return status, json.dumps({"detail": detail, "code": code}).encode()


class IdempotencyStore:
    def __init__(self, sessionmaker: async_sessionmaker[AsyncSession], ttl_hours: int) -> None:
        self.sm = sessionmaker
        self.ttl = timedelta(hours=ttl_hours)

    async def begin(
        self, scope: str, key: str, method: str, path: str, request_hash: str
    ) -> tuple[str, IdempotencyKey | None]:
        """Returns ("new", None), ("replay", record), ("mismatch", None) or ("busy", None)."""
        now = utcnow()
        async with self.sm() as s:
            existing = (
                await s.execute(select(IdempotencyKey).where(IdempotencyKey.scope == scope, IdempotencyKey.key == key))
            ).scalar_one_or_none()
            if existing is not None and existing.expires_at <= now:
                await s.delete(existing)
                await s.commit()
                existing = None
            if existing is None:
                s.add(
                    IdempotencyKey(
                        scope=scope,
                        key=key,
                        method=method,
                        path=path,
                        request_hash=request_hash,
                        state="in_progress",
                        expires_at=now + self.ttl,
                    )
                )
                try:
                    await s.commit()
                    return "new", None
                except IntegrityError:
                    # Another request with the same key won the insert race.
                    await s.rollback()
                    return "busy", None
            if existing.request_hash != request_hash or existing.path != path or existing.method != method:
                return "mismatch", None
            if existing.state != "completed":
                return "busy", None
            return "replay", existing

    async def complete(self, scope: str, key: str, status: int, body: bytes) -> None:
        async with self.sm() as s:
            record = (
                await s.execute(select(IdempotencyKey).where(IdempotencyKey.scope == scope, IdempotencyKey.key == key))
            ).scalar_one_or_none()
            if record is not None:
                record.state = "completed"
                record.response_status = status
                record.response_body = body.decode("utf-8", "replace")
                await s.commit()

    async def discard(self, scope: str, key: str) -> None:
        async with self.sm() as s:
            await s.execute(delete(IdempotencyKey).where(IdempotencyKey.scope == scope, IdempotencyKey.key == key))
            await s.commit()

    async def purge_expired(self) -> int:
        async with self.sm() as s:
            result = await s.execute(delete(IdempotencyKey).where(IdempotencyKey.expires_at <= utcnow()))
            await s.commit()
            return int(getattr(result, "rowcount", 0) or 0)


class IdempotencyMiddleware:
    """Pure ASGI middleware, so the request body can be read and replayed safely."""

    def __init__(self, app: ASGIApp, store: IdempotencyStore, settings: Settings) -> None:
        self.app = app
        self.store = store
        self.settings = settings

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] != "POST":
            await self.app(scope, receive, send)
            return
        path: str = scope["path"]
        headers = Headers(scope=scope)
        key = headers.get(HEADER)
        if key is None or not any(p.match(path) for p in IDEMPOTENT_ROUTES):
            await self.app(scope, receive, send)
            return
        if not KEY_PATTERN.match(key):
            await self._send(
                send, *_json_response(400, "Idempotency-Key must be 8-128 letters, digits or _ . : -", "bad_key")
            )
            return

        body = await self._read_body(receive)
        if body is None:
            await self._send(send, *_json_response(413, "Request body too large.", "too_large"))
            return
        caller = self._caller(scope, headers)
        request_hash = hashlib.sha256(b"POST " + path.encode() + b"\n" + body).hexdigest()
        outcome, record = await self.store.begin(caller, key, "POST", path, request_hash)

        if outcome == "mismatch":
            await self._send(
                send,
                *_json_response(422, "This Idempotency-Key was already used for a different request.", "key_reused"),
            )
            return
        if outcome == "busy":
            await self._send(
                send, *_json_response(409, "A request with this Idempotency-Key is still being processed.", "in_flight")
            )
            return
        if outcome == "replay" and record is not None:
            IDEMPOTENT_REPLAYS.inc()
            await self._send(
                send,
                record.response_status or 200,
                (record.response_body or "").encode(),
                extra_headers=[(b"idempotent-replayed", b"true")],
            )
            return

        # First time we see this key: run the request and capture the response.
        captured: list[Message] = []
        status_holder: dict[str, int] = {}

        async def replay_receive() -> Message:
            nonlocal body
            if body is not None:
                chunk, body = body, None
                return {"type": "http.request", "body": chunk, "more_body": False}
            return await receive()

        async def capture_send(message: Message) -> None:
            if message["type"] == "http.response.start":
                status_holder["status"] = int(message["status"])
            captured.append(message)

        try:
            await self.app(scope, replay_receive, capture_send)
        except BaseException:
            await self.store.discard(caller, key)
            raise

        status = status_holder.get("status", 500)
        response_body = b"".join(m.get("body", b"") for m in captured if m["type"] == "http.response.body")
        if 200 <= status < 300:
            await self.store.complete(caller, key, status, response_body)
        else:
            await self.store.discard(caller, key)
        for message in captured:
            await send(message)

    @staticmethod
    async def _read_body(receive: Receive) -> bytes | None:
        chunks: list[bytes] = []
        size = 0
        while True:
            message = await receive()
            chunk = message.get("body", b"")
            size += len(chunk)
            if size > MAX_BODY_BYTES:
                return None
            chunks.append(chunk)
            if not message.get("more_body", False):
                return b"".join(chunks)

    def _caller(self, scope: Scope, headers: Headers) -> str:
        cookies = headers.get("cookie", "")
        token = None
        for part in cookies.split(";"):
            name, _, value = part.strip().partition("=")
            if name == self.settings.session_cookie_name:
                token = value
        user_id = decode_session_token(token, self.settings)
        if user_id is not None:
            return f"user:{user_id}"
        if self.settings.trust_proxy_headers and headers.get("x-real-ip"):
            return f"ip:{headers['x-real-ip']}"
        client = scope.get("client")
        return f"ip:{client[0] if client else 'unknown'}"

    @staticmethod
    async def _send(
        send: Send, status: int, body: bytes, extra_headers: list[tuple[bytes, bytes]] | None = None
    ) -> None:
        headers: list[Any] = [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]
        headers += extra_headers or []
        await send({"type": "http.response.start", "status": status, "headers": headers})
        await send({"type": "http.response.body", "body": body})
