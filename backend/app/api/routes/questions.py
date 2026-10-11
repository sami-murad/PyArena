from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException, status

from app.dependencies import Session
from app.repositories.questions import QuestionRepository
from app.schemas.questions import QuestionDetail, QuestionSummary
from app.services.questions import to_detail, to_summary

router = APIRouter(prefix="/questions", tags=["questions"])


@router.get("", response_model=list[QuestionSummary])
async def list_questions(
    session: Session, difficulty: Literal["easy", "medium", "hard"] | None = None
) -> list[QuestionSummary]:
    return [to_summary(q) for q in await QuestionRepository(session).list_active(difficulty)]


@router.get("/{question_id}", response_model=QuestionDetail)
async def get_question(question_id: int, session: Session) -> QuestionDetail:
    question = await QuestionRepository(session).get(question_id)
    if question is None or not question.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Question not found.")
    # Practice view: public examples only.  Hidden tests are never serialized.
    return to_detail(question, list(question.test_cases))
