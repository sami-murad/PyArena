from __future__ import annotations

from sqlalchemy import distinct, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Competition, CompetitionPlayer, Submission, SubmissionStatus, User


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, user_id: int) -> User | None:
        return await self.session.get(User, user_id)

    async def by_login(self, login: str) -> User | None:
        stmt = select(User).where(or_(User.username == login, User.email == login.lower()))
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def exists(self, username: str, email: str) -> tuple[bool, bool]:
        username_taken = await self.session.scalar(
            select(func.count()).select_from(User).where(func.lower(User.username) == username.lower())
        )
        email_taken = await self.session.scalar(select(func.count()).select_from(User).where(User.email == email))
        return bool(username_taken), bool(email_taken)

    async def create(self, username: str, email: str, password_hash: str) -> User:
        user = User(username=username, email=email, password_hash=password_hash)
        self.session.add(user)
        await self.session.flush()
        return user

    async def statistics(self, user_id: int) -> dict[str, int]:
        played = await self.session.scalar(
            select(func.count())
            .select_from(CompetitionPlayer)
            .join(Competition, Competition.id == CompetitionPlayer.competition_id)
            .where(CompetitionPlayer.user_id == user_id, Competition.starts_at.is_not(None))
        )
        won = await self.session.scalar(
            select(func.count()).select_from(Competition).where(Competition.winner_user_id == user_id)
        )
        total = await self.session.scalar(
            select(func.count()).select_from(Submission).where(Submission.user_id == user_id)
        )
        accepted = await self.session.scalar(
            select(func.count())
            .select_from(Submission)
            .where(Submission.user_id == user_id, Submission.status == SubmissionStatus.ACCEPTED)
        )
        solved = await self.session.scalar(
            select(func.count(distinct(Submission.question_id))).where(
                Submission.user_id == user_id, Submission.status == SubmissionStatus.ACCEPTED
            )
        )
        return {
            "competitions_played": played or 0,
            "competitions_won": won or 0,
            "submissions_total": total or 0,
            "submissions_accepted": accepted or 0,
            "questions_solved": solved or 0,
        }
