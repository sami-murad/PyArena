from __future__ import annotations

import secrets
from datetime import datetime

from sqlalchemy import CursorResult, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utcnow
from app.models import Competition, CompetitionPlayer, CompetitionStatus

# 31 unambiguous characters (no 0/O, 1/I/L).  8 characters ≈ 8.5e11 codes.
CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
CODE_LENGTH = 8


def generate_room_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


class CompetitionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, competition_id: int) -> Competition | None:
        stmt = select(Competition).where(Competition.id == competition_id).execution_options(populate_existing=True)
        return (await self.session.execute(stmt)).unique().scalar_one_or_none()

    async def by_code(self, code: str) -> Competition | None:
        stmt = select(Competition).where(Competition.code == code.upper().strip())
        return (
            (await self.session.execute(stmt.execution_options(populate_existing=True))).unique().scalar_one_or_none()
        )

    async def code_exists(self, code: str) -> bool:
        return (await self.session.scalar(select(Competition.id).where(Competition.code == code))) is not None

    async def for_user(self, user_id: int, limit: int = 20) -> list[Competition]:
        stmt = (
            select(Competition)
            .join(CompetitionPlayer, CompetitionPlayer.competition_id == Competition.id)
            .where(CompetitionPlayer.user_id == user_id)
            .order_by(Competition.id.desc())
            .limit(limit)
        )
        return list((await self.session.execute(stmt)).unique().scalars())

    async def ids_in_status(self, statuses: tuple[str, ...]) -> list[int]:
        stmt = select(Competition.id).where(Competition.status.in_(statuses))
        return list((await self.session.execute(stmt)).scalars())

    async def membership(self, competition_id: int, user_id: int) -> CompetitionPlayer | None:
        stmt = select(CompetitionPlayer).where(
            CompetitionPlayer.competition_id == competition_id, CompetitionPlayer.user_id == user_id
        )
        return (
            (await self.session.execute(stmt.execution_options(populate_existing=True))).unique().scalar_one_or_none()
        )

    async def transition(self, competition_id: int, from_status: str, **values: object) -> bool:
        """Compare-and-set status change.  Returns False if another request won the race."""
        stmt = (
            update(Competition)
            .where(Competition.id == competition_id, Competition.status == from_status)
            .values(**values)
            .execution_options(synchronize_session=False)
        )
        result = await self.session.execute(stmt)
        return isinstance(result, CursorResult) and result.rowcount == 1

    async def claim_winner(self, competition_id: int, submission_id: int, user_id: int, submitted_at: datetime) -> bool:
        """Atomically record the winner.

        A single conditional UPDATE: it only matches while the competition is
        RUNNING, has no winner yet, and the submission arrived before the
        deadline.  The database guarantees at most one such UPDATE succeeds, so
        duplicate requests, retries or concurrent judges cannot create two
        winners.
        """
        now = utcnow()
        stmt = (
            update(Competition)
            .where(
                Competition.id == competition_id,
                Competition.status == CompetitionStatus.RUNNING,
                Competition.winner_submission_id.is_(None),
                Competition.ends_at >= submitted_at,
            )
            .values(
                status=CompetitionStatus.FINISHED,
                winner_user_id=user_id,
                winner_submission_id=submission_id,
                winner_accepted_at=now,
                finished_at=now,
                finish_reason="solved",
            )
            .execution_options(synchronize_session=False)
        )
        result = await self.session.execute(stmt)
        return isinstance(result, CursorResult) and result.rowcount == 1
