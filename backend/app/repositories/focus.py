from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FocusSession, FocusViolation


class FocusRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, competition_id: int, user_id: int) -> FocusSession | None:
        stmt = (
            select(FocusSession)
            .where(FocusSession.competition_id == competition_id, FocusSession.user_id == user_id)
            .execution_options(populate_existing=True)
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def get_or_create(self, competition_id: int, user_id: int) -> FocusSession:
        existing = await self.get(competition_id, user_id)
        if existing is not None:
            return existing
        created = FocusSession(competition_id=competition_id, user_id=user_id, counted_violations=0)
        self.session.add(created)
        await self.session.flush()
        return created

    async def for_competition(self, competition_id: int) -> dict[int, FocusSession]:
        stmt = select(FocusSession).where(FocusSession.competition_id == competition_id)
        return {s.user_id: s for s in (await self.session.execute(stmt)).scalars()}

    async def add_violation(self, violation: FocusViolation) -> FocusViolation:
        self.session.add(violation)
        await self.session.flush()
        return violation

    async def open_violation(self, session_id: int) -> FocusViolation | None:
        """The away-violation that started but has not ended yet, if any."""
        stmt = (
            select(FocusViolation)
            .where(FocusViolation.session_id == session_id, FocusViolation.ended_at.is_(None))
            .order_by(FocusViolation.id.desc())
            .limit(1)
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def violations(self, session_id: int) -> list[FocusViolation]:
        stmt = select(FocusViolation).where(FocusViolation.session_id == session_id).order_by(FocusViolation.id)
        return list((await self.session.execute(stmt)).scalars())
