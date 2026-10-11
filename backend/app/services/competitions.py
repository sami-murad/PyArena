"""Server-authoritative competition lifecycle.

State machine::

    WAITING ──start──▶ COUNTDOWN ──starts_at──▶ RUNNING ──winner──▶ FINISHED
       │                                          └──ends_at──────▶ FINISHED (time_up)
       ├──host cancels / everyone leaves──▶ CANCELLED
       └──idle too long──▶ EXPIRED

Every transition is a compare-and-set UPDATE (``WHERE status = <expected>``),
so concurrent requests cannot apply the same transition twice.  Timers are
best-effort ``asyncio`` tasks; every read path also calls :meth:`refresh`, so
the state is correct even after a restart.

Fairness rule (documented in docs/ARCHITECTURE.md): submissions of one
competition are judged strictly in server-receipt order (ascending submission
id).  The earliest-received submission that passes every test wins.  The win
itself is recorded with one atomic conditional UPDATE.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections import defaultdict
from collections.abc import Awaitable, Callable
from datetime import timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings
from app.core.database import utcnow
from app.core.errors import ServiceError, conflict, forbidden, not_found, too_many
from app.core.locks import JudgeLock, LocalJudgeLock
from app.core.logging import bind
from app.core.metrics import observe_submission
from app.core.rate_limit import RateLimiter
from app.models import (
    Competition,
    CompetitionPlayer,
    CompetitionStatus,
    Submission,
    SubmissionStatus,
    User,
)
from app.repositories.competitions import CompetitionRepository, generate_room_code
from app.repositories.questions import QuestionRepository
from app.repositories.submissions import SubmissionRepository
from app.schemas.competitions import (
    CompetitionListItem,
    CompetitionResults,
    CompetitionState,
    CreateCompetitionRequest,
    ParticipantOut,
    PlayerResult,
    ResultSubmission,
    WinnerOut,
)
from app.services.judge import Judge
from app.services.questions import to_detail
from app.websocket import events as ev
from app.websocket.events import EventBus, Presence

log = logging.getLogger("pyarena.competitions")

TIE_BREAK_RULE = (
    "Submissions are judged one at a time in the order the server received them. "
    "The earliest-received submission that passes every test wins; browser clocks are never used."
)

ENDED = (CompetitionStatus.FINISHED, CompetitionStatus.CANCELLED, CompetitionStatus.EXPIRED)


class CompetitionService:
    def __init__(
        self,
        sessionmaker: async_sessionmaker[AsyncSession],
        settings: Settings,
        judge: Judge,
        bus: EventBus,
        presence: Presence,
        limiter: RateLimiter,
        judge_lock: JudgeLock | None = None,
        maintenance: list[Callable[[], Awaitable[object]]] | None = None,
    ) -> None:
        self.sm = sessionmaker
        self.settings = settings
        self.judge = judge
        self.bus = bus
        self.presence = presence
        self.limiter = limiter
        self.judge_lock: JudgeLock = judge_lock or LocalJudgeLock()
        self.maintenance = maintenance or []
        self._judge_loops: dict[int, asyncio.Task[None]] = {}
        self._dirty: dict[int, bool] = {}
        self._timers: dict[int, list[asyncio.Task[None]]] = defaultdict(list)
        self._user_locks: dict[tuple[int, int], asyncio.Lock] = defaultdict(asyncio.Lock)
        self._sweeper: asyncio.Task[None] | None = None

    # ================================================================ lifecycle
    def start_background(self) -> None:
        if self._sweeper is None:
            self._sweeper = asyncio.create_task(self._sweep_forever())

    async def shutdown(self) -> None:
        tasks: list[asyncio.Task[Any]] = [*self._judge_loops.values()]
        for timers in self._timers.values():
            tasks.extend(timers)
        if self._sweeper:
            tasks.append(self._sweeper)
        for task in tasks:
            task.cancel()
        for task in tasks:
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task

    async def _sweep_forever(self) -> None:
        while True:
            try:
                await self.sweep()
            except Exception:  # pragma: no cover - keep the sweeper alive
                log.exception("competition sweep failed")
            await asyncio.sleep(15)

    async def sweep(self) -> None:
        """Re-check every active competition (covers restarts and missed timers)."""
        async with self.sm() as s:
            ids = await CompetitionRepository(s).ids_in_status(tuple(str(x) for x in ev_active()))
        for cid in ids:
            await self.refresh(cid)
            await self._kick_if_pending(cid)
        for task in self.maintenance:
            await task()

    # ================================================================ commands
    async def create(self, user: User, req: CreateCompetitionRequest) -> int:
        max_players = min(req.max_players, self.settings.competition_max_players)
        async with self.sm() as s:
            repo = CompetitionRepository(s)
            difficulty = None if req.difficulty == "any" else req.difficulty
            if await QuestionRepository(s).random_active(difficulty) is None:
                raise conflict("There are no questions for that difficulty yet. Run the seed script first.")
            code = generate_room_code()
            while await repo.code_exists(code):  # astronomically rare
                code = generate_room_code()
            comp = Competition(
                code=code,
                host_id=user.id,
                status=CompetitionStatus.WAITING,
                difficulty=difficulty,
                max_players=max_players,
                duration_seconds=req.duration_minutes * 60,
            )
            s.add(comp)
            await s.flush()
            s.add(CompetitionPlayer(competition_id=comp.id, user_id=user.id, is_ready=True))
            await s.commit()
            return comp.id

    async def join_by_code(self, user: User, code: str) -> int:
        async with self.sm() as s:
            comp = await CompetitionRepository(s).by_code(code)
            if comp is None:
                raise not_found("No room uses that code. Check it and try again.")
            cid = comp.id
        await self.refresh(cid)
        async with self.sm() as s:
            repo = CompetitionRepository(s)
            comp = await repo.get(cid)
            assert comp is not None
            member = await repo.membership(cid, user.id)
            if member is not None and member.left_at is None:
                return cid
            if comp.status in ENDED:
                raise conflict("This competition has already ended.", "ended")
            if member is None and comp.status != CompetitionStatus.WAITING:
                raise conflict("This competition has already started.", "started")
            active = [p for p in comp.players if p.left_at is None]
            if len(active) >= comp.max_players:
                raise conflict("This room is full.", "full")
            if member is None:
                s.add(CompetitionPlayer(competition_id=cid, user_id=user.id))
            else:
                member.left_at = None
                member.is_ready = False
            comp.last_activity_at = utcnow()
            await s.commit()
        await self.broadcast_state(cid)
        return cid

    async def leave(self, user: User, cid: int) -> None:
        async with self.sm() as s:
            repo = CompetitionRepository(s)
            comp = await self._member_comp(repo, cid, user.id)
            member = await repo.membership(cid, user.id)
            assert member is not None
            if member.left_at is not None:
                return
            member.left_at = utcnow()
            member.is_ready = False
            comp.last_activity_at = utcnow()
            cancelled = False
            if comp.status == CompetitionStatus.WAITING:
                remaining = [p for p in comp.players if p.left_at is None and p.user_id != user.id]
                if not remaining:
                    cancelled = await repo.transition(
                        cid,
                        CompetitionStatus.WAITING,
                        status=CompetitionStatus.CANCELLED,
                        finished_at=utcnow(),
                        finish_reason="everyone_left",
                    )
                elif comp.host_id == user.id:
                    new_host = remaining[0]
                    comp.host_id = new_host.user_id
                    new_host.is_ready = True
            await s.commit()
        if cancelled:
            await self.bus.emit(
                ev.COMPETITION_FINISHED, {"competition_id": cid, "reason": "everyone_left"}, ev.competition_room(cid)
            )
        await self.broadcast_state(cid)

    async def set_ready(self, user: User, cid: int, ready: bool) -> None:
        async with self.sm() as s:
            repo = CompetitionRepository(s)
            comp = await self._member_comp(repo, cid, user.id, active_only=True)
            if comp.status != CompetitionStatus.WAITING:
                raise conflict("You can only change readiness in the lobby.")
            member = await repo.membership(cid, user.id)
            assert member is not None
            member.is_ready = True if comp.host_id == user.id else ready
            comp.last_activity_at = utcnow()
            await s.commit()
        await self.broadcast_state(cid)

    async def cancel(self, user: User, cid: int) -> None:
        async with self.sm() as s:
            repo = CompetitionRepository(s)
            comp = await self._member_comp(repo, cid, user.id)
            if comp.host_id != user.id:
                raise forbidden("Only the host can cancel this room.")
            ok = await repo.transition(
                cid,
                CompetitionStatus.WAITING,
                status=CompetitionStatus.CANCELLED,
                finished_at=utcnow(),
                finish_reason="host_cancelled",
            )
            if not ok:
                raise conflict("Only a room that has not started can be cancelled.")
            await s.commit()
        await self.bus.emit(
            ev.COMPETITION_FINISHED, {"competition_id": cid, "reason": "host_cancelled"}, ev.competition_room(cid)
        )
        await self.broadcast_state(cid)

    async def start(self, user: User, cid: int) -> None:
        await self.refresh(cid)
        async with self.sm() as s:
            repo = CompetitionRepository(s)
            comp = await self._member_comp(repo, cid, user.id, active_only=True)
            if comp.host_id != user.id:
                raise forbidden("Only the host can start the competition.")
            blockers = self._start_blockers(comp)
            if blockers:
                raise conflict(blockers[0], "not_ready")
            question = await QuestionRepository(s).random_active(comp.difficulty)
            if question is None:
                raise conflict("No question is available for this difficulty.")
            now = utcnow()
            starts_at = now + timedelta(seconds=self.settings.competition_countdown_seconds)
            ends_at = starts_at + timedelta(seconds=comp.duration_seconds)
            ok = await repo.transition(
                cid,
                CompetitionStatus.WAITING,
                status=CompetitionStatus.COUNTDOWN,
                question_id=question.id,
                starts_at=starts_at,
                ends_at=ends_at,
                last_activity_at=now,
            )
            if not ok:
                raise conflict("The competition has already been started.")
            await s.commit()

        await self.bus.emit(
            ev.COMPETITION_COUNTDOWN,
            {
                "competition_id": cid,
                "starts_at": starts_at.isoformat(),
                "ends_at": ends_at.isoformat(),
                "server_time": utcnow().isoformat(),
            },
            ev.competition_room(cid),
        )
        await self.broadcast_state(cid)
        self._schedule(cid, starts_at.timestamp(), self.refresh)
        self._schedule(cid, ends_at.timestamp() + 0.25, self.refresh)
        if starts_at <= utcnow():
            await self.refresh(cid)

    async def submit(self, user: User, cid: int, code: str) -> Submission:
        if len(code) > self.settings.max_code_chars:
            raise ServiceError(422, f"Code is limited to {self.settings.max_code_chars} characters.")
        await self.refresh(cid)
        lock = self._user_locks[(cid, user.id)]
        async with lock:
            async with self.sm() as s:
                repo = CompetitionRepository(s)
                comp = await self._member_comp(repo, cid, user.id, active_only=True)
                if comp.status != CompetitionStatus.RUNNING:
                    if comp.status == CompetitionStatus.COUNTDOWN:
                        raise conflict("The competition has not started yet.", "not_started")
                    raise conflict("The competition is not accepting submissions.", "not_running")
                assert comp.ends_at is not None and comp.question_id is not None
                if utcnow() > comp.ends_at:
                    raise conflict("Time is up.", "time_up")
                subs = SubmissionRepository(s)
                if await subs.count_pending(cid, user.id):
                    raise conflict("Your previous submission is still being judged.", "pending")
                retry = (
                    await self.limiter.hit(f"cooldown:{cid}:{user.id}", 1, self.settings.submission_cooldown_seconds)
                    if self.settings.submission_cooldown_seconds > 0
                    else None
                )
                if retry is not None:
                    raise too_many(f"Wait {retry:.1f}s before submitting again.", retry)
                submission = await subs.create(user.id, comp.question_id, code, competition_id=cid)
                await s.commit()
        await self.bus.emit(
            ev.SUBMISSION_RECEIVED,
            {"competition_id": cid, "submission_id": submission.id, "user_id": user.id, "username": user.username},
            ev.competition_room(cid),
        )
        await self.broadcast_state(cid)
        self._kick(cid)
        return submission

    # =================================================================== reads
    async def state(self, cid: int, viewer_id: int) -> CompetitionState:
        await self.refresh(cid)
        async with self.sm() as s:
            repo = CompetitionRepository(s)
            comp = await self._member_comp(repo, cid, viewer_id)
            return await self._snapshot(s, comp)

    async def results(self, cid: int, viewer_id: int) -> CompetitionResults:
        await self.refresh(cid)
        async with self.sm() as s:
            repo = CompetitionRepository(s)
            comp = await self._member_comp(repo, cid, viewer_id)
            if comp.status not in ENDED:
                raise conflict("Results are available once the competition has ended.", "not_ended")
            state = await self._snapshot(s, comp)
            submissions = await SubmissionRepository(s).for_competition(cid)

        def after_start(sub: Submission) -> float | None:
            return (sub.created_at - comp.starts_at).total_seconds() if comp.starts_at else None

        players: list[PlayerResult] = []
        for p in comp.players:
            mine = [x for x in submissions if x.user_id == p.user_id]
            accepted = [x for x in mine if x.status == SubmissionStatus.ACCEPTED]
            players.append(
                PlayerResult(
                    user_id=p.user_id,
                    username=p.user.username,
                    attempts=len(mine),
                    solved=bool(accepted),
                    is_winner=comp.winner_user_id == p.user_id,
                    best_status=_best_status(mine),
                    solve_seconds=after_start(accepted[0]) if accepted else None,
                )
            )
        players.sort(key=lambda r: (not r.is_winner, not r.solved, r.solve_seconds or 1e12, -r.attempts))
        timeline = [
            ResultSubmission(
                id=x.id,
                username=x.user.username,
                status=x.status,
                passed_count=x.passed_count,
                total_count=x.total_count,
                seconds_after_start=after_start(x),
                is_winning=x.id == comp.winner_submission_id,
            )
            for x in submissions
        ]
        return CompetitionResults(competition=state, players=players, timeline=timeline, tie_break_rule=TIE_BREAK_RULE)

    async def list_for_user(self, user_id: int) -> list[CompetitionListItem]:
        async with self.sm() as s:
            comps = await CompetitionRepository(s).for_user(user_id)
            return [
                CompetitionListItem(
                    id=c.id,
                    code=c.code,
                    status=c.status,
                    difficulty=c.difficulty,
                    created_at=c.created_at,
                    player_count=len([p for p in c.players if p.left_at is None]),
                    is_host=c.host_id == user_id,
                    won=c.winner_user_id == user_id,
                )
                for c in comps
            ]

    async def is_member(self, cid: int, user_id: int) -> bool:
        async with self.sm() as s:
            return (await CompetitionRepository(s).membership(cid, user_id)) is not None

    # =========================================================== transitions
    async def refresh(self, cid: int) -> None:
        """Apply any time-based transition that is due, then announce it."""
        announce: list[tuple[str, dict[str, Any]]] = []
        async with self.sm() as s:
            repo = CompetitionRepository(s)
            comp = await repo.get(cid)
            if comp is None:
                return
            now = utcnow()
            if comp.status == CompetitionStatus.WAITING:
                idle = timedelta(minutes=self.settings.competition_idle_minutes)
                if comp.last_activity_at + idle < now and await repo.transition(
                    cid,
                    CompetitionStatus.WAITING,
                    status=CompetitionStatus.EXPIRED,
                    finished_at=now,
                    finish_reason="idle",
                ):
                    announce.append((ev.COMPETITION_FINISHED, {"competition_id": cid, "reason": "idle"}))
            elif comp.status == CompetitionStatus.COUNTDOWN and comp.starts_at and comp.starts_at <= now:
                if await repo.transition(cid, CompetitionStatus.COUNTDOWN, status=CompetitionStatus.RUNNING):
                    question = await QuestionRepository(s).get(comp.question_id or 0)
                    assert question is not None
                    detail = to_detail(question, list(question.test_cases))
                    announce.append(
                        (
                            ev.COMPETITION_STARTED,
                            {
                                "competition_id": cid,
                                "starts_at": comp.starts_at.isoformat(),
                                "ends_at": comp.ends_at.isoformat() if comp.ends_at else None,
                                "question": detail.model_dump(mode="json"),
                            },
                        )
                    )
                    comp.status = CompetitionStatus.RUNNING
            if comp.status == CompetitionStatus.RUNNING and comp.ends_at and comp.ends_at <= now:
                pending = await SubmissionRepository(s).count_pending(cid)
                if pending == 0 and await repo.transition(
                    cid,
                    CompetitionStatus.RUNNING,
                    status=CompetitionStatus.FINISHED,
                    finished_at=now,
                    finish_reason="time_up",
                ):
                    announce.append((ev.COMPETITION_FINISHED, {"competition_id": cid, "reason": "time_up"}))
            await s.commit()
        for event, data in announce:
            await self.bus.emit(event, data, ev.competition_room(cid))
        if announce:
            await self.broadcast_state(cid)
            if any(e == ev.COMPETITION_FINISHED for e, _ in announce):
                self._cancel_timers(cid)

    async def broadcast_state(self, cid: int) -> None:
        async with self.sm() as s:
            comp = await CompetitionRepository(s).get(cid)
            if comp is None:
                return
            snapshot = await self._snapshot(s, comp)
        payload = snapshot.model_dump(mode="json")
        await self.bus.emit(ev.ROOM_STATE, payload, ev.competition_room(cid))
        await self.bus.emit(
            ev.ROOM_PARTICIPANTS,
            {"competition_id": cid, "participants": payload["participants"]},
            ev.competition_room(cid),
        )

    # ================================================================ judging
    def _kick(self, cid: int) -> None:
        self._dirty[cid] = True
        if cid not in self._judge_loops:
            self._judge_loops[cid] = asyncio.create_task(self._judge_loop(cid))

    async def _kick_if_pending(self, cid: int) -> None:
        async with self.sm() as s:
            if await SubmissionRepository(s).count_pending(cid):
                self._kick(cid)

    async def wait_for_judging(self, cid: int) -> None:
        """Test helper: wait until the judge loop for ``cid`` is idle."""
        while (task := self._judge_loops.get(cid)) is not None:
            await asyncio.shield(task)

    async def _judge_loop(self, cid: int) -> None:
        with bind(competition_id=cid):
            # Across several API processes only the lock holder judges this
            # competition, which keeps the strict receipt-order rule. Others
            # skip; the holder (or the sweeper, once the lock expires) picks up
            # any submission they received.
            token = await self.judge_lock.acquire(cid)
            if token is None:
                self._judge_loops.pop(cid, None)
                log.info("another process is judging this competition")
                # If the holder finishes just before seeing our submission, we
                # take over on the next attempt instead of waiting for the sweeper.
                self._schedule(cid, utcnow().timestamp() + 1.0, self._kick_if_pending)
                return
            try:
                while True:
                    self._dirty[cid] = False
                    await self._drain(cid, token)
                    # No await between this check and the removal below, so a
                    # submission kicked during _drain is never stranded.
                    if not self._dirty.get(cid):
                        break
            except Exception:  # keep the service alive; the sweeper retries pending work
                log.exception("judge loop crashed")
            finally:
                self._judge_loops.pop(cid, None)
                await self.judge_lock.release(cid, token)
            await self.refresh(cid)

    async def _drain(self, cid: int, token: str) -> None:
        while True:
            if not await self.judge_lock.refresh(cid, token):
                log.warning("lost the judge lock; another process continues")
                return
            async with self.sm() as s:
                comp = await CompetitionRepository(s).get(cid)
                subs = SubmissionRepository(s)
                pending = await subs.next_pending(cid)
                if comp is None or pending is None:
                    return
                if comp.status != CompetitionStatus.RUNNING:
                    cancelled = await subs.cancel_pending(cid)
                    await s.commit()
                    for sid in cancelled:
                        await self.bus.emit(
                            ev.SUBMISSION_RESULT,
                            {"competition_id": cid, "submission_id": sid, "status": SubmissionStatus.CANCELLED},
                            ev.competition_room(cid),
                        )
                    return
                question = await QuestionRepository(s).get(comp.question_id or 0)
                assert question is not None
                tests = list(question.test_cases)
                sub_id, sub_user, sub_code, sub_created = pending.id, pending.user_id, pending.code, pending.created_at
                username = pending.user.username

            with bind(submission_id=sub_id, user_id=sub_user):
                outcome = await self.judge.judge(question, sub_code, tests)

                won = False
                async with self.sm() as s:
                    submission = await SubmissionRepository(s).get(sub_id)
                    assert submission is not None
                    submission.status = outcome.status
                    submission.passed_count = outcome.passed
                    submission.total_count = outcome.total
                    submission.feedback = outcome.feedback
                    submission.judged_at = utcnow()
                    if outcome.status == SubmissionStatus.ACCEPTED:
                        won = await CompetitionRepository(s).claim_winner(cid, sub_id, sub_user, sub_created)
                    await s.commit()
                observe_submission("competition", submission)
                log.info("submission judged: %s", outcome.status, extra={"won": won})

            await self.bus.emit(
                ev.SUBMISSION_RESULT,
                {
                    "competition_id": cid,
                    "submission_id": sub_id,
                    "user_id": sub_user,
                    "username": username,
                    "status": outcome.status,
                    "passed_count": outcome.passed,
                    "total_count": outcome.total,
                },
                ev.competition_room(cid),
            )
            if won:
                await self._announce_winner(cid)
            else:
                await self.broadcast_state(cid)  # clears the player's "judging" flag

    async def _announce_winner(self, cid: int) -> None:
        async with self.sm() as s:
            comp = await CompetitionRepository(s).get(cid)
            assert comp is not None
            snapshot = await self._snapshot(s, comp)
        winner = snapshot.winner.model_dump(mode="json") if snapshot.winner else None
        room = ev.competition_room(cid)
        await self.bus.emit(ev.COMPETITION_WINNER, {"competition_id": cid, "winner": winner}, room)
        await self.bus.emit(ev.COMPETITION_FINISHED, {"competition_id": cid, "reason": "solved"}, room)
        await self.broadcast_state(cid)
        self._cancel_timers(cid)

    # ================================================================ helpers
    def _schedule(self, cid: int, at_timestamp: float, fn: Callable[[int], Awaitable[None]]) -> None:
        async def runner() -> None:
            delay = at_timestamp - utcnow().timestamp()
            if delay > 0:
                await asyncio.sleep(delay)
            await fn(cid)

        self._timers[cid].append(asyncio.create_task(runner()))

    def _cancel_timers(self, cid: int) -> None:
        current = asyncio.current_task()
        for task in self._timers.pop(cid, []):
            if task is not current:
                task.cancel()

    async def _member_comp(
        self, repo: CompetitionRepository, cid: int, user_id: int, active_only: bool = False
    ) -> Competition:
        comp = await repo.get(cid)
        member = await repo.membership(cid, user_id) if comp else None
        if comp is None or member is None:
            # Same response for "does not exist" and "not a member": no room enumeration.
            raise not_found("Competition not found.")
        if active_only and member.left_at is not None:
            raise forbidden("You left this competition. Rejoin with the room code.")
        return comp

    def _start_blockers(self, comp: Competition) -> list[str]:
        blockers: list[str] = []
        if comp.status != CompetitionStatus.WAITING:
            blockers.append("The competition is not in the lobby.")
            return blockers
        active = [p for p in comp.players if p.left_at is None]
        need = self.settings.competition_min_players
        if len(active) < need:
            blockers.append(f"At least {need} players are needed to start.")
        not_ready = [p.user.username for p in active if not p.is_ready and p.user_id != comp.host_id]
        if not_ready:
            blockers.append("Waiting for " + ", ".join(not_ready) + " to get ready.")
        return blockers

    async def _snapshot(self, s: AsyncSession, comp: Competition) -> CompetitionState:
        submissions = await SubmissionRepository(s).for_competition(comp.id)
        online = await self.presence.online(comp.id)
        participants = [
            ParticipantOut(
                user_id=p.user_id,
                username=p.user.username,
                is_host=p.user_id == comp.host_id,
                is_ready=p.is_ready or p.user_id == comp.host_id,
                online=p.user_id in online,
                attempts=len([x for x in submissions if x.user_id == p.user_id]),
                has_pending=any(x.user_id == p.user_id and x.status == SubmissionStatus.PENDING for x in submissions),
            )
            for p in comp.players
            if p.left_at is None
        ]
        now = utcnow()
        question = None
        started = comp.starts_at is not None and comp.starts_at <= now and comp.status != CompetitionStatus.COUNTDOWN
        if comp.question_id and started:
            q = await QuestionRepository(s).get(comp.question_id)
            if q is not None:
                question = to_detail(q, list(q.test_cases), include_explanation=comp.status in ENDED)
        winner = None
        if comp.winner_user_id and comp.winner_submission_id and comp.winner_accepted_at and comp.winner:
            winning = next((x for x in submissions if x.id == comp.winner_submission_id), None)
            solve = (winning.created_at - comp.starts_at).total_seconds() if winning and comp.starts_at else 0.0
            winner = WinnerOut(
                user_id=comp.winner_user_id,
                username=comp.winner.username,
                submission_id=comp.winner_submission_id,
                accepted_at=comp.winner_accepted_at,
                solve_seconds=round(solve, 2),
            )
        blockers = self._start_blockers(comp)
        return CompetitionState(
            id=comp.id,
            code=comp.code,
            status=comp.status,
            host_id=comp.host_id,
            difficulty=comp.difficulty,
            max_players=comp.max_players,
            min_players=self.settings.competition_min_players,
            duration_seconds=comp.duration_seconds,
            created_at=comp.created_at,
            starts_at=comp.starts_at,
            ends_at=comp.ends_at,
            finished_at=comp.finished_at,
            finish_reason=comp.finish_reason,
            server_time=now,
            participants=participants,
            question=question,
            winner=winner,
            can_start=not blockers,
            start_blockers=blockers,
        )


def ev_active() -> tuple[CompetitionStatus, ...]:
    return (CompetitionStatus.WAITING, CompetitionStatus.COUNTDOWN, CompetitionStatus.RUNNING)


_STATUS_RANK = [
    SubmissionStatus.ACCEPTED,
    SubmissionStatus.WRONG_ANSWER,
    SubmissionStatus.RUNTIME_ERROR,
    SubmissionStatus.TIMEOUT,
    SubmissionStatus.MEMORY_LIMIT,
    SubmissionStatus.OUTPUT_LIMIT,
    SubmissionStatus.SYNTAX_ERROR,
    SubmissionStatus.SYSTEM_ERROR,
    SubmissionStatus.CANCELLED,
    SubmissionStatus.PENDING,
]


def _best_status(subs: list[Submission]) -> str | None:
    if not subs:
        return None
    best = max(subs, key=lambda x: (x.passed_count, -_STATUS_RANK.index(SubmissionStatus(x.status))))
    return best.status
