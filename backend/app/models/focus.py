"""Focus Mode: per-player focus state in a competition, and the event log.

Focus Mode only *detects* that a player left the competition tab (the browser
reports it); it never blocks the browser. The server decides what counts and
how it escalates (docs/adr/0006-focus-mode-design.md).
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, UTCDateTime, utcnow


class FocusSession(Base):
    """One player's Focus Mode state in one competition."""

    __tablename__ = "focus_sessions"
    __table_args__ = (UniqueConstraint("competition_id", "user_id", name="uq_focus_sessions_member"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    competition_id: Mapped[int] = mapped_column(ForeignKey("competitions.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    # The player read and accepted the Focus Mode notice for this competition.
    acknowledged_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    counted_violations: Mapped[int] = mapped_column(Integer, default=0)
    paused_until: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    frozen_until: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    disqualified_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    # Set while the tab is hidden or the window lost focus; timed by the server.
    away_since: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    away_kind: Mapped[str | None] = mapped_column(String(20), nullable=True)
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)


class FocusViolation(Base):
    """Every reported focus event that the server recorded, counted or not."""

    __tablename__ = "focus_violations"
    __table_args__ = (Index("ix_focus_violations_session_id_id", "session_id", "id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("focus_sessions.id", ondelete="CASCADE"))
    # hidden | blur | paste | fullscreen_exit | heartbeat_gap
    kind: Mapped[str] = mapped_column(String(20))
    started_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    counted: Mapped[bool] = mapped_column(Boolean, default=False)
    # pending | ignored | recorded | warn | pause | freeze | disqualify
    action: Mapped[str] = mapped_column(String(12), default="pending")
    detail: Mapped[str | None] = mapped_column(String(200), nullable=True)
