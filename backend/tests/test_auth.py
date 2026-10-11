from httpx import AsyncClient
from sqlalchemy import select

from app.core.context import AppContext
from app.models import User
from tests.conftest import register


async def test_health_reports_dependencies(client: AsyncClient) -> None:
    r = await client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["checks"]["database"] == "ok"
    assert body["checks"]["executor"] == "ok"


async def test_register_login_me_logout(client: AsyncClient, ctx: AppContext) -> None:
    user = await register(client, "ada")
    assert user["username"] == "ada"
    assert "password" not in user and "password_hash" not in user

    me = await client.get("/api/users/me")
    assert me.status_code == 200 and me.json()["username"] == "ada"

    cookie = client.cookies.get(ctx.settings.session_cookie_name)
    assert cookie

    r = await client.post("/api/auth/logout")
    assert r.status_code == 204
    client.cookies.clear()
    assert (await client.get("/api/users/me")).status_code == 401

    bad = await client.post("/api/auth/login", json={"login": "ada", "password": "wrong-password"})
    assert bad.status_code == 401
    unknown = await client.post("/api/auth/login", json={"login": "nobody", "password": "wrong-password"})
    assert unknown.status_code == 401
    assert bad.json()["detail"] == unknown.json()["detail"]  # no account enumeration

    ok = await client.post("/api/auth/login", json={"login": "ADA@pyarena.dev", "password": "correct-horse-1"})
    assert ok.status_code == 200
    assert (await client.get("/api/users/me")).json()["username"] == "ada"


async def test_password_is_hashed_with_argon2id(client: AsyncClient, ctx: AppContext) -> None:
    await register(client, "grace", password="super-secret-pass")
    async with ctx.db.sessionmaker() as s:
        user = (await s.execute(select(User).where(User.username == "grace"))).scalar_one()
    assert user.password_hash.startswith("$argon2id$")
    assert "super-secret-pass" not in user.password_hash


async def test_duplicate_and_invalid_registration(client: AsyncClient) -> None:
    await register(client, "linus")
    dup = await client.post(
        "/api/auth/register", json={"username": "LINUS", "email": "other@pyarena.dev", "password": "longenough1"}
    )
    assert dup.status_code == 409
    short = await client.post(
        "/api/auth/register", json={"username": "x", "email": "x@pyarena.dev", "password": "longenough1"}
    )
    assert short.status_code == 422
    weak = await client.post(
        "/api/auth/register", json={"username": "valid_name", "email": "v@pyarena.dev", "password": "short"}
    )
    assert weak.status_code == 422


async def test_tampered_cookie_is_rejected(client: AsyncClient, ctx: AppContext) -> None:
    await register(client, "mallory")
    token = client.cookies.get(ctx.settings.session_cookie_name)
    assert token
    client.cookies.set(ctx.settings.session_cookie_name, token[:-3] + "abc")
    assert (await client.get("/api/users/me")).status_code == 401


async def test_cross_site_post_is_blocked(client: AsyncClient) -> None:
    await register(client, "victim")
    r = await client.post(
        "/api/snippets", json={"title": "x", "code": "print(1)"}, headers={"Origin": "https://evil.example"}
    )
    assert r.status_code == 403
    ok = await client.post(
        "/api/snippets", json={"title": "x", "code": "print(1)"}, headers={"Origin": "http://localhost:5173"}
    )
    assert ok.status_code == 201


async def test_login_rate_limit(make_client, ctx: AppContext) -> None:  # type: ignore[no-untyped-def]
    ctx.settings.rate_login_per_minute = 3
    c = make_client()
    codes = [(await c.post("/api/auth/login", json={"login": "nobody", "password": "x"})).status_code for _ in range(5)]
    assert codes[:3] == [401, 401, 401]
    assert codes[3:] == [429, 429]
