"""Cross-site request forgery protection.

Browsers attach an ``Origin`` header to every cross-site POST/PUT/PATCH/DELETE.
We reject state-changing requests whose Origin is not one of our configured
frontend origins.  Together with ``SameSite=Lax`` session cookies and JSON-only
request bodies this blocks classic CSRF attacks.
"""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


class OriginCheckMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, allowed_origins: list[str]) -> None:
        super().__init__(app)
        self.allowed = {o.rstrip("/") for o in allowed_origins}

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.method not in SAFE_METHODS:
            origin = request.headers.get("origin")
            if origin is not None:
                origin = origin.rstrip("/")
                same_origin = origin.split("://", 1)[-1] == request.headers.get("host", "")
                if origin not in self.allowed and not same_origin:
                    return JSONResponse({"detail": "Cross-site request blocked."}, status_code=403)
        return await call_next(request)
