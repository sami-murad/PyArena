"""Practice submissions (outside competitions), judged synchronously."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import utcnow
from app.core.metrics import observe_submission
from app.dependencies import Ctx, CurrentUser, Session, rate_limit
from app.repositories.questions import QuestionRepository
from app.repositories.submissions import SubmissionRepository
from app.schemas.submissions import PracticeSubmissionRequest, SubmissionOut

router = APIRouter(prefix="/submissions", tags=["submissions"])


@router.post(
    "",
    response_model=SubmissionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("submit", "rate_submit_per_minute", 60, per_user=True))],
)
async def submit_practice(
    body: PracticeSubmissionRequest, user: CurrentUser, ctx: Ctx, session: Session
) -> SubmissionOut:
    if len(body.code) > ctx.settings.max_code_chars:
        raise HTTPException(422, f"Code is limited to {ctx.settings.max_code_chars} characters.")
    question = await QuestionRepository(session).get(body.question_id)
    if question is None or not question.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Question not found.")
    repo = SubmissionRepository(session)
    submission = await repo.create(user.id, question.id, body.code)
    await session.commit()

    outcome = await ctx.judge.judge(question, body.code, list(question.test_cases))
    submission.status = outcome.status
    submission.passed_count = outcome.passed
    submission.total_count = outcome.total
    submission.feedback = outcome.feedback
    submission.judged_at = utcnow()
    await session.commit()
    observe_submission("practice", submission)
    return SubmissionOut.model_validate(submission)


@router.get("", response_model=list[SubmissionOut])
async def my_submissions(user: CurrentUser, session: Session, question_id: int | None = None) -> list[SubmissionOut]:
    items = await SubmissionRepository(session).list_for_user(user.id, question_id)
    return [SubmissionOut.model_validate(s) for s in items]


@router.get("/{submission_id}", response_model=SubmissionOut)
async def get_submission(submission_id: int, user: CurrentUser, session: Session) -> SubmissionOut:
    submission = await SubmissionRepository(session).get(submission_id)
    if submission is None or submission.user_id != user.id:
        # Object-level authorization: other users' submissions look nonexistent.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Submission not found.")
    out = SubmissionOut.model_validate(submission)
    out.code = submission.code
    return out
