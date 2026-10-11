from __future__ import annotations

from fastapi import APIRouter, Depends, status

from app.dependencies import Ctx, CurrentUser, rate_limit
from app.schemas.competitions import (
    CompetitionListItem,
    CompetitionResults,
    CompetitionState,
    CreateCompetitionRequest,
    JoinCompetitionRequest,
    ReadyRequest,
)
from app.schemas.submissions import CompetitionSubmissionRequest, SubmissionOut

router = APIRouter(prefix="/competitions", tags=["competitions"])


@router.post("", response_model=CompetitionState, status_code=status.HTTP_201_CREATED)
async def create_competition(body: CreateCompetitionRequest, user: CurrentUser, ctx: Ctx) -> CompetitionState:
    cid = await ctx.competitions.create(user, body)
    return await ctx.competitions.state(cid, user.id)


@router.get("", response_model=list[CompetitionListItem])
async def my_competitions(user: CurrentUser, ctx: Ctx) -> list[CompetitionListItem]:
    return await ctx.competitions.list_for_user(user.id)


@router.post(
    "/join",
    response_model=CompetitionState,
    dependencies=[Depends(rate_limit("join", "rate_join_per_minute", 60, per_user=True))],
)
async def join_by_code(body: JoinCompetitionRequest, user: CurrentUser, ctx: Ctx) -> CompetitionState:
    cid = await ctx.competitions.join_by_code(user, body.code)
    return await ctx.competitions.state(cid, user.id)


@router.get("/{competition_id}", response_model=CompetitionState)
async def get_competition(competition_id: int, user: CurrentUser, ctx: Ctx) -> CompetitionState:
    return await ctx.competitions.state(competition_id, user.id)


@router.post("/{competition_id}/ready", response_model=CompetitionState)
async def set_ready(competition_id: int, body: ReadyRequest, user: CurrentUser, ctx: Ctx) -> CompetitionState:
    await ctx.competitions.set_ready(user, competition_id, body.ready)
    return await ctx.competitions.state(competition_id, user.id)


@router.post("/{competition_id}/start", response_model=CompetitionState)
async def start(competition_id: int, user: CurrentUser, ctx: Ctx) -> CompetitionState:
    await ctx.competitions.start(user, competition_id)
    return await ctx.competitions.state(competition_id, user.id)


@router.post("/{competition_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
async def leave(competition_id: int, user: CurrentUser, ctx: Ctx) -> None:
    await ctx.competitions.leave(user, competition_id)


@router.post("/{competition_id}/cancel", response_model=CompetitionState)
async def cancel(competition_id: int, user: CurrentUser, ctx: Ctx) -> CompetitionState:
    await ctx.competitions.cancel(user, competition_id)
    return await ctx.competitions.state(competition_id, user.id)


@router.post(
    "/{competition_id}/submissions",
    response_model=SubmissionOut,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(rate_limit("submit", "rate_submit_per_minute", 60, per_user=True))],
)
async def submit(competition_id: int, body: CompetitionSubmissionRequest, user: CurrentUser, ctx: Ctx) -> SubmissionOut:
    """Queue a solution.  The verdict arrives as a ``submission:result`` event."""
    submission = await ctx.competitions.submit(user, competition_id, body.code)
    return SubmissionOut.model_validate(submission)


@router.get("/{competition_id}/results", response_model=CompetitionResults)
async def results(competition_id: int, user: CurrentUser, ctx: Ctx) -> CompetitionResults:
    return await ctx.competitions.results(competition_id, user.id)
