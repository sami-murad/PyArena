from __future__ import annotations

from fastapi import APIRouter

from app.dependencies import CurrentUser, Session
from app.repositories.users import UserRepository
from app.schemas.users import UserOut, UserStatistics

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)


@router.get("/me/statistics", response_model=UserStatistics)
async def my_statistics(user: CurrentUser, session: Session) -> UserStatistics:
    stats = await UserRepository(session).statistics(user.id)
    total = stats["submissions_total"]
    rate = round(stats["submissions_accepted"] / total, 3) if total else 0.0
    return UserStatistics(**stats, acceptance_rate=rate)
