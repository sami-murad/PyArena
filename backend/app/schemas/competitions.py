from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.questions import QuestionDetail


class CreateCompetitionRequest(BaseModel):
    difficulty: Literal["easy", "medium", "hard", "any"] = "any"
    max_players: int = Field(4, ge=2, le=16)
    duration_minutes: int = Field(15, ge=3, le=60)


class JoinCompetitionRequest(BaseModel):
    code: str = Field(..., min_length=4, max_length=12)


class ReadyRequest(BaseModel):
    ready: bool


class ParticipantOut(BaseModel):
    user_id: int
    username: str
    is_host: bool
    is_ready: bool
    online: bool
    attempts: int
    has_pending: bool


class WinnerOut(BaseModel):
    user_id: int
    username: str
    submission_id: int
    accepted_at: datetime
    solve_seconds: float


class CompetitionState(BaseModel):
    id: int
    code: str
    status: str
    host_id: int
    difficulty: str | None
    max_players: int
    min_players: int
    duration_seconds: int
    created_at: datetime
    starts_at: datetime | None
    ends_at: datetime | None
    finished_at: datetime | None
    finish_reason: str | None
    server_time: datetime
    participants: list[ParticipantOut]
    question: QuestionDetail | None
    winner: WinnerOut | None
    can_start: bool
    start_blockers: list[str]


class CompetitionListItem(BaseModel):
    id: int
    code: str
    status: str
    difficulty: str | None
    created_at: datetime
    player_count: int
    is_host: bool
    won: bool


class PlayerResult(BaseModel):
    user_id: int
    username: str
    attempts: int
    solved: bool
    is_winner: bool
    best_status: str | None
    solve_seconds: float | None


class ResultSubmission(BaseModel):
    id: int
    username: str
    status: str
    passed_count: int
    total_count: int
    seconds_after_start: float | None
    is_winning: bool


class CompetitionResults(BaseModel):
    competition: CompetitionState
    players: list[PlayerResult]
    timeline: list[ResultSubmission]
    tie_break_rule: str
