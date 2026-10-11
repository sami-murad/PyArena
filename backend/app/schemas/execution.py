from __future__ import annotations

from pydantic import BaseModel, Field


class ExecuteRequest(BaseModel):
    code: str = Field(..., min_length=1)
    stdin: str = ""


class ExplanationOut(BaseModel):
    title: str
    summary: str
    tips: list[str]
    line: int | None = None


class ExecuteResponse(BaseModel):
    status: str = Field(..., description="OK, SYNTAX_ERROR, RUNTIME_ERROR, TIMEOUT, MEMORY_LIMIT or OUTPUT_LIMIT")
    stdout: str
    stderr: str
    exit_code: int | None
    duration_ms: int
    truncated: bool
    error_type: str | None
    explanation: ExplanationOut | None
