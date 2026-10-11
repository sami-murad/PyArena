"""Focus Mode: server-side detection bookkeeping and escalation.

The browser reports signals (tab hidden, window blurred, back again, a large
paste). The server owns everything that matters:

* **Timing.** An absence is timed with the server clock, from the "hidden" or
  "blur" signal to the "visible" or "focus" signal, and capped by the length
  the browser measured itself, so network latency (the "visible" request waits
  for the "hidden" one) never makes an absence look longer than it was.
  Absences shorter than ``FOCUS_GRACE_MS`` (2 s) never count, so screen
  readers, OS prompts and notifications are not punished.
* **Escalation.** Counted violations 1..WARN_LIMIT warn. The next one pauses
  submissions for PAUSE_SECONDS, later ones freeze them for FREEZE_SECONDS, and
  violation number WARN_LIMIT + DQ_AFTER disqualifies the player.
* **Enforcement.** Pauses, freezes and disqualification are enforced when a
  submission arrives (CompetitionService.submit), not by the browser.

Honest limits (docs/SECURITY.md): a modified client can stop sending signals,
and nothing here can see a second device. Missing heartbeats are recorded, but
the server cannot tell *why* a client went quiet.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import TYPE_CHECKING

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings
from app.core.database import utcnow
from app.core.errors import ServiceError, conflict, forbidden, not_found
from app.models import Competition, CompetitionStatus, FocusSession, FocusViolation, User
from app.repositories.competitions import CompetitionRepository
from app.repositories.focus import FocusRepository
from app.repositories.submissions import SubmissionRepository
from app.schemas.focus import FocusAction, FocusEventRequest, FocusEventResult, FocusPolicy, FocusStateOut, FocusStatus
from app.websocket import events as ev
from app.websocket.events import EventBus

if TYPE_CHECKING:
    from app.services.competitions import CompetitionService

log = logging.getLogger("pyarena.focus")

AWAY_START = {"hidden", "blur"}
AWAY_END = {"visible", "focus"}


def escalation(count: int, settings: Settings) -> FocusAction:
    """What the ``count``-th counted violation does (pure; unit-tested)."""
    if count <= settings.focus_warn_limit:
        return "warn"
    if count >= settings.focus_warn_limit + settings.focus_dq_after:
        return "disqualify"
    if count == settings.focus_warn_limit + 1:
        return "pause"
    return "freeze"


def session_status(session: FocusSession | None, enabled: bool, now: datetime) -> FocusStatus:
    if not enabled:
        return "off"
    if session is None:
        return "ok"
    if session.disqualified_at is not None:
        return "disqualified"
    if session.frozen_until is not None and session.frozen_until > now:
        return "frozen"
    if session.paused_until is not None and session.paused_until > now:
        return "paused"
    if session.away_since is not None:
        return "away"
    return "ok"


def submission_block(session: FocusSession | None, now: datetime) -> ServiceError | None:
    """The error to raise if Focus Mode currently forbids this player to submit."""
    if session is None:
        return None
    if session.disqualified_at is not None:
        return ServiceError(403, "Focus Mode disqualified you from this competition.", "focus_disqualified")
    for until, code, label in (
        (session.frozen_until, "focus_frozen", "frozen"),
        (session.paused_until, "focus_paused", "paused"),
    ):
        if until is not None and until > now:
            wait = (until - now).total_seconds()
            return ServiceError(
                423, f"Submissions are {label} by Focus Mode for {wait:.0f} more seconds.", code, retry_after=wait
            )
    return None


@dataclass
class _Outcome:
    recorded: bool = False
    counted: bool = False
    action: FocusAction | None = None
    broadcast: tuple[str, dict[str, object]] | None = None
    disqualified: bool = False
    cancelled: tuple[int, ...] = ()


class FocusService:
    def __init__(
        self,
        sessionmaker: async_sessionmaker[AsyncSession],
        settings: Settings,
        bus: EventBus,
        competitions: CompetitionService,
    ) -> None:
        self.sm = sessionmaker
        self.settings = settings
        self.bus = bus
        self.competitions = competitions

    # ================================================================== reads
    def policy(self) -> FocusPolicy:
        s = self.settings
        return FocusPolicy(
            warn_limit=s.focus_warn_limit,
            pause_seconds=s.focus_pause_seconds,
            freeze_seconds=s.focus_freeze_seconds,
            dq_after=s.focus_dq_after,
            grace_ms=s.focus_grace_ms,
            paste_limit_chars=s.focus_paste_limit_chars,
            heartbeat_seconds=s.focus_heartbeat_seconds,
        )

    def to_state(self, cid: int, enabled: bool, session: FocusSession | None) -> FocusStateOut:
        now = utcnow()
        count = session.counted_violations if session else 0
        status = session_status(session, enabled, now)
        disqualified = status == "disqualified"
        return FocusStateOut(
            competition_id=cid,
            enabled=enabled,
            acknowledged=bool(session and session.acknowledged_at),
            status=status,
            counted_violations=count,
            warnings_left=max(0, self.settings.focus_warn_limit - count),
            next_action=None if not enabled or disqualified else escalation(count + 1, self.settings),
            paused_until=session.paused_until if session else None,
            frozen_until=session.frozen_until if session else None,
            disqualified=disqualified,
            server_time=now,
            policy=self.policy(),
        )

    async def state(self, user: User, cid: int) -> FocusStateOut:
        async with self.sm() as s:
            comp = await self._member_comp(s, cid, user.id)
            session = await FocusRepository(s).get(cid, user.id)
            return self.to_state(cid, comp.focus_mode, session)

    # =============================================================== commands
    async def acknowledge(self, user: User, cid: int) -> FocusStateOut:
        async with self.sm() as s:
            comp = await self._member_comp(s, cid, user.id)
            if not comp.focus_mode:
                raise conflict("Focus Mode is off in this competition.", "focus_off")
            session = await FocusRepository(s).get_or_create(cid, user.id)
            if session.acknowledged_at is None:
                session.acknowledged_at = utcnow()
            await s.commit()
            state = self.to_state(cid, True, session)
        await self.competitions.broadcast_state(cid)
        return state

    async def report(self, user: User, cid: int, req: FocusEventRequest) -> FocusEventResult:
        async with self.sm() as s:
            comp = await self._member_comp(s, cid, user.id)
            if not comp.focus_mode:
                raise conflict("Focus Mode is off in this competition.", "focus_off")
            repo = FocusRepository(s)
            session = await repo.get_or_create(cid, user.id)
            outcome = _Outcome()
            # Only a running competition counts; lobby and countdown signals are ignored.
            if comp.status == CompetitionStatus.RUNNING and session.disqualified_at is None:
                outcome = await self._apply(s, repo, session, req, user)
            await s.commit()
            state = self.to_state(cid, True, session)
        await self._after(cid, user, outcome)
        return FocusEventResult(state=state, recorded=outcome.recorded, counted=outcome.counted, action=outcome.action)

    async def heartbeat(self, user: User, cid: int) -> FocusStateOut:
        """Called every FOCUS_HEARTBEAT_SECONDS while the competition tab is open.

        A gap longer than FOCUS_HEARTBEAT_GAP_SECONDS while the player was not
        already reported away is recorded as a counted ``heartbeat_gap``: the
        client stopped reporting (closed lid, killed script) during a running round.
        """
        async with self.sm() as s:
            comp = await self._member_comp(s, cid, user.id)
            if not comp.focus_mode:
                raise conflict("Focus Mode is off in this competition.", "focus_off")
            repo = FocusRepository(s)
            session = await repo.get_or_create(cid, user.id)
            now = utcnow()
            outcome = _Outcome()
            gap_limit = timedelta(seconds=self.settings.focus_heartbeat_gap_seconds)
            if (
                comp.status == CompetitionStatus.RUNNING
                and session.disqualified_at is None
                and session.away_since is None
                and session.last_heartbeat_at is not None
                and comp.starts_at is not None
                and session.last_heartbeat_at >= comp.starts_at
                and now - session.last_heartbeat_at > gap_limit
            ):
                gap_ms = int((now - session.last_heartbeat_at).total_seconds() * 1000)
                violation = await repo.add_violation(
                    FocusViolation(
                        session_id=session.id,
                        kind="heartbeat_gap",
                        started_at=session.last_heartbeat_at,
                        ended_at=now,
                        duration_ms=gap_ms,
                        counted=True,
                        action="pending",
                    )
                )
                outcome = await self._count(s, session, violation, user)
            session.last_heartbeat_at = now
            await s.commit()
            state = self.to_state(cid, True, session)
        await self._after(cid, user, outcome)
        return state

    # =============================================================== internals
    async def _apply(
        self, s: AsyncSession, repo: FocusRepository, session: FocusSession, req: FocusEventRequest, user: User
    ) -> _Outcome:
        now = utcnow()
        cid = session.competition_id
        if req.kind in AWAY_START:
            if session.away_since is not None:
                return _Outcome()  # "blur" and "hidden" usually arrive together: one absence
            session.away_since = now
            session.away_kind = req.kind
            await repo.add_violation(FocusViolation(session_id=session.id, kind=req.kind, started_at=now))
            payload: dict[str, object] = {
                "competition_id": cid,
                "user_id": user.id,
                "username": user.username,
                "kind": "away",
                "pending": True,
            }
            return _Outcome(recorded=True, action="pending", broadcast=(ev.FOCUS_VIOLATION, payload))

        if req.kind in AWAY_END:
            if session.away_since is None:
                return _Outcome()
            started = session.away_since
            session.away_since = None
            session.away_kind = None
            violation = await repo.open_violation(session.id)
            if violation is None:  # defensive: the row was cleaned up
                violation = await repo.add_violation(
                    FocusViolation(session_id=session.id, kind="hidden", started_at=started)
                )
            violation.ended_at = now
            measured = int((now - started).total_seconds() * 1000)
            # Benefit of the doubt for slow networks. A client that lies here
            # could equally send nothing at all (see "Honest limits" above).
            violation.duration_ms = measured if req.away_ms is None else min(measured, req.away_ms)
            if violation.duration_ms < self.settings.focus_grace_ms:
                violation.action = "ignored"
                payload = {
                    "competition_id": cid,
                    "user_id": user.id,
                    "username": user.username,
                    "counted": False,
                    "action": "ignored",
                }
                return _Outcome(recorded=True, action="ignored", broadcast=(ev.FOCUS_RESUMED, payload))
            violation.counted = True
            outcome = await self._count(s, session, violation, user)
            payload = {
                "competition_id": cid,
                "user_id": user.id,
                "username": user.username,
                "counted": True,
                "action": outcome.action,
                "count": session.counted_violations,
            }
            outcome.broadcast = (ev.FOCUS_RESUMED, payload)
            return outcome

        if req.kind == "paste":
            chars = req.paste_chars or 0
            if chars < self.settings.focus_paste_limit_chars:
                return _Outcome()
            violation = await repo.add_violation(
                FocusViolation(
                    session_id=session.id,
                    kind="paste",
                    started_at=now,
                    ended_at=now,
                    counted=True,
                    detail=f"{chars} characters pasted",
                )
            )
            outcome = await self._count(s, session, violation, user)
            payload = {
                "competition_id": cid,
                "user_id": user.id,
                "username": user.username,
                "kind": "paste",
                "pending": False,
                "action": outcome.action,
            }
            outcome.broadcast = (ev.FOCUS_VIOLATION, payload)
            return outcome

        # fullscreen_exit: recorded for the host's review but never escalates;
        # many people cannot or do not want to use fullscreen.
        await repo.add_violation(
            FocusViolation(session_id=session.id, kind=req.kind, started_at=now, ended_at=now, action="recorded")
        )
        return _Outcome(recorded=True, action="recorded")

    async def _count(self, s: AsyncSession, session: FocusSession, violation: FocusViolation, user: User) -> _Outcome:
        now = utcnow()
        session.counted_violations += 1
        action = escalation(session.counted_violations, self.settings)
        violation.action = action
        if action == "pause":
            session.paused_until = now + timedelta(seconds=self.settings.focus_pause_seconds)
        elif action == "freeze":
            session.frozen_until = now + timedelta(seconds=self.settings.focus_freeze_seconds)
        cancelled: list[int] = []
        if action == "disqualify":
            session.disqualified_at = now
            session.away_since = None
            cancelled = await SubmissionRepository(s).cancel_pending(
                session.competition_id, user.id, "Cancelled: Focus Mode disqualified this player."
            )
        log.info(
            "focus violation counted",
            extra={"competition_id": session.competition_id, "kind": violation.kind, "action": action},
        )
        return _Outcome(
            recorded=True, counted=True, action=action, disqualified=action == "disqualify", cancelled=tuple(cancelled)
        )

    async def _after(self, cid: int, user: User, outcome: _Outcome) -> None:
        room = ev.competition_room(cid)
        if outcome.broadcast is not None:
            event, payload = outcome.broadcast
            await self.bus.emit(event, payload, room)
        for sid in outcome.cancelled:
            await self.bus.emit(
                ev.SUBMISSION_RESULT,
                {"competition_id": cid, "submission_id": sid, "user_id": user.id, "status": "CANCELLED"},
                room,
            )
        if outcome.recorded and outcome.action != "recorded":
            await self.competitions.broadcast_state(cid)

    async def _member_comp(self, s: AsyncSession, cid: int, user_id: int) -> Competition:
        repo = CompetitionRepository(s)
        comp = await repo.get(cid)
        member = await repo.membership(cid, user_id) if comp else None
        if comp is None or member is None:
            raise not_found("Competition not found.")
        if member.left_at is not None:
            raise forbidden("You left this competition. Rejoin with the room code.")
        return comp
