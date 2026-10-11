"""Focus Mode: acknowledgement, whitelist, escalation, enforcement and events."""

from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta
from typing import Any

from httpx import AsyncClient

from app.core.context import AppContext
from app.core.database import utcnow
from app.models import SubmissionStatus
from app.repositories.competitions import CompetitionRepository
from app.repositories.focus import FocusRepository
from app.repositories.submissions import SubmissionRepository
from app.services.focus import escalation, session_status, submission_block
from app.websocket import events as ev
from app.websocket.events import RecordingBus
from tests.conftest import make_settings, register

MakeClient = Callable[[], AsyncClient]
WRONG = "def nope():\n    return 0\n"


async def make_focus_room(make_client: MakeClient, focus: bool = True) -> tuple[AsyncClient, AsyncClient, int]:
    host, guest = make_client(), make_client()
    await register(host, "host")
    await register(guest, "guest")
    created = await host.post("/api/v1/competitions", json={"difficulty": "easy", "focus_mode": focus})
    assert created.status_code == 201, created.text
    assert created.json()["focus_mode"] is focus
    room = created.json()
    joined = await guest.post("/api/v1/competitions/join", json={"code": room["code"]})
    assert joined.status_code == 200, joined.text
    return host, guest, room["id"]


async def run_focus_room(make_client: MakeClient) -> tuple[AsyncClient, AsyncClient, int]:
    host, guest, cid = await make_focus_room(make_client)
    for client in (host, guest):
        assert (await client.post(f"/api/v1/competitions/{cid}/focus/acknowledge")).status_code == 200
    assert (await guest.post(f"/api/v1/competitions/{cid}/ready", json={"ready": True})).status_code == 200
    started = await host.post(f"/api/v1/competitions/{cid}/start")
    assert started.status_code == 200, started.text
    assert started.json()["status"] == "RUNNING"
    return host, guest, cid


async def event(client: AsyncClient, cid: int, kind: str, **extra: Any) -> dict[str, Any]:
    r = await client.post(f"/api/v1/competitions/{cid}/focus/events", json={"kind": kind, **extra})
    assert r.status_code == 200, r.text
    body: dict[str, Any] = r.json()
    return body


async def user_id(client: AsyncClient) -> int:
    me: dict[str, Any] = (await client.get("/api/v1/users/me")).json()
    return int(me["id"])


async def age_absence(ctx: AppContext, cid: int, uid: int, seconds: float) -> None:
    """Move the start of the current absence into the past (instead of sleeping)."""
    async with ctx.db.sessionmaker() as s:
        session = await FocusRepository(s).get(cid, uid)
        assert session is not None and session.away_since is not None
        session.away_since = session.away_since - timedelta(seconds=seconds)
        violation = await FocusRepository(s).open_violation(session.id)
        assert violation is not None
        violation.started_at = session.away_since
        await s.commit()


async def leave_for(client: AsyncClient, ctx: AppContext, cid: int, uid: int, seconds: float = 5) -> dict[str, Any]:
    await event(client, cid, "hidden")
    await age_absence(ctx, cid, uid, seconds)
    return await event(client, cid, "visible")


def bus(ctx: AppContext) -> RecordingBus:
    assert isinstance(ctx.bus, RecordingBus)
    return ctx.bus


# ---------------------------------------------------------------- pure rules


def test_escalation_ladder_uses_the_documented_defaults() -> None:
    settings = make_settings()
    assert (settings.focus_warn_limit, settings.focus_pause_seconds) == (3, 30)
    assert (settings.focus_freeze_seconds, settings.focus_dq_after, settings.focus_grace_ms) == (60, 4, 2000)
    ladder = [escalation(n, settings) for n in range(1, 9)]
    assert ladder == ["warn", "warn", "warn", "pause", "freeze", "freeze", "disqualify", "disqualify"]


def test_status_and_submission_block_helpers() -> None:
    now = utcnow()
    assert session_status(None, False, now) == "off"
    assert session_status(None, True, now) == "ok"
    assert submission_block(None, now) is None


# ------------------------------------------------------------------ the API


async def test_focus_is_off_unless_the_host_turns_it_on(make_client: MakeClient) -> None:
    host, _guest, cid = await make_focus_room(make_client, focus=False)
    state = (await host.get(f"/api/v1/competitions/{cid}/focus")).json()
    assert state["enabled"] is False and state["status"] == "off"
    r = await host.post(f"/api/v1/competitions/{cid}/focus/events", json={"kind": "hidden"})
    assert r.status_code == 409 and r.json()["code"] == "focus_off"
    # New endpoints exist only under /api/v1 (no unversioned alias).
    assert (await host.get(f"/api/competitions/{cid}/focus")).status_code == 404


async def test_notice_must_be_accepted_before_ready_and_start(make_client: MakeClient) -> None:
    host, guest, cid = await make_focus_room(make_client)
    r = await guest.post(f"/api/v1/competitions/{cid}/ready", json={"ready": True})
    assert r.status_code == 409 and r.json()["code"] == "focus_ack_required"

    assert (await guest.post(f"/api/v1/competitions/{cid}/focus/acknowledge")).status_code == 200
    assert (await guest.post(f"/api/v1/competitions/{cid}/ready", json={"ready": True})).status_code == 200
    state = (await host.get(f"/api/v1/competitions/{cid}")).json()
    assert not state["can_start"]
    assert "host to accept the Focus Mode notice" in state["start_blockers"][0]
    assert (await host.post(f"/api/v1/competitions/{cid}/start")).status_code == 409

    acked = (await host.post(f"/api/v1/competitions/{cid}/focus/acknowledge")).json()
    assert acked["acknowledged"] is True and acked["policy"]["warn_limit"] == 3
    state = (await host.get(f"/api/v1/competitions/{cid}")).json()
    assert state["can_start"] and all(p["focus_acknowledged"] for p in state["participants"])


async def test_signals_before_the_start_are_ignored(make_client: MakeClient) -> None:
    host, _guest, cid = await make_focus_room(make_client)
    await host.post(f"/api/v1/competitions/{cid}/focus/acknowledge")
    result = await event(host, cid, "hidden")
    assert result["recorded"] is False and result["state"]["status"] == "ok"


async def test_short_absences_are_whitelisted_and_blur_plus_hidden_is_one_absence(
    make_client: MakeClient, ctx: AppContext
) -> None:
    _host, guest, cid = await run_focus_room(make_client)
    gid = await user_id(guest)
    started = await event(guest, cid, "blur")
    assert started["action"] == "pending" and started["state"]["status"] == "away"
    assert (await event(guest, cid, "hidden"))["recorded"] is False  # same absence
    back = await event(guest, cid, "focus")
    assert back["action"] == "ignored" and back["counted"] is False
    assert back["state"]["counted_violations"] == 0 and back["state"]["status"] == "ok"
    assert (await event(guest, cid, "visible"))["recorded"] is False  # already back

    pending = bus(ctx).named(ev.FOCUS_VIOLATION)[-1]
    assert pending == {"competition_id": cid, "user_id": gid, "username": "guest", "kind": "away", "pending": True}
    assert bus(ctx).named(ev.FOCUS_RESUMED)[-1]["counted"] is False


async def test_escalation_is_enforced_by_the_server(make_client: MakeClient, ctx: AppContext) -> None:
    host, guest, cid = await run_focus_room(make_client)
    gid = await user_id(guest)
    actions = []
    for _ in range(3):
        actions.append((await leave_for(guest, ctx, cid, gid))["action"])
    assert actions == ["warn", "warn", "warn"]
    assert (await guest.get(f"/api/v1/competitions/{cid}/focus")).json()["next_action"] == "pause"

    paused = await leave_for(guest, ctx, cid, gid)
    assert paused["action"] == "pause" and paused["state"]["status"] == "paused"
    r = await guest.post(f"/api/v1/competitions/{cid}/submissions", json={"code": WRONG})
    assert r.status_code == 423 and r.json()["code"] == "focus_paused"
    assert int(r.headers["retry-after"]) > 0

    frozen = await leave_for(guest, ctx, cid, gid)
    assert frozen["action"] == "freeze" and frozen["state"]["status"] == "frozen"
    r = await guest.post(f"/api/v1/competitions/{cid}/submissions", json={"code": WRONG})
    assert r.status_code == 423 and r.json()["code"] == "focus_frozen"
    # The opponent's snapshot shows it too.
    host_view = (await host.get(f"/api/v1/competitions/{cid}")).json()
    assert next(p for p in host_view["participants"] if p["user_id"] == gid)["focus"] == "frozen"
    # The host is unaffected.
    assert (await host.post(f"/api/v1/competitions/{cid}/submissions", json={"code": WRONG})).status_code == 202

    assert (await leave_for(guest, ctx, cid, gid))["action"] == "freeze"

    # A submission still waiting when the player is disqualified is cancelled.
    # (Let the host's judging finish first so the judge loop cannot pick it up.)
    await ctx.competitions.wait_for_judging(cid)
    async with ctx.db.sessionmaker() as s:
        comp_question = (await host.get(f"/api/v1/competitions/{cid}")).json()["question"]["id"]
        waiting = await SubmissionRepository(s).create(gid, comp_question, WRONG, competition_id=cid)
        await s.commit()
        waiting_id = waiting.id

    dq = await leave_for(guest, ctx, cid, gid)
    assert dq["action"] == "disqualify" and dq["state"]["disqualified"] is True
    assert dq["state"]["next_action"] is None
    r = await guest.post(f"/api/v1/competitions/{cid}/submissions", json={"code": WRONG})
    assert r.status_code == 403 and r.json()["code"] == "focus_disqualified"
    async with ctx.db.sessionmaker() as s:
        cancelled = await SubmissionRepository(s).get(waiting_id)
        assert cancelled is not None and cancelled.status == SubmissionStatus.CANCELLED
    assert any(e["submission_id"] == waiting_id for e in bus(ctx).named(ev.SUBMISSION_RESULT))
    # Once disqualified, further signals are not recorded.
    assert (await event(guest, cid, "hidden"))["recorded"] is False
    resumed = bus(ctx).named(ev.FOCUS_RESUMED)[-1]
    assert resumed["action"] == "disqualify" and resumed["count"] == 7


async def test_large_paste_counts_and_small_paste_does_not(make_client: MakeClient, ctx: AppContext) -> None:
    _host, guest, cid = await run_focus_room(make_client)
    small = await event(guest, cid, "paste", paste_chars=40)
    assert small["recorded"] is False
    big = await event(guest, cid, "paste", paste_chars=900)
    assert big["counted"] is True and big["action"] == "warn"
    assert bus(ctx).named(ev.FOCUS_VIOLATION)[-1]["kind"] == "paste"


async def test_fullscreen_exit_is_recorded_but_never_counts(make_client: MakeClient, ctx: AppContext) -> None:
    _host, guest, cid = await run_focus_room(make_client)
    result = await event(guest, cid, "fullscreen_exit")
    assert result["recorded"] is True and result["counted"] is False and result["action"] == "recorded"
    gid = await user_id(guest)
    async with ctx.db.sessionmaker() as s:
        session = await FocusRepository(s).get(cid, gid)
        assert session is not None
        kinds = [v.kind for v in await FocusRepository(s).violations(session.id)]
    assert kinds == ["fullscreen_exit"]


async def test_heartbeat_gap_is_counted_once_the_client_reports_again(make_client: MakeClient, ctx: AppContext) -> None:
    _host, guest, cid = await run_focus_room(make_client)
    gid = await user_id(guest)
    first = await guest.post(f"/api/v1/competitions/{cid}/focus/heartbeat")
    assert first.status_code == 200 and first.json()["counted_violations"] == 0
    async with ctx.db.sessionmaker() as s:
        session = await FocusRepository(s).get(cid, gid)
        assert session is not None and session.last_heartbeat_at is not None
        session.last_heartbeat_at = session.last_heartbeat_at - timedelta(seconds=120)
        await s.commit()
    # The start time must precede the (moved) heartbeat for it to count.
    async with ctx.db.sessionmaker() as s:
        comp = await CompetitionRepository(s).get(cid)
        assert comp is not None and comp.starts_at is not None
        comp.starts_at = comp.starts_at - timedelta(seconds=300)
        await s.commit()
    after = (await guest.post(f"/api/v1/competitions/{cid}/focus/heartbeat")).json()
    assert after["counted_violations"] == 1
    steady = (await guest.post(f"/api/v1/competitions/{cid}/focus/heartbeat")).json()
    assert steady["counted_violations"] == 1


async def test_non_members_cannot_see_or_report(make_client: MakeClient) -> None:
    _host, _guest, cid = await make_focus_room(make_client)
    stranger = make_client()
    await register(stranger, "stranger")
    assert (await stranger.get(f"/api/v1/competitions/{cid}/focus")).status_code == 404
    r = await stranger.post(f"/api/v1/competitions/{cid}/focus/events", json={"kind": "hidden"})
    assert r.status_code == 404
    bad = await stranger.post(f"/api/v1/competitions/{cid}/focus/events", json={"kind": "teleport"})
    assert bad.status_code == 422


async def test_network_delay_never_lengthens_an_absence(make_client: MakeClient, ctx: AppContext) -> None:
    """The "visible" request can arrive late; the browser's own measurement caps the duration."""
    _host, guest, cid = await run_focus_room(make_client)
    gid = await user_id(guest)
    await event(guest, cid, "hidden")
    await age_absence(ctx, cid, gid, 5)  # the server saw 5 s...
    back = await event(guest, cid, "visible", away_ms=600)  # ...the browser measured 0.6 s
    assert back["action"] == "ignored" and back["counted"] is False
    # Without a browser measurement the server's own timing applies.
    await event(guest, cid, "hidden")
    await age_absence(ctx, cid, gid, 5)
    assert (await event(guest, cid, "visible"))["action"] == "warn"
    # A browser claiming a longer absence than the server saw cannot lengthen it either.
    await event(guest, cid, "hidden")
    huge = await event(guest, cid, "visible", away_ms=3_600_000)
    assert huge["action"] == "ignored"
