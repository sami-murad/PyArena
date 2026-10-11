"""Per-request context: request id, access log, HTTP metrics, API-version headers."""

from __future__ import annotations

import logging
import re
import time

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.logging import current_fields, new_request_id, start_context
from app.core.metrics import HTTP_LATENCY, HTTP_REQUESTS

log = logging.getLogger("pyarena.access")

REQUEST_ID_HEADER = "x-request-id"
# Accept a caller's id (from nginx or a client) only if it is short and plain.
_VALID_REQUEST_ID = re.compile(r"^[A-Za-z0-9._\-]{8,64}$")
_LEGACY_API = re.compile(r"^/api/(?!v1(?:/|$))")


def _route_template(scope: Scope) -> str:
    """Full path with ids replaced by their names, e.g. /api/v1/competitions/{competition_id}.

    Used as a metrics label, so it must stay low-cardinality: unmatched paths
    (404s, scanners) all share one label.
    """
    if scope.get("route") is None:
        return "unmatched"
    segments = scope["path"].split("/")
    names = {str(value): name for name, value in (scope.get("path_params") or {}).items()}
    return "/".join(f"{{{names[seg]}}}" if seg in names else seg for seg in segments)


class RequestContextMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = Headers(scope=scope).get(REQUEST_ID_HEADER, "")
        request_id = incoming if _VALID_REQUEST_ID.match(incoming) else new_request_id()
        start_context(request_id=request_id)
        path: str = scope["path"]
        legacy = bool(_LEGACY_API.match(path))
        started = time.perf_counter()
        status_code = 500

        async def send_with_headers(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = int(message["status"])
                headers = MutableHeaders(scope=message)
                headers[REQUEST_ID_HEADER] = request_id
                if legacy:
                    # Unversioned /api/... still works but is deprecated (RFC 8594 style).
                    headers["deprecation"] = "true"
                    headers["link"] = f'</api/v1{path[len("/api") :]}>; rel="successor-version"'
            await send(message)

        try:
            await self.app(scope, receive, send_with_headers)
        finally:
            elapsed = time.perf_counter() - started
            template = _route_template(scope)
            method = scope["method"]
            if template != "/metrics":
                HTTP_REQUESTS.labels(method=method, route=template, status=str(status_code)).inc()
                HTTP_LATENCY.labels(method=method, route=template).observe(elapsed)
            if not template.endswith("/health/live"):
                log.info(
                    "%s %s %s",
                    method,
                    path,
                    status_code,
                    extra={
                        "status": status_code,
                        "duration_ms": round(elapsed * 1000, 1),
                        "route": template,
                        **{k: v for k, v in current_fields().items() if k != "request_id"},
                    },
                )
