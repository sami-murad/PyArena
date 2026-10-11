from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class PracticeSubmissionRequest(BaseModel):
    question_id: int
    code: str = Field(..., min_length=1)


class CompetitionSubmissionRequest(BaseModel):
    code: str = Field(..., min_length=1)


class SubmissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    question_id: int
    competition_id: int | None
    status: str
    passed_count: int
    total_count: int
    feedback: dict[str, Any] | None
    created_at: datetime
    judged_at: datetime | None
    code: str | None = None
