from __future__ import annotations

import enum
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, UTCDateTime, utcnow
from app.models.user import User


class SubmissionStatus(enum.StrEnum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    WRONG_ANSWER = "WRONG_ANSWER"
    SYNTAX_ERROR = "SYNTAX_ERROR"
    RUNTIME_ERROR = "RUNTIME_ERROR"
    TIMEOUT = "TIMEOUT"
    MEMORY_LIMIT = "MEMORY_LIMIT"
    OUTPUT_LIMIT = "OUTPUT_LIMIT"
    SYSTEM_ERROR = "SYSTEM_ERROR"  # infrastructure failure, not the participant's fault
    CANCELLED = "CANCELLED"  # competition ended before this submission was judged


class Submission(Base):
    __tablename__ = "submissions"
    __table_args__ = (Index("ix_submissions_competition_id_id", "competition_id", "id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id"), index=True)
    competition_id: Mapped[int | None] = mapped_column(ForeignKey("competitions.id", ondelete="CASCADE"), nullable=True)
    code: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default=SubmissionStatus.PENDING, index=True)
    passed_count: Mapped[int] = mapped_column(Integer, default=0)
    total_count: Mapped[int] = mapped_column(Integer, default=0)
    # Participant-safe feedback only.  Never contains hidden inputs or outputs.
    feedback: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    judged_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)

    user: Mapped[User] = relationship(lazy="joined")


# "My submissions" lists are newest first per user.
Index("ix_submissions_user_id_created_at_desc", Submission.user_id, Submission.created_at.desc())
