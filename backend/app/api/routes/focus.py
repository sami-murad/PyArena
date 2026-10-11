"""Focus Mode endpoints (v1 only). See app/services/focus.py for the rules."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import Ctx, CurrentUser, rate_limit
from app.schemas.focus import FocusEventRequest, FocusEventResult, FocusStateOut

router = APIRouter(prefix="/competitions/{competition_id}/focus", tags=["focus"])

focus_rate = Depends(rate_limit("focus", "rate_focus_per_minute", 60, per_user=True))


@router.get("", response_model=FocusStateOut)
async def focus_state(competition_id: int, user: CurrentUser, ctx: Ctx) -> FocusStateOut:
    return await ctx.focus.state(user, competition_id)


@router.post("/acknowledge", response_model=FocusStateOut)
async def acknowledge(competition_id: int, user: CurrentUser, ctx: Ctx) -> FocusStateOut:
    """Record that the player read the Focus Mode notice (required before "ready")."""
    return await ctx.focus.acknowledge(user, competition_id)


@router.post("/events", response_model=FocusEventResult, dependencies=[focus_rate])
async def report_event(competition_id: int, body: FocusEventRequest, user: CurrentUser, ctx: Ctx) -> FocusEventResult:
    """Report a browser focus signal. The server times absences and decides what counts."""
    return await ctx.focus.report(user, competition_id, body)


@router.post("/heartbeat", response_model=FocusStateOut, dependencies=[focus_rate])
async def heartbeat(competition_id: int, user: CurrentUser, ctx: Ctx) -> FocusStateOut:
    return await ctx.focus.heartbeat(user, competition_id)
