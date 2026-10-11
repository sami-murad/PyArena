from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PracticeSubmissionRequest(BaseModel):
    question_id: int
    code: str = Field(..., min_length=1)


class CompetitionSubmissionRequest(BaseModel):
    code: str = Field(..., min_length=1)


class SubmissionFeedback(BaseModel):
    """What the judge tells the player about a verdict (app/services/judge.py).

    Hidden tests only ever fill ``message``, ``failed_test``, ``total_tests``,
    ``is_public`` and ``error_type``; inputs and outputs appear for example
    tests only. Typed here so the frontend contract covers it.
    """

    message: str | None = None
    failed_test: int | None = None
    total_tests: int | None = None
    is_public: bool | None = None
    error_type: str | None = None
    input: str | None = None
    expected: str | None = None
    actual: str | None = None
    stdout: str | None = None
    stderr: str | None = None


class SubmissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    question_id: int
    competition_id: int | None
    status: str
    passed_count: int
    total_count: int
    feedback: SubmissionFeedback | None
    created_at: datetime
    judged_at: datetime | None
    code: str | None = None
