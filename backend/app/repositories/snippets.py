from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SavedSnippet


class SnippetRepository:
    """Every query is scoped to the owner, so one user can never read another's snippets."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_for(self, user_id: int) -> list[SavedSnippet]:
        stmt = select(SavedSnippet).where(SavedSnippet.user_id == user_id).order_by(SavedSnippet.updated_at.desc())
        return list((await self.session.execute(stmt)).scalars())

    async def get_owned(self, snippet_id: int, user_id: int) -> SavedSnippet | None:
        stmt = select(SavedSnippet).where(SavedSnippet.id == snippet_id, SavedSnippet.user_id == user_id)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def count_for(self, user_id: int) -> int:
        return len(await self.list_for(user_id))

    async def create(self, user_id: int, title: str, code: str, stdin: str) -> SavedSnippet:
        snippet = SavedSnippet(user_id=user_id, title=title, code=code, stdin=stdin)
        self.session.add(snippet)
        await self.session.flush()
        return snippet

    async def delete(self, snippet: SavedSnippet) -> None:
        await self.session.delete(snippet)
