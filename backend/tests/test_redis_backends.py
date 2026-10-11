"""Redis-backed rate limiter, presence and judge lock.

Runs against fakeredis always, and also against a real Redis server when
``REDIS_TEST_URL`` is set (for example redis://localhost:6379/15).
"""

import os
from collections.abc import AsyncIterator

import pytest
from fakeredis import FakeAsyncRedis
from redis.asyncio import Redis

from app.core.locks import UNCOORDINATED, RedisJudgeLock
from app.core.rate_limit import RedisRateLimiter
from app.websocket.events import RedisPresence

REAL = os.getenv("REDIS_TEST_URL", "")


@pytest.fixture(params=["fake", "real"])
async def redis(request: pytest.FixtureRequest) -> AsyncIterator[Redis]:
    if request.param == "fake":
        client: Redis = FakeAsyncRedis(decode_responses=True)
    else:
        if not REAL:
            pytest.skip("set REDIS_TEST_URL to also test against a real Redis server")
        client = Redis.from_url(REAL, decode_responses=True)
    await client.flushdb()
    yield client
    await client.flushdb()
    await client.aclose()


async def test_rate_limiter_allows_then_blocks(redis: Redis) -> None:
    limiter = RedisRateLimiter(redis)
    assert [await limiter.hit("login:ip:1", 3, 60) for _ in range(3)] == [None, None, None]
    retry = await limiter.hit("login:ip:1", 3, 60)
    assert retry is not None and 0 < retry <= 60
    assert await limiter.hit("login:ip:2", 3, 60) is None  # other keys unaffected


async def test_rate_limiter_counter_always_has_a_ttl(redis: Redis) -> None:
    limiter = RedisRateLimiter(redis)
    await limiter.hit("k", 5, 30)
    ttl = await redis.pttl("pyarena:rl:k")
    assert 0 < ttl <= 30_000


async def test_rate_limiter_window_expires(redis: Redis) -> None:
    limiter = RedisRateLimiter(redis)
    assert await limiter.hit("short", 1, 0.2) is None
    assert await limiter.hit("short", 1, 0.2) is not None
    import asyncio

    await asyncio.sleep(0.35)
    assert await limiter.hit("short", 1, 0.2) is None


async def test_rate_limiter_fails_open_when_redis_is_down() -> None:
    broken = Redis.from_url("redis://127.0.0.1:1/0", socket_connect_timeout=0.2)
    limiter = RedisRateLimiter(broken)
    assert await limiter.hit("x", 1, 60) is None
    assert await limiter.hit("x", 1, 60) is None
    await broken.aclose()


async def test_presence_is_shared_between_processes(redis: Redis) -> None:
    # Two RedisPresence objects stand in for two API processes.
    a, b = RedisPresence(redis), RedisPresence(redis)
    await a.add(7, 100, "sid-a")
    await b.add(7, 200, "sid-b")
    await b.add(7, 100, "sid-c")  # user 100 also connected through process b
    assert await a.online(7) == {100, 200}
    assert await a.remove(7, 100, "sid-a") is False  # still connected via sid-c
    assert await b.online(7) == {100, 200}
    assert await b.remove(7, 100, "sid-c") is True
    assert await a.online(7) == {200}
    assert b.rooms_of("sid-b") == {7}


async def test_presence_counts_a_socket_once(redis: Redis) -> None:
    p = RedisPresence(redis)
    await p.add(1, 5, "s")
    await p.add(1, 5, "s")  # duplicate room:join from the same socket
    assert await p.remove(1, 5, "s") is True
    assert await p.online(1) == set()


async def test_judge_lock_is_exclusive(redis: Redis) -> None:
    a, b = RedisJudgeLock(redis), RedisJudgeLock(redis)
    token = await a.acquire(42)
    assert token is not None
    assert await b.acquire(42) is None
    assert await a.refresh(42, token) is True
    assert await b.refresh(42, "not-the-owner") is False
    await b.release(42, "not-the-owner")  # must not release someone else's lock
    assert await b.acquire(42) is None
    await a.release(42, token)
    assert await b.acquire(42) is not None


async def test_judge_lock_degrades_without_redis() -> None:
    broken = Redis.from_url("redis://127.0.0.1:1/0", socket_connect_timeout=0.2)
    lock = RedisJudgeLock(broken)
    token = await lock.acquire(1)
    assert token == UNCOORDINATED
    assert await lock.refresh(1, token) is True
    await lock.release(1, token)
    await broken.aclose()
