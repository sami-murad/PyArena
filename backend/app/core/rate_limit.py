"""Rate limiting.

Two interchangeable implementations behind one async interface:

* ``MemoryRateLimiter``: sliding window in process memory. Correct only while
  the API runs as a single process (development, tests).
* ``RedisRateLimiter``: fixed window in Redis, shared by every API process.

``build_rate_limiter`` picks Redis when ``REDIS_URL`` is set.
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from typing import Protocol

from redis.asyncio import Redis
from redis.exceptions import RedisError

log = logging.getLogger("pyarena.ratelimit")


class RateLimiter(Protocol):
    enabled: bool

    async def hit(self, key: str, limit: int, window_seconds: float) -> float | None:
        """Record a hit. Returns ``None`` if allowed, else seconds until a retry may succeed."""
        ...

    async def reset(self) -> None: ...


class MemoryRateLimiter:
    def __init__(self, enabled: bool = True) -> None:
        self.enabled = enabled
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    async def hit(self, key: str, limit: int, window_seconds: float) -> float | None:
        if not self.enabled or limit <= 0:
            return None
        now = time.monotonic()
        bucket = self._hits[key]
        while bucket and bucket[0] <= now - window_seconds:
            bucket.popleft()
        if len(bucket) >= limit:
            return max(0.0, bucket[0] + window_seconds - now)
        bucket.append(now)
        if len(self._hits) > 50_000:  # keep memory bounded
            self._prune(now, window_seconds)
        return None

    def _prune(self, now: float, window_seconds: float) -> None:
        for key in [k for k, v in self._hits.items() if not v or v[-1] <= now - window_seconds]:
            del self._hits[key]

    async def reset(self) -> None:
        self._hits.clear()


class RedisRateLimiter:
    """Fixed-window counter: ``SET key 0 PX window NX`` + ``INCR`` + ``PTTL`` in one transaction.

    The window starts with the first hit and the key carries its own expiry, so
    a crash can never leave a counter without a TTL. At a window boundary a
    client can briefly get up to ``2 * limit`` requests through; that is the
    accepted trade-off of fixed windows versus a Lua sliding window.

    If Redis is unreachable the limiter *fails open* (allows the request) and
    logs a warning: an outage of the limiter should not take the site down.
    """

    def __init__(self, redis: Redis, enabled: bool = True, prefix: str = "pyarena:rl:") -> None:
        self.redis = redis
        self.enabled = enabled
        self.prefix = prefix

    async def hit(self, key: str, limit: int, window_seconds: float) -> float | None:
        if not self.enabled or limit <= 0:
            return None
        full_key = self.prefix + key
        window_ms = max(1, int(window_seconds * 1000))
        try:
            async with self.redis.pipeline(transaction=True) as pipe:
                pipe.set(full_key, 0, px=window_ms, nx=True)
                pipe.incr(full_key)
                pipe.pttl(full_key)
                _, count, ttl_ms = await pipe.execute()
        except RedisError as exc:
            log.warning("rate limiter unavailable, allowing request: %s", type(exc).__name__)
            return None
        if int(count) > limit:
            return max(0.0, int(ttl_ms) / 1000) if int(ttl_ms) > 0 else window_seconds
        return None

    async def reset(self) -> None:
        async for key in self.redis.scan_iter(match=self.prefix + "*"):
            await self.redis.delete(key)


def build_rate_limiter(redis: Redis | None, enabled: bool) -> RateLimiter:
    if redis is None:
        return MemoryRateLimiter(enabled=enabled)
    return RedisRateLimiter(redis, enabled=enabled)
