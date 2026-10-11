from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SnippetIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    code: str = Field(..., max_length=20_000)
    stdin: str = Field("", max_length=10_000)


class SnippetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    code: str
    stdin: str
    created_at: datetime
    updated_at: datetime
