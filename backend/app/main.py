"""PyArena API entry point.

``app`` is the ASGI application uvicorn serves: Socket.IO handles
``/socket.io/`` and everything else is passed to FastAPI.

    uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import socketio
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import auth, competitions, execute, health, questions, snippets, submissions, users
from app.config import Settings, get_settings
from app.core.context import AppContext, build_context
from app.core.errors import ServiceError
from app.execution.client import Executor, WorkerExecutor
from app.security.csrf import OriginCheckMiddleware
from app.websocket.events import EventBus, RecordingBus
from app.websocket.server import SocketIOBus, create_socket_server, register_handlers

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def create_fastapi_app(ctx: AppContext, start_background: bool = True) -> FastAPI:
    settings = ctx.settings

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        if start_background:
            ctx.competitions.start_background()
        yield
        await ctx.competitions.shutdown()
        close = getattr(ctx.executor, "close", None)
        if close:
            await close()
        await ctx.db.dispose()

    show_docs = settings.environment != "production"
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/api/docs" if show_docs else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if show_docs else None,
    )
    app.state.ctx = ctx

    app.add_middleware(OriginCheckMiddleware, allowed_origins=settings.cors_origins)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type"],
    )

    @app.exception_handler(ServiceError)
    async def service_error_handler(_: Request, exc: ServiceError) -> JSONResponse:
        headers = {}
        retry = getattr(exc, "retry_after", None)
        if retry is not None:
            headers["Retry-After"] = str(int(retry) + 1)
        return JSONResponse({"detail": exc.message, "code": exc.code}, status_code=exc.status_code, headers=headers)

    @app.middleware("http")
    async def security_headers(request: Request, call_next):  # type: ignore[no-untyped-def]
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        response.headers.setdefault("Cache-Control", "no-store")
        return response

    for router in (health, auth, users, execute, questions, submissions, competitions, snippets):
        app.include_router(router.router, prefix="/api")
    return app


def create_app(
    settings: Settings | None = None, executor: Executor | None = None, bus: EventBus | None = None
) -> socketio.ASGIApp:
    settings = settings or get_settings()
    executor = executor or WorkerExecutor(
        settings.worker_url,
        settings.worker_token,
        settings.worker_timeout_seconds,
        settings.worker_connect_timeout_seconds,
    )
    sio = create_socket_server(settings.cors_origins)
    ctx = build_context(settings, executor, bus or SocketIOBus(sio))
    fastapi_app = create_fastapi_app(ctx)
    register_handlers(sio, ctx)
    asgi = socketio.ASGIApp(sio, other_asgi_app=fastapi_app, socketio_path="socket.io")
    asgi.fastapi = fastapi_app  # type: ignore[attr-defined]
    asgi.ctx = ctx  # type: ignore[attr-defined]
    return asgi


app = create_app()

__all__ = ["app", "create_app", "create_fastapi_app", "RecordingBus"]
