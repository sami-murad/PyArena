"""Two API processes behind one Redis: a player on each, one shared match.

Proves the Redis Socket.IO adapter (events cross processes), Redis presence
(each side sees the other online) and the shared database state. Needs a real
Redis server: set ``REDIS_TEST_URL`` (for example redis://localhost:6379/14).
"""

import asyncio
import os
from typing import Any

import httpx
import pytest
import socketio
import uvicorn
from redis.asyncio import Redis

from app.core.context import AppContext, build_context
from app.core.database import Database
from app.main import create_fastapi_app
from app.websocket import events as ev
from app.websocket.server import SocketIOBus, create_socket_server, register_handlers
from tests.conftest import SandboxExecutor, make_settings, reference_solution
from tests.test_socket import Recorder, free_port

REDIS_URL = os.getenv("REDIS_TEST_URL", "")
pytestmark = pytest.mark.skipif(not REDIS_URL, reason="set REDIS_TEST_URL to run the multi-process test")


async def start_replica(db_url: str) -> tuple[uvicorn.Server, asyncio.Task[None], AppContext, str]:
    settings = make_settings(database_url=db_url, redis_url=REDIS_URL)
    sio = create_socket_server(["http://127.0.0.1"], REDIS_URL)
    ctx = build_context(settings, SandboxExecutor(), SocketIOBus(sio), db=Database(db_url))
    asgi = socketio.ASGIApp(sio, other_asgi_app=create_fastapi_app(ctx, start_background=False))
    register_handlers(sio, ctx)
    port = free_port()
    server = uvicorn.Server(uvicorn.Config(asgi, host="127.0.0.1", port=port, log_level="warning", lifespan="off"))
    task = asyncio.create_task(server.serve())
    while not server.started:
        await asyncio.sleep(0.05)
    return server, task, ctx, f"http://127.0.0.1:{port}"


async def connect(base: str, client: httpx.AsyncClient, cid: int) -> tuple[socketio.AsyncClient, Recorder]:
    sc = socketio.AsyncClient()
    recorder = Recorder(sc)
    cookie = "; ".join(f"{k}={v}" for k, v in client.cookies.items())
    await sc.connect(base, headers={"Cookie": cookie}, transports=["websocket"], wait_timeout=5)
    ack = await sc.call(ev.ROOM_JOIN, {"competition_id": cid}, timeout=5)
    assert ack["ok"] is True
    return sc, recorder


async def test_two_replicas_share_one_match(ctx, db_url: str) -> None:  # type: ignore[no-untyped-def]
    flush = Redis.from_url(REDIS_URL)
    await flush.flushdb()
    await flush.aclose()

    server_a, task_a, ctx_a, base_a = await start_replica(db_url)
    server_b, task_b, ctx_b, base_b = await start_replica(db_url)
    sockets: list[socketio.AsyncClient] = []
    try:
        async with httpx.AsyncClient(base_url=base_a) as host, httpx.AsyncClient(base_url=base_b) as guest:
            for c, name in ((host, "replica_host"), (guest, "replica_guest")):
                r = await c.post(
                    "/api/v1/auth/register",
                    json={"username": name, "email": f"{name}@pyarena.dev", "password": "password-123"},
                )
                assert r.status_code == 201
            room = (await host.post("/api/v1/competitions", json={"difficulty": "easy"})).json()
            cid = room["id"]
            assert (await guest.post("/api/v1/competitions/join", json={"code": room["code"]})).status_code == 200

            host_sock, host_rec = await connect(base_a, host, cid)  # connected to replica A
            guest_sock, guest_rec = await connect(base_b, guest, cid)  # connected to replica B
            sockets += [host_sock, guest_sock]

            # Presence is shared: replica A reports the guest (connected to B) online.
            state = (await host.get(f"/api/v1/competitions/{cid}")).json()
            assert {p["username"]: p["online"] for p in state["participants"]} == {
                "replica_host": True,
                "replica_guest": True,
            }

            await guest.post(f"/api/v1/competitions/{cid}/ready", json={"ready": True})
            assert (await host.post(f"/api/v1/competitions/{cid}/start")).status_code == 200  # on A

            # The start happened on A; the guest's socket lives on B and still hears it.
            started: dict[str, Any] = await guest_rec.wait_for(ev.COMPETITION_STARTED)
            code = reference_solution(started["question"]["slug"])

            # The guest submits on B; B judges; the host on A hears the winner.
            assert (await guest.post(f"/api/v1/competitions/{cid}/submissions", json={"code": code})).status_code == 202
            winner = await host_rec.wait_for(ev.COMPETITION_WINNER, timeout=30)
            assert winner["winner"]["username"] == "replica_guest"
            final = (await host.get(f"/api/v1/competitions/{cid}")).json()
            assert final["status"] == "FINISHED"
            assert len([e for e, _ in host_rec.events if e == ev.COMPETITION_WINNER]) == 1
    finally:
        for sc in sockets:
            await sc.disconnect()
        for server in (server_a, server_b):
            server.should_exit = True
        await asyncio.gather(task_a, task_b)
        for app_ctx in (ctx_a, ctx_b):
            await app_ctx.close()
