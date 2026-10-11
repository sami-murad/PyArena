"""End-to-end Socket.IO test against a real uvicorn server."""

import asyncio
import socket
from typing import Any

import httpx
import socketio
import uvicorn

from app.core.context import build_context
from app.core.database import Database
from app.main import create_fastapi_app
from app.websocket import events as ev
from app.websocket.server import SocketIOBus, create_socket_server, register_handlers
from tests.conftest import SandboxExecutor, make_settings, reference_solution


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


class Recorder:
    def __init__(self, client: socketio.AsyncClient) -> None:
        self.events: list[tuple[str, Any]] = []
        self.client = client

        @client.on("*")
        async def any_event(event: str, data: Any) -> None:
            self.events.append((event, data))

    def names(self) -> list[str]:
        return [e for e, _ in self.events]

    async def wait_for(self, name: str, timeout: float = 15) -> Any:
        async def poll() -> Any:
            while True:
                for event, data in self.events:
                    if event == name:
                        return data
                await asyncio.sleep(0.05)

        return await asyncio.wait_for(poll(), timeout)


async def test_realtime_competition_over_socketio(ctx, db_url: str) -> None:  # type: ignore[no-untyped-def]
    # ``ctx`` already created and seeded the schema; build a socket-enabled app on the same database.
    settings = make_settings(database_url=db_url)
    sio = create_socket_server(["http://127.0.0.1"])
    app_ctx = build_context(settings, SandboxExecutor(), SocketIOBus(sio), db=Database(db_url))
    fastapi_app = create_fastapi_app(app_ctx, start_background=False)
    register_handlers(sio, app_ctx)
    asgi = socketio.ASGIApp(sio, other_asgi_app=fastapi_app)

    port = free_port()
    server = uvicorn.Server(uvicorn.Config(asgi, host="127.0.0.1", port=port, log_level="warning", lifespan="off"))
    serve_task = asyncio.create_task(server.serve())
    while not server.started:
        await asyncio.sleep(0.05)
    base = f"http://127.0.0.1:{port}"

    try:
        async with httpx.AsyncClient(base_url=base) as host, httpx.AsyncClient(base_url=base) as guest:
            for c, name in ((host, "sock_host"), (guest, "sock_guest")):
                r = await c.post(
                    "/api/auth/register",
                    json={"username": name, "email": f"{name}@pyarena.dev", "password": "password-123"},
                )
                assert r.status_code == 201
            room = (await host.post("/api/competitions", json={"difficulty": "easy"})).json()
            cid = room["id"]
            await guest.post("/api/competitions/join", json={"code": room["code"]})

            # Unauthenticated sockets are refused.
            anonymous = socketio.AsyncClient()
            try:
                await anonymous.connect(base, transports=["websocket"], wait_timeout=5)
                connected = True
            except socketio.exceptions.ConnectionError:
                connected = False
            assert connected is False

            clients = []
            recorders = []
            for c in (host, guest):
                sc = socketio.AsyncClient()
                recorders.append(Recorder(sc))
                cookie = "; ".join(f"{k}={v}" for k, v in c.cookies.items())
                await sc.connect(base, headers={"Cookie": cookie}, transports=["websocket"], wait_timeout=5)
                ack = await sc.call(ev.ROOM_JOIN, {"competition_id": cid}, timeout=5)
                assert ack["ok"] is True
                clients.append(sc)
            host_rec, guest_rec = recorders

            # Validation: bad payloads and non-member access are rejected.
            assert (await clients[1].call(ev.ROOM_JOIN, {"competition_id": "1; DROP"}, timeout=5))["ok"] is False
            assert (await clients[1].call(ev.ROOM_JOIN, {"competition_id": 999999}, timeout=5))["ok"] is False

            state = await host_rec.wait_for(ev.ROOM_STATE)
            assert state["id"] == cid

            ack = await clients[1].call(ev.PLAYER_READY, {"competition_id": cid, "ready": True}, timeout=5)
            assert ack["ok"] is True
            assert (await host.post(f"/api/competitions/{cid}/start")).status_code == 200

            started = await guest_rec.wait_for(ev.COMPETITION_STARTED)
            assert started["question"]["examples"]
            await guest_rec.wait_for(ev.COMPETITION_COUNTDOWN)

            code = reference_solution(started["question"]["slug"])
            assert (await guest.post(f"/api/competitions/{cid}/submissions", json={"code": code})).status_code == 202

            winner = await host_rec.wait_for(ev.COMPETITION_WINNER)
            assert winner["winner"]["username"] == "sock_guest"
            finished = await host_rec.wait_for(ev.COMPETITION_FINISHED)
            assert finished["reason"] == "solved"
            assert ev.SUBMISSION_RECEIVED in host_rec.names()
            assert ev.SUBMISSION_RESULT in host_rec.names()

            # Disconnecting announces it to the room.
            await clients[1].disconnect()
            gone = await host_rec.wait_for(ev.PLAYER_DISCONNECTED)
            assert gone["competition_id"] == cid
            await clients[0].disconnect()
    finally:
        server.should_exit = True
        await serve_task
        await app_ctx.competitions.shutdown()
        await app_ctx.db.dispose()
