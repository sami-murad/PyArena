from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

FocusEventKind = Literal["hidden", "blur", "visible", "focus", "fullscreen_exit", "paste"]
FocusStatus = Literal["off", "ok", "away", "paused", "frozen", "disqualified"]
FocusAction = Literal["pending", "ignored", "recorded", "warn", "pause", "freeze", "disqualify"]


class FocusEventRequest(BaseModel):
    """A browser signal. ``hidden``/``blur`` start an absence, ``visible``/``focus`` end it."""

    kind: FocusEventKind
    paste_chars: int | None = Field(None, ge=0, le=1_000_000)
    # How long the browser itself measured the absence (sent with visible/focus).
    away_ms: int | None = Field(None, ge=0, le=86_400_000)


class FocusPolicy(BaseModel):
    """The escalation settings, sent to the client so it can explain them."""

    warn_limit: int
    pause_seconds: int
    freeze_seconds: int
    dq_after: int
    grace_ms: int
    paste_limit_chars: int
    heartbeat_seconds: int


class FocusStateOut(BaseModel):
    competition_id: int
    enabled: bool
    acknowledged: bool
    status: FocusStatus
    counted_violations: int
    warnings_left: int
    next_action: FocusAction | None
    paused_until: datetime | None
    frozen_until: datetime | None
    disqualified: bool
    server_time: datetime
    policy: FocusPolicy


class FocusEventResult(BaseModel):
    state: FocusStateOut
    recorded: bool
    counted: bool
    action: FocusAction | None
