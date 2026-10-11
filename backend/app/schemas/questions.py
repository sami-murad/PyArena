from __future__ import annotations

from pydantic import BaseModel


class ExampleOut(BaseModel):
    input: str
    output: str
    note: str | None = None


class QuestionSummary(BaseModel):
    id: int
    slug: str
    title: str
    difficulty: str
    mode: str


class QuestionDetail(QuestionSummary):
    statement: str
    function_name: str | None
    signature: str | None
    input_spec: str
    output_spec: str
    constraints: list[str]
    starter_code: str
    examples: list[ExampleOut]
    explanation: str | None = None  # only included once a competition is over
    time_limit_seconds: float
    memory_limit_mb: int
    total_tests: int
