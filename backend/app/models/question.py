from __future__ import annotations

import enum
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, UTCDateTime, utcnow


class Difficulty(enum.StrEnum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class QuestionMode(enum.StrEnum):
    FUNCTION = "function"  # the judge calls a named function and compares the return value
    STDIO = "stdio"  # the judge feeds stdin and compares stdout


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(120))
    statement: Mapped[str] = mapped_column(Text)
    difficulty: Mapped[str] = mapped_column(String(10), index=True)
    mode: Mapped[str] = mapped_column(String(10))
    function_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    signature: Mapped[str | None] = mapped_column(String(200), nullable=True)
    input_spec: Mapped[str] = mapped_column(Text, default="")
    output_spec: Mapped[str] = mapped_column(Text, default="")
    constraints: Mapped[list[str]] = mapped_column(JSON, default=list)
    starter_code: Mapped[str] = mapped_column(Text)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    cpu_seconds: Mapped[float] = mapped_column(Float, default=2.0)
    memory_mb: Mapped[int] = mapped_column(Integer, default=256)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)

    test_cases: Mapped[list[TestCase]] = relationship(
        back_populates="question", order_by="TestCase.ordinal", cascade="all, delete-orphan"
    )


class TestCase(Base):
    """A single judge test.  ``is_public`` tests double as visible examples.

    For function problems ``input`` is the JSON list of positional arguments and
    ``expected`` is the JSON return value.  For stdio problems both are strings.
    Hidden tests (``is_public = False``) are never returned by any public API.
    """

    __tablename__ = "test_cases"
    __table_args__ = (UniqueConstraint("question_id", "ordinal", name="uq_test_cases_question_ordinal"),)
    __test__ = False  # stop pytest from collecting this class

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"), index=True)
    ordinal: Mapped[int] = mapped_column(Integer)
    input: Mapped[Any] = mapped_column(JSON)
    expected: Mapped[Any] = mapped_column(JSON)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)
    note: Mapped[str | None] = mapped_column(String(300), nullable=True)

    question: Mapped[Question] = relationship(back_populates="test_cases")
