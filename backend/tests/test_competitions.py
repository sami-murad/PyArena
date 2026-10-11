import asyncio
from datetime import timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import update

from app.core.context import AppContext
from app.core.database import utcnow
from app.models import Competition, CompetitionStatus, Submission
from app.repositories.competitions import CompetitionRepository
from app.websocket import events as ev
from tests.conftest import reference_solution, register

WRONG = "def nope():\n    return 0\n"


async def make_room(make_client, **body: Any) -> tuple[AsyncClient, AsyncClient, dict[str, Any]]:  # type: ignore[no-untyped-def]
    host, guest = make_client(), make_client()
    await register(host, "host")
    await register(guest, "guest")
    created = await host.post("/api/competitions", json={"difficulty": "easy", **body})
    assert created.status_code == 201, created.text
    room = created.json()
    joined = await guest.post("/api/competitions/join", json={"code": room["code"].lower()})
    assert joined.status_code == 200, joined.text
    return host, guest, room


async def start_running(host: AsyncClient, guest: AsyncClient, cid: int) -> dict[str, Any]:
    assert (await guest.post(f"/api/competitions/{cid}/ready", json={"ready": True})).status_code == 200
    r = await host.post(f"/api/competitions/{cid}/start")
    assert r.status_code == 200, r.text
    return r.json()


async def test_full_competition_lifecycle(make_client, ctx: AppContext) -> None:  # type: ignore[no-untyped-def]
    host, guest, room = await make_room(make_client)
    cid = room["id"]
    assert room["status"] == "WAITING"
    assert room["question"] is None
    assert len(room["code"]) == 8

    blocked = await host.post(f"/api/competitions/{cid}/start")
    assert blocked.status_code == 409
    assert "guest" in blocked.json()["detail"]

    not_host = await guest.post(f"/api/competitions/{cid}/start")
    assert not_host.status_code == 403

    state = await start_running(host, guest, cid)
    assert state["status"] == "RUNNING"
    question = state["question"]
    assert question is not None and question["examples"]

    outsider = make_client()
    await register(outsider, "outsider")
    assert (await outsider.get(f"/api/competitions/{cid}")).status_code == 404
    late = await outsider.post("/api/competitions/join", json={"code": room["code"]})
    assert late.status_code == 409

    wrong = await guest.post(f"/api/competitions/{cid}/submissions", json={"code": WRONG})
    assert wrong.status_code == 202
    await ctx.competitions.wait_for_judging(cid)
    sub = (await guest.get(f"/api/submissions/{wrong.json()['id']}")).json()
    assert sub["status"] in ("WRONG_ANSWER", "RUNTIME_ERROR")
    assert (await guest.get(f"/api/competitions/{cid}")).json()["winner"] is None

    slug = question["slug"]
    right = await guest.post(f"/api/competitions/{cid}/submissions", json={"code": reference_solution(slug)})
    assert right.status_code == 202
    await ctx.competitions.wait_for_judging(cid)

    final = (await host.get(f"/api/competitions/{cid}")).json()
    assert final["status"] == "FINISHED"
    assert final["finish_reason"] == "solved"
    assert final["winner"]["username"] == "guest"
    assert final["winner"]["submission_id"] == right.json()["id"]
    assert final["question"]["explanation"]  # revealed after the end

    after = await host.post(f"/api/competitions/{cid}/submissions", json={"code": reference_solution(slug)})
    assert after.status_code == 409

    results = (await host.get(f"/api/competitions/{cid}/results")).json()
    assert results["players"][0]["username"] == "guest"
    assert results["players"][0]["is_winner"] is True
    assert [t["is_winning"] for t in results["timeline"]] == [False, True]
    assert "receipt" in results["tie_break_rule"] or "received" in results["tie_break_rule"]

    bus = ctx.bus
    names = [e for e, _, _ in bus.events]  # type: ignore[attr-defined]
    for expected in (
        ev.COMPETITION_COUNTDOWN,
        ev.COMPETITION_STARTED,
        ev.SUBMISSION_RECEIVED,
        ev.SUBMISSION_RESULT,
        ev.COMPETITION_WINNER,
        ev.COMPETITION_FINISHED,
        ev.ROOM_STATE,
    ):
        assert expected in names, expected
    assert all(room_name == ev.competition_room(cid) for _, _, room_name in bus.events)  # type: ignore[attr-defined]
    winners = bus.named(ev.COMPETITION_WINNER)  # type: ignore[attr-defined]
    assert len(winners) == 1


async def test_simultaneous_correct_submissions_have_one_winner(make_client, ctx: AppContext) -> None:  # type: ignore[no-untyped-def]
    host, guest, room = await make_room(make_client)
    cid = room["id"]
    state = await start_running(host, guest, cid)
    code = reference_solution(state["question"]["slug"])

    a, b = await asyncio.gather(
        host.post(f"/api/competitions/{cid}/submissions", json={"code": code}),
        guest.post(f"/api/competitions/{cid}/submissions", json={"code": code}),
    )
    assert a.status_code == b.status_code == 202
    await ctx.competitions.wait_for_judging(cid)

    final = (await host.get(f"/api/competitions/{cid}")).json()
    first_id = min(a.json()["id"], b.json()["id"])
    assert final["winner"]["submission_id"] == first_id  # deterministic: earliest received wins
    statuses = {s["id"]: s["status"] for s in (await host.get(f"/api/competitions/{cid}/results")).json()["timeline"]}
    assert statuses[first_id] == "ACCEPTED"
    assert len(ctx.bus.named(ev.COMPETITION_WINNER)) == 1  # type: ignore[attr-defined]


async def test_claim_winner_is_atomic(make_client, ctx: AppContext) -> None:  # type: ignore[no-untyped-def]
    host, guest, room = await make_room(make_client)
    cid = room["id"]
    await start_running(host, guest, cid)
    async with ctx.db.sessionmaker() as s:
        comp = await CompetitionRepository(s).get(cid)
        assert comp is not None
        subs = [
            Submission(user_id=uid, question_id=comp.question_id, code="x", competition_id=cid)
            for uid in (comp.host_id, comp.players[1].user_id)
        ]
        s.add_all(subs)
        await s.commit()
        ids = [x.id for x in subs]
        users = [x.user_id for x in subs]

    async def claim(i: int) -> bool:
        async with ctx.db.sessionmaker() as s:
            won = await CompetitionRepository(s).claim_winner(cid, ids[i], users[i], utcnow())
            await s.commit()
            return won

    results = await asyncio.gather(claim(0), claim(1), claim(0), claim(1))
    assert results.count(True) == 1


async def test_duplicate_submission_while_pending_is_rejected(make_client, ctx: AppContext) -> None:  # type: ignore[no-untyped-def]
    host, guest, room = await make_room(make_client)
    cid = room["id"]
    await start_running(host, guest, cid)
    slow = "import time\ntime.sleep(0.6)\n" + WRONG
    first = await guest.post(f"/api/competitions/{cid}/submissions", json={"code": slow})
    second = await guest.post(f"/api/competitions/{cid}/submissions", json={"code": slow})
    assert first.status_code == 202
    assert second.status_code == 409
    assert second.json()["code"] == "pending"
    await ctx.competitions.wait_for_judging(cid)


async def test_participant_limit(make_client) -> None:  # type: ignore[no-untyped-def]
    host, guest, room = await make_room(make_client, max_players=2)
    third = make_client()
    await register(third, "third")
    r = await third.post("/api/competitions/join", json={"code": room["code"]})
    assert r.status_code == 409 and r.json()["code"] == "full"
    bad = await third.post("/api/competitions/join", json={"code": "ZZZZZZZZ"})
    assert bad.status_code == 404


async def test_host_leaving_transfers_host_then_room_cancels(make_client) -> None:  # type: ignore[no-untyped-def]
    host, guest, room = await make_room(make_client)
    cid = room["id"]
    assert (await host.post(f"/api/competitions/{cid}/leave")).status_code == 204
    state = (await guest.get(f"/api/competitions/{cid}")).json()
    assert state["participants"][0]["username"] == "guest"
    assert state["participants"][0]["is_host"] is True
    assert (await guest.post(f"/api/competitions/{cid}/leave")).status_code == 204
    final = (await guest.get(f"/api/competitions/{cid}")).json()
    assert final["status"] == "CANCELLED"


async def test_idle_lobby_expires(make_client, ctx: AppContext) -> None:  # type: ignore[no-untyped-def]
    host, _, room = await make_room(make_client)
    cid = room["id"]
    async with ctx.db.sessionmaker() as s:
        await s.execute(
            update(Competition).where(Competition.id == cid).values(last_activity_at=utcnow() - timedelta(hours=5))
        )
        await s.commit()
    state = (await host.get(f"/api/competitions/{cid}")).json()
    assert state["status"] == "EXPIRED"
    assert (await host.post(f"/api/competitions/{cid}/start")).status_code == 409


async def test_time_up_without_winner(make_client, ctx: AppContext) -> None:  # type: ignore[no-untyped-def]
    host, guest, room = await make_room(make_client)
    cid = room["id"]
    await start_running(host, guest, cid)
    async with ctx.db.sessionmaker() as s:
        await s.execute(
            update(Competition).where(Competition.id == cid).values(ends_at=utcnow() - timedelta(seconds=1))
        )
        await s.commit()
    state = (await host.get(f"/api/competitions/{cid}")).json()
    assert state["status"] == "FINISHED"
    assert state["finish_reason"] == "time_up"
    assert state["winner"] is None
    r = await host.post(f"/api/competitions/{cid}/submissions", json={"code": WRONG})
    assert r.status_code == 409


@pytest.mark.parametrize("settings_overrides", [{"competition_countdown_seconds": 30}])
async def test_question_hidden_during_countdown(make_client, ctx: AppContext) -> None:  # type: ignore[no-untyped-def]
    host, guest, room = await make_room(make_client)
    cid = room["id"]
    state = await start_running(host, guest, cid)
    assert state["status"] == "COUNTDOWN"
    assert state["question"] is None
    assert state["starts_at"] is not None
    early = await guest.post(f"/api/competitions/{cid}/submissions", json={"code": WRONG})
    assert early.status_code == 409 and early.json()["code"] == "not_started"
    countdown = ctx.bus.named(ev.COMPETITION_COUNTDOWN)  # type: ignore[attr-defined]
    assert countdown and "question" not in countdown[0]


async def test_judge_outage_does_not_count_and_does_not_win(make_client, ctx: AppContext, executor) -> None:  # type: ignore[no-untyped-def]
    host, guest, room = await make_room(make_client)
    cid = room["id"]
    state = await start_running(host, guest, cid)
    executor.fail = True
    r = await guest.post(
        f"/api/competitions/{cid}/submissions", json={"code": reference_solution(state["question"]["slug"])}
    )
    await ctx.competitions.wait_for_judging(cid)
    sub = (await guest.get(f"/api/submissions/{r.json()['id']}")).json()
    assert sub["status"] == "SYSTEM_ERROR"
    assert (await guest.get(f"/api/competitions/{cid}")).json()["status"] == "RUNNING"
    executor.fail = False
    again = await guest.post(
        f"/api/competitions/{cid}/submissions", json={"code": reference_solution(state["question"]["slug"])}
    )
    assert again.status_code == 202
    await ctx.competitions.wait_for_judging(cid)
    assert (await guest.get(f"/api/competitions/{cid}")).json()["winner"]["username"] == "guest"


@pytest.mark.parametrize("settings_overrides", [{"submission_cooldown_seconds": 30}])
async def test_submission_cooldown(make_client, ctx: AppContext) -> None:  # type: ignore[no-untyped-def]
    host, guest, room = await make_room(make_client)
    cid = room["id"]
    await start_running(host, guest, cid)
    assert (await guest.post(f"/api/competitions/{cid}/submissions", json={"code": WRONG})).status_code == 202
    await ctx.competitions.wait_for_judging(cid)
    again = await guest.post(f"/api/competitions/{cid}/submissions", json={"code": WRONG})
    assert again.status_code == 429
    assert "Retry-After" in again.headers


async def test_left_player_cannot_submit_and_my_list(make_client, ctx: AppContext) -> None:  # type: ignore[no-untyped-def]
    host, guest, room = await make_room(make_client)
    cid = room["id"]
    await start_running(host, guest, cid)
    await guest.post(f"/api/competitions/{cid}/leave")
    r = await guest.post(f"/api/competitions/{cid}/submissions", json={"code": WRONG})
    assert r.status_code == 403
    mine = (await host.get("/api/competitions")).json()
    assert mine[0]["id"] == cid and mine[0]["is_host"] is True
    assert CompetitionStatus.RUNNING == mine[0]["status"]
