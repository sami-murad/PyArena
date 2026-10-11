from __future__ import annotations

import secrets

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Question, TestCase


class QuestionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_active(self, difficulty: str | None = None) -> list[Question]:
        stmt = select(Question).where(Question.is_active.is_(True)).order_by(Question.id)
        if difficulty:
            stmt = stmt.where(Question.difficulty == difficulty)
        return list((await self.session.execute(stmt)).scalars())

    async def get(self, question_id: int, with_tests: bool = True) -> Question | None:
        stmt = select(Question).where(Question.id == question_id)
        if with_tests:
            stmt = stmt.options(selectinload(Question.test_cases))
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def tests_for(self, question_id: int) -> list[TestCase]:
        stmt = select(TestCase).where(TestCase.question_id == question_id).order_by(TestCase.ordinal)
        return list((await self.session.execute(stmt)).scalars())

    async def random_active(self, difficulty: str | None) -> Question | None:
        ids = list(
            (
                await self.session.execute(
                    select(Question.id).where(
                        Question.is_active.is_(True), *([Question.difficulty == difficulty] if difficulty else [])
                    )
                )
            ).scalars()
        )
        if not ids:
            return None
        return await self.get(secrets.choice(ids))
