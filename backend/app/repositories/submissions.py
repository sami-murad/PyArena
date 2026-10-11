from __future__ import annotations

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utcnow
from app.models import Submission, SubmissionStatus


class SubmissionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, user_id: int, question_id: int, code: str, competition_id: int | None = None) -> Submission:
        submission = Submission(
            user_id=user_id, question_id=question_id, code=code, competition_id=competition_id, created_at=utcnow()
        )
        self.session.add(submission)
        await self.session.flush()
        return submission

    async def get(self, submission_id: int) -> Submission | None:
        return await self.session.get(Submission, submission_id, populate_existing=True)

    async def list_for_user(self, user_id: int, question_id: int | None = None, limit: int = 50) -> list[Submission]:
        stmt = select(Submission).where(Submission.user_id == user_id)
        if question_id is not None:
            stmt = stmt.where(Submission.question_id == question_id)
        stmt = stmt.order_by(Submission.id.desc()).limit(limit)
        return list((await self.session.execute(stmt)).scalars())

    async def for_competition(self, competition_id: int) -> list[Submission]:
        stmt = select(Submission).where(Submission.competition_id == competition_id).order_by(Submission.id)
        return list((await self.session.execute(stmt)).scalars())

    async def next_pending(self, competition_id: int) -> Submission | None:
        """The oldest pending submission: judging happens strictly in server-receipt order."""
        stmt = (
            select(Submission)
            .where(Submission.competition_id == competition_id, Submission.status == SubmissionStatus.PENDING)
            .order_by(Submission.id)
            .limit(1)
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def count_pending(self, competition_id: int, user_id: int | None = None) -> int:
        stmt = select(func.count()).where(
            Submission.competition_id == competition_id, Submission.status == SubmissionStatus.PENDING
        )
        if user_id is not None:
            stmt = stmt.where(Submission.user_id == user_id)
        return int(await self.session.scalar(stmt) or 0)

    async def cancel_pending(self, competition_id: int) -> list[int]:
        ids = list(
            (
                await self.session.execute(
                    select(Submission.id).where(
                        Submission.competition_id == competition_id, Submission.status == SubmissionStatus.PENDING
                    )
                )
            ).scalars()
        )
        if ids:
            await self.session.execute(
                update(Submission)
                .where(Submission.id.in_(ids))
                .values(
                    status=SubmissionStatus.CANCELLED,
                    judged_at=utcnow(),
                    feedback={"message": "The competition ended before this submission was judged."},
                )
            )
        return ids
