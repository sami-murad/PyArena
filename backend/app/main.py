"""PyArena API entry point.

``app`` is the ASGI application uvicorn serves: Socket.IO handles
``/socket.io/`` and everything else is passed to FastAPI.

    uvicorn app.main:app --reload --port 8000

Routes live under ``/api/v1``. The original unversioned ``/api/...`` paths
remain as aliases (hidden from the OpenAPI schema) and answer with
``Deprecation: true`` plus a ``Link`` to the versioned path.
"""

from __future__ import annotations

import hmac
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import socketio
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from starlette.middleware.base import RequestResponseEndpoint

from app.api.routes import auth, competitions, execute, health, questions, snippets, submissions, users
from app.config import Settings, get_settings
from app.core.context import AppContext, build_context
from app.core.errors import ServiceError
from app.core.idempotency import IdempotencyMiddleware
from app.core.logging import configure_logging
from app.core.metrics import render_metrics
from app.core.request_context import REQUEST_ID_HEADER, RequestContextMiddleware
from app.execution.client import Executor, WorkerExecutor
from app.security.csrf import OriginCheckMiddleware
from app.websocket.events import EventBus, RecordingBus
from app.websocket.server import SocketIOBus, create_socket_server, register_handlers

API_V1 = "/api/v1"
LEGACY_API = "/api"
ROUTERS = (health, auth, users, execute, questions, submissions, competitions, snippets)


def create_fastapi_app(ctx: AppContext, start_background: bool = True) -> FastAPI:
    settings = ctx.settings

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        if start_background:
            ctx.competitions.start_background()
        yield
        await ctx.close()

    show_docs = settings.environment != "production"
    app = FastAPI(
        title=settings.app_name,
        version="0.2.0",
        lifespan=lifespan,
        docs_url=f"{API_V1}/docs" if show_docs else None,
        redoc_url=None,
        openapi_url=f"{API_V1}/openapi.json" if show_docs else None,
    )
    app.state.ctx = ctx

    # Starlette runs the LAST added middleware FIRST. Effective order per request:
    # RequestContext -> CORS -> OriginCheck (CSRF) -> Idempotency -> security headers -> routes.
    @app.middleware("http")
    async def security_headers(request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        response.headers.setdefault("Cache-Control", "no-store")
        return response

    app.add_middleware(IdempotencyMiddleware, store=ctx.idempotency, settings=settings)
    app.add_middleware(OriginCheckMiddleware, allowed_origins=settings.cors_origins)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type", "Idempotency-Key", "X-Request-ID"],
        expose_headers=["X-Request-ID", "Idempotent-Replayed", "Retry-After"],
    )
    app.add_middleware(RequestContextMiddleware)

    @app.exception_handler(ServiceError)
    async def service_error_handler(_: Request, exc: ServiceError) -> JSONResponse:
        headers = {}
        if exc.retry_after is not None:
            headers["Retry-After"] = str(int(exc.retry_after) + 1)
        return JSONResponse({"detail": exc.message, "code": exc.code}, status_code=exc.status_code, headers=headers)

    for router in ROUTERS:
        app.include_router(router.router, prefix=API_V1)
    for router in ROUTERS:
        app.include_router(router.router, prefix=LEGACY_API, include_in_schema=False)

    if settings.metrics_enabled:

        @app.get("/metrics", include_in_schema=False)
        async def metrics(request: Request) -> Response:
            if settings.metrics_token:
                supplied = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
                if not hmac.compare_digest(supplied.encode(), settings.metrics_token.encode()):
                    return JSONResponse({"detail": "Metrics token required."}, status_code=401)
            body, content_type = await render_metrics(ctx.db.sessionmaker)
            return Response(body, media_type=content_type)

    return app


def create_app(
    settings: Settings | None = None, executor: Executor | None = None, bus: EventBus | None = None
) -> socketio.ASGIApp:
    settings = settings or get_settings()
    configure_logging(settings.log_format, settings.log_level)
    executor = executor or WorkerExecutor(
        settings.worker_url,
        settings.worker_token,
        settings.worker_timeout_seconds,
        settings.worker_connect_timeout_seconds,
    )
    sio = create_socket_server(settings.cors_origins, settings.redis_url)
    ctx = build_context(settings, executor, bus or SocketIOBus(sio))
    fastapi_app = create_fastapi_app(ctx)
    register_handlers(sio, ctx)
    return socketio.ASGIApp(sio, other_asgi_app=fastapi_app, socketio_path="socket.io")


app = create_app()

__all__ = ["REQUEST_ID_HEADER", "RecordingBus", "app", "create_app", "create_fastapi_app"]
