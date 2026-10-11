from httpx import AsyncClient
from sqlalchemy import select, update

from app.core.context import AppContext
from app.core.database import utcnow
from app.models import SavedSnippet, User
from tests.conftest import register

V1 = "/api/v1"


async def test_deleted_snippet_is_hidden_but_kept(client: AsyncClient, ctx: AppContext) -> None:
    await register(client, "soft_snip")
    sid = (await client.post(f"{V1}/snippets", json={"title": "keep me", "code": "x"})).json()["id"]
    assert (await client.delete(f"{V1}/snippets/{sid}")).status_code == 204
    assert (await client.get(f"{V1}/snippets")).json() == []
    assert (await client.get(f"{V1}/snippets/{sid}")).status_code == 404
    assert (await client.put(f"{V1}/snippets/{sid}", json={"title": "x", "code": ""})).status_code == 404
    async with ctx.db.sessionmaker() as s:
        row = (await s.execute(select(SavedSnippet).where(SavedSnippet.id == sid))).scalar_one()
    assert row.deleted_at is not None


async def test_deleted_user_cannot_sign_in_or_use_a_session(client: AsyncClient, ctx: AppContext) -> None:
    await register(client, "soft_user")
    async with ctx.db.sessionmaker() as s:
        await s.execute(update(User).where(User.username == "soft_user").values(deleted_at=utcnow()))
        await s.commit()
    assert (await client.get(f"{V1}/users/me")).status_code == 401  # existing cookie stops working
    login = await client.post(f"{V1}/auth/login", json={"login": "soft_user", "password": "correct-horse-1"})
    assert login.status_code == 401
    again = await client.post(
        f"{V1}/auth/register", json={"username": "soft_user", "email": "new@pyarena.dev", "password": "longenough1"}
    )
    assert again.status_code == 409  # the name stays reserved
