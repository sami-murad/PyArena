"""Per-competition judge lock.

The fairness rule says submissions of one competition are judged one at a
time, in server-receipt order. With several API processes, each process would
otherwise start its own judge loop for the same competition. The lock makes
sure only one process drains a competition at any moment; the others skip and
rely on the holder (or on the sweeper after the lock expires).

The winner itself is still decided by the atomic ``claim_winner`` UPDATE, so
even a lock failure could never produce two winners; the lock protects the
*ordering* guarantee.
"""

from __future__ import annotations

import logging
import secrets
from typing import Protocol

from redis.asyncio import Redis
from redis.exceptions import RedisError

log = logging.getLogger("pyarena.locks")

JUDGE_LOCK_TTL_MS = 120_000  # longer than judging one submission (tests x wall limit)
# Returned when Redis is down: judging continues without cross-process coordination.
UNCOORDINATED = "uncoordinated"  # noqa: S105 - a sentinel value, not a credential


class JudgeLock(Protocol):
    async def acquire(self, competition_id: int) -> str | None:
        """Return a token if this process now owns the lock, else ``None``."""
        ...

    async def refresh(self, competition_id: int, token: str) -> bool: ...

    async def release(self, competition_id: int, token: str) -> None: ...


class LocalJudgeLock:
    """Single process: the in-process judge loop registry already serialises work."""

    async def acquire(self, competition_id: int) -> str | None:
        return "local"

    async def refresh(self, competition_id: int, token: str) -> bool:
        return True

    async def release(self, competition_id: int, token: str) -> None:
        return None


class RedisJudgeLock:
    def __init__(self, redis: Redis, prefix: str = "pyarena:judge-lock:") -> None:
        self.redis = redis
        self.prefix = prefix

    async def acquire(self, competition_id: int) -> str | None:
        token = secrets.token_hex(16)
        try:
            ok = await self.redis.set(self.prefix + str(competition_id), token, nx=True, px=JUDGE_LOCK_TTL_MS)
        except RedisError as exc:
            # Without Redis we cannot coordinate; judging still proceeds because
            # the database guarantees a single winner.
            log.warning("judge lock unavailable for competition %s: %s", competition_id, type(exc).__name__)
            return UNCOORDINATED
        return token if ok else None

    async def refresh(self, competition_id: int, token: str) -> bool:
        if token == UNCOORDINATED:
            return True
        key = self.prefix + str(competition_id)
        try:
            if await self.redis.get(key) != token:
                return False
            await self.redis.pexpire(key, JUDGE_LOCK_TTL_MS)
            return True
        except RedisError:
            return True

    async def release(self, competition_id: int, token: str) -> None:
        if token == UNCOORDINATED:
            return
        key = self.prefix + str(competition_id)
        try:
            # Small window between GET and DEL is acceptable: the worst case is
            # deleting a lock that expired and was re-taken in that instant, and
            # the next holder still judges in id order.
            if await self.redis.get(key) == token:
                await self.redis.delete(key)
        except RedisError:
            pass


def build_judge_lock(redis: Redis | None) -> JudgeLock:
    return LocalJudgeLock() if redis is None else RedisJudgeLock(redis)
