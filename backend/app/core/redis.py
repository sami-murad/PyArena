"""Optional Redis connection shared by rate limiting, presence and judge locks."""

from __future__ import annotations

from redis.asyncio import Redis


def create_redis(url: str) -> Redis | None:
    """Return a client for ``url``, or ``None`` when Redis is not configured."""
    if not url:
        return None
    return Redis.from_url(url, decode_responses=True, health_check_interval=30, socket_connect_timeout=3)
