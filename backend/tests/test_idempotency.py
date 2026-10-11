"""Idempotency-Key on POST /execute, /submissions and /competitions/{id}/submissions."""

import asyncio
from datetime import timedelta

from httpx import AsyncClient
from sqlalchemy import func, select, update

from app.core.context import AppContext
from app.core.database import utcnow
from app.models import IdempotencyKey, Submission
from tests.conftest import question_id, reference_solution, register

V1 = "/api/v1"


async def test_execute_replays_instead_of_running_again(client: AsyncClient, executor) -> None:  # type: ignore[no-untyped-def]
    headers = {"Idempotency-Key": "run-0001-abcdef"}
    first = await client.post(f"{V1}/execute", json={"code": "print(7)"}, headers=headers)
    calls = executor.calls
    second = await client.post(f"{V1}/execute", json={"code": "print(7)"}, headers=headers)
    assert first.status_code == second.status_code == 200
    assert second.json() == first.json()
    assert second.headers.get("idempotent-replayed") == "true"
    assert "idempotent-replayed" not in first.headers
    assert executor.calls == calls  # the sandbox was not called again


async def test_same_key_different_body_is_rejected(client: AsyncClient) -> None:
    headers = {"Idempotency-Key": "run-0002-abcdef"}
    await client.post(f"{V1}/execute", json={"code": "print(1)"}, headers=headers)
    other = await client.post(f"{V1}/execute", json={"code": "print(2)"}, headers=headers)
    assert other.status_code == 422
    assert other.json()["code"] == "key_reused"


async def test_invalid_key_format(client: AsyncClient) -> None:
    r = await client.post(f"{V1}/execute", json={"code": "print(1)"}, headers={"Idempotency-Key": "bad key!"})
    assert r.status_code == 400
    assert r.json()["code"] == "bad_key"


async def test_errors_are_not_stored_so_a_fixed_retry_works(client: AsyncClient, executor) -> None:  # type: ignore[no-untyped-def]
    headers = {"Idempotency-Key": "run-0003-abcdef"}
    executor.fail = True
    failed = await client.post(f"{V1}/execute", json={"code": "print(1)"}, headers=headers)
    assert failed.status_code == 503
    executor.fail = False
    retried = await client.post(f"{V1}/execute", json={"code": "print(1)"}, headers=headers)
    assert retried.status_code == 200
    assert "idempotent-replayed" not in retried.headers


async def test_keys_are_scoped_per_user(make_client) -> None:  # type: ignore[no-untyped-def]
    alice, bob = make_client(), make_client()
    await register(alice, "alice_idem")
    await register(bob, "bob_idem")
    qid = await question_id(alice, "count-vowels")
    headers = {"Idempotency-Key": "shared-key-0001"}
    a = await alice.post(f"{V1}/submissions", json={"question_id": qid, "code": "x"}, headers=headers)
    b = await bob.post(f"{V1}/submissions", json={"question_id": qid, "code": "x"}, headers=headers)
    assert a.status_code == b.status_code == 201
    assert a.json()["id"] != b.json()["id"]  # bob never sees alice's stored response
    assert "idempotent-replayed" not in b.headers


async def test_retried_competition_submission_is_created_once(make_client, ctx: AppContext) -> None:  # type: ignore[no-untyped-def]
    host, guest = make_client(), make_client()
    await register(host, "idem_host")
    await register(guest, "idem_guest")
    room = (await host.post(f"{V1}/competitions", json={"difficulty": "easy"})).json()
    cid = room["id"]
    await guest.post(f"{V1}/competitions/join", json={"code": room["code"]})
    await guest.post(f"{V1}/competitions/{cid}/ready", json={"ready": True})
    state = (await host.post(f"{V1}/competitions/{cid}/start")).json()
    code = reference_solution(state["question"]["slug"])
    headers = {"Idempotency-Key": "submit-attempt-0001"}

    first = await guest.post(f"{V1}/competitions/{cid}/submissions", json={"code": code}, headers=headers)
    await ctx.competitions.wait_for_judging(cid)
    retry = await guest.post(f"{V1}/competitions/{cid}/submissions", json={"code": code}, headers=headers)
    assert first.status_code == retry.status_code == 202
    assert retry.json()["id"] == first.json()["id"]
    assert retry.headers.get("idempotent-replayed") == "true"
    async with ctx.db.sessionmaker() as s:
        count = await s.scalar(select(func.count()).select_from(Submission).where(Submission.competition_id == cid))
    assert count == 1


async def test_concurrent_duplicates_run_once(client: AsyncClient, executor) -> None:  # type: ignore[no-untyped-def]
    headers = {"Idempotency-Key": "race-key-000001"}
    before = executor.calls
    slow = "import time\ntime.sleep(0.5)\nprint('done')"
    a, b = await asyncio.gather(
        client.post(f"{V1}/execute", json={"code": slow}, headers=headers),
        client.post(f"{V1}/execute", json={"code": slow}, headers=headers),
    )
    assert sorted([a.status_code, b.status_code]) == [200, 409]
    assert executor.calls == before + 1


async def test_expired_keys_are_forgotten(client: AsyncClient, ctx: AppContext) -> None:
    headers = {"Idempotency-Key": "old-key-0000001"}
    await client.post(f"{V1}/execute", json={"code": "print(1)"}, headers=headers)
    async with ctx.db.sessionmaker() as s:
        await s.execute(update(IdempotencyKey).values(expires_at=utcnow() - timedelta(seconds=1)))
        await s.commit()
    again = await client.post(f"{V1}/execute", json={"code": "print(1)"}, headers=headers)
    assert "idempotent-replayed" not in again.headers
    async with ctx.db.sessionmaker() as s:
        await s.execute(update(IdempotencyKey).values(expires_at=utcnow() - timedelta(seconds=1)))
        await s.commit()
    assert await ctx.idempotency.purge_expired() == 1


async def test_without_the_header_nothing_changes(client: AsyncClient, ctx: AppContext) -> None:
    await client.post(f"{V1}/execute", json={"code": "print(1)"})
    async with ctx.db.sessionmaker() as s:
        assert await s.scalar(select(func.count()).select_from(IdempotencyKey)) == 0
