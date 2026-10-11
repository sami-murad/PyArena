from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, UTCDateTime, utcnow
from app.models.user import User


class CompetitionStatus(enum.StrEnum):
    WAITING = "WAITING"  # lobby open, players joining and readying up
    COUNTDOWN = "COUNTDOWN"  # question chosen, start time fixed by the server
    RUNNING = "RUNNING"  # submissions accepted
    FINISHED = "FINISHED"  # a winner was recorded, or time ran out
    CANCELLED = "CANCELLED"  # host cancelled or everyone left before the start
    EXPIRED = "EXPIRED"  # lobby idle for too long


ACTIVE_STATUSES = (CompetitionStatus.WAITING, CompetitionStatus.COUNTDOWN, CompetitionStatus.RUNNING)


class Competition(Base):
    __tablename__ = "competitions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    host_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[str] = mapped_column(String(12), default=CompetitionStatus.WAITING, index=True)
    difficulty: Mapped[str | None] = mapped_column(String(10), nullable=True)
    question_id: Mapped[int | None] = mapped_column(ForeignKey("questions.id"), nullable=True)
    max_players: Mapped[int] = mapped_column(Integer, default=8)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=900)
    # Focus Mode: the host chose to have tab switches detected and escalated.
    focus_mode: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    last_activity_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    starts_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    finish_reason: Mapped[str | None] = mapped_column(String(20), nullable=True)
    winner_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    winner_submission_id: Mapped[int | None] = mapped_column(
        ForeignKey("submissions.id", use_alter=True, name="fk_competitions_winner_submission"), nullable=True
    )
    winner_accepted_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)

    host: Mapped[User] = relationship(foreign_keys=[host_id], lazy="joined")
    winner: Mapped[User | None] = relationship(foreign_keys=[winner_user_id], lazy="joined")
    players: Mapped[list[CompetitionPlayer]] = relationship(
        back_populates="competition", order_by="CompetitionPlayer.joined_at", lazy="selectin"
    )


class CompetitionPlayer(Base):
    __tablename__ = "competition_players"
    __table_args__ = (UniqueConstraint("competition_id", "user_id", name="uq_competition_players_member"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    competition_id: Mapped[int] = mapped_column(ForeignKey("competitions.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    joined_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    is_ready: Mapped[bool] = mapped_column(Boolean, default=False)
    left_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)

    competition: Mapped[Competition] = relationship(back_populates="players")
    user: Mapped[User] = relationship(lazy="joined")

    @property
    def active(self) -> bool:
        return self.left_at is None
