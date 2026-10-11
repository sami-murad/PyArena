"""Socket.IO server (python-socketio) mounted next to FastAPI.

Authentication reuses the httpOnly session cookie sent with the handshake.
Every event re-validates membership on the server; clients never send user
IDs, timers, statuses or winners.
"""

from __future__ import annotations

import logging
from http.cookies import SimpleCookie
from typing import Any

import socketio

from app.core.context import AppContext
from app.core.errors import ServiceError
from app.core.logging import new_request_id, start_context
from app.core.metrics import SOCKET_CONNECTIONS
from app.repositories.users import UserRepository
from app.security.tokens import decode_session_token
from app.websocket import events as ev

log = logging.getLogger("pyarena.socket")


class SocketIOBus:
    def __init__(self, sio: socketio.AsyncServer) -> None:
        self.sio = sio

    async def emit(self, event: str, data: Any, room: str) -> None:
        await self.sio.emit(event, data, room=room)


def create_socket_server(cors_origins: list[str], redis_url: str = "") -> socketio.AsyncServer:
    # With Redis, every API process shares one pub/sub channel, so an event
    # emitted on one process reaches sockets connected to any other.
    manager = socketio.AsyncRedisManager(redis_url, channel="pyarena-socketio") if redis_url else None
    return socketio.AsyncServer(
        async_mode="asgi",
        client_manager=manager,
        cors_allowed_origins=cors_origins,
        ping_interval=20,
        ping_timeout=20,
        max_http_buffer_size=64 * 1024,
    )


def _competition_id(data: Any) -> int | None:
    if not isinstance(data, dict):
        return None
    value = data.get("competition_id")
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        return None
    return value


def register_handlers(sio: socketio.AsyncServer, ctx: AppContext) -> None:
    service = ctx.competitions

    async def current_user(sid: str) -> Any:
        session = await sio.get_session(sid)
        user_id = session.get("user_id")
        # Every socket event gets its own log context, like an HTTP request.
        start_context(request_id=new_request_id(), user_id=user_id)
        async with ctx.db.sessionmaker() as s:
            return await UserRepository(s).get(user_id) if user_id else None

    async def error(sid: str, message: str) -> None:
        await sio.emit(ev.ROOM_ERROR, {"message": message}, to=sid)

    @sio.event
    async def connect(sid: str, environ: dict[str, Any], auth: Any = None) -> None:
        cookie = SimpleCookie(environ.get("HTTP_COOKIE", ""))
        morsel = cookie.get(ctx.settings.session_cookie_name)
        user_id = decode_session_token(morsel.value if morsel else None, ctx.settings)
        if user_id is None:
            raise socketio.exceptions.ConnectionRefusedError("authentication required")
        await sio.save_session(sid, {"user_id": user_id})
        SOCKET_CONNECTIONS.inc()

    @sio.event
    async def disconnect(sid: str, *args: Any) -> None:
        session = await sio.get_session(sid)
        user_id = session.get("user_id")
        if user_id is not None:
            SOCKET_CONNECTIONS.dec()
        start_context(request_id=new_request_id(), user_id=user_id)
        for cid in ctx.presence.rooms_of(sid):
            gone = await ctx.presence.remove(cid, user_id, sid)
            if gone:
                await sio.emit(
                    ev.PLAYER_DISCONNECTED, {"competition_id": cid, "user_id": user_id}, room=ev.competition_room(cid)
                )
                await service.broadcast_state(cid)
        ctx.presence.forget_sid(sid)

    @sio.on(ev.ROOM_JOIN)
    async def room_join(sid: str, data: Any) -> dict[str, Any]:
        cid = _competition_id(data)
        user = await current_user(sid)
        if cid is None or user is None:
            return {"ok": False, "error": "Invalid request."}
        try:
            state = await service.state(cid, user.id)  # also verifies membership
        except ServiceError as exc:
            await error(sid, exc.message)
            return {"ok": False, "error": exc.message}
        await sio.enter_room(sid, ev.competition_room(cid))
        await ctx.presence.add(cid, user.id, sid)
        await service.broadcast_state(cid)
        return {"ok": True, "state": state.model_dump(mode="json")}

    @sio.on(ev.ROOM_LEAVE)
    async def room_leave(sid: str, data: Any) -> dict[str, Any]:
        cid = _competition_id(data)
        user = await current_user(sid)
        if cid is None or user is None:
            return {"ok": False, "error": "Invalid request."}
        try:
            await service.leave(user, cid)
        except ServiceError as exc:
            return {"ok": False, "error": exc.message}
        await sio.leave_room(sid, ev.competition_room(cid))
        await ctx.presence.remove(cid, user.id, sid)
        await service.broadcast_state(cid)
        return {"ok": True}

    @sio.on(ev.PLAYER_READY)
    async def player_ready(sid: str, data: Any) -> dict[str, Any]:
        cid = _competition_id(data)
        user = await current_user(sid)
        ready = data.get("ready") if isinstance(data, dict) else None
        if cid is None or user is None or not isinstance(ready, bool):
            return {"ok": False, "error": "Invalid request."}
        try:
            await service.set_ready(user, cid, ready)
        except ServiceError as exc:
            return {"ok": False, "error": exc.message}
        return {"ok": True}
