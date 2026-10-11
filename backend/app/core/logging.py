"""Structured logging with request and domain context.

Every log line carries the fields bound for the current request or task:
``request_id``, ``user_id``, ``competition_id`` and ``submission_id``.

* HTTP: ``RequestContextMiddleware`` starts a fresh context per request and
  the auth dependency adds ``user_id`` to it.
* Background work (judge loops, timers): ``bind(competition_id=...)`` adds
  fields for the duration of a block.

``LOG_FORMAT=json`` (default) prints one JSON object per line for log
collectors; ``LOG_FORMAT=text`` prints readable lines for local development.
"""

from __future__ import annotations

import json
import logging
import sys
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

CONTEXT_FIELDS = ("request_id", "user_id", "competition_id", "submission_id")

# One mutable dict per request/task. Inner code mutates it in place, so values
# added deep inside a request (such as user_id) are visible to the access log.
_log_context: ContextVar[dict[str, Any] | None] = ContextVar("pyarena_log_context", default=None)


def new_request_id() -> str:
    return uuid.uuid4().hex


def start_context(**fields: Any) -> dict[str, Any]:
    """Begin a fresh context (one per HTTP request or socket event)."""
    ctx = {k: v for k, v in fields.items() if v is not None}
    _log_context.set(ctx)
    return ctx


def set_fields(**fields: Any) -> None:
    """Add fields to the current context (creating one if needed)."""
    ctx = _log_context.get()
    if ctx is None:
        ctx = start_context()
    ctx.update({k: v for k, v in fields.items() if v is not None})


def current_fields() -> dict[str, Any]:
    return dict(_log_context.get() or {})


@contextmanager
def bind(**fields: Any) -> Iterator[None]:
    """Temporarily add fields; restores the previous context afterwards."""
    previous = _log_context.get()
    merged = {**(previous or {}), **{k: v for k, v in fields.items() if v is not None}}
    token = _log_context.set(merged)
    try:
        yield
    finally:
        _log_context.reset(token)


class ContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        for key, value in current_fields().items():
            if not hasattr(record, key):
                setattr(record, key, value)
        return True


_RESERVED = set(vars(logging.LogRecord("", 0, "", 0, "", (), None))) | {"message", "asctime"}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key, value in vars(record).items():
            if key not in _RESERVED and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


class TextFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        base = super().format(record)
        extras = " ".join(f"{k}={getattr(record, k)}" for k in CONTEXT_FIELDS if getattr(record, k, None) is not None)
        return f"{base} [{extras}]" if extras else base


def configure_logging(fmt: str = "json", level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(ContextFilter())
    if fmt == "json":
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(TextFormatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    root = logging.getLogger()
    for existing in list(root.handlers):
        root.removeHandler(existing)
    root.addHandler(handler)
    root.setLevel(level)
    # Uvicorn's own access log duplicates ours.
    logging.getLogger("uvicorn.access").disabled = True
    for name in ("uvicorn", "uvicorn.error"):
        logging.getLogger(name).handlers.clear()
        logging.getLogger(name).propagate = True
