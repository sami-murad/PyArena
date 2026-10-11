"""Application container: one place that wires settings, database and services."""

from __future__ import annotations

from dataclasses import dataclass

from redis.asyncio import Redis

from app.config import Settings
from app.core.database import Database
from app.core.idempotency import IdempotencyStore
from app.core.locks import JudgeLock, build_judge_lock
from app.core.metrics import InstrumentedExecutor
from app.core.rate_limit import RateLimiter, build_rate_limiter
from app.core.redis import create_redis
from app.execution.client import Executor
from app.services.competitions import CompetitionService
from app.services.judge import Judge
from app.websocket.events import EventBus, Presence, build_presence


@dataclass
class AppContext:
    settings: Settings
    db: Database
    redis: Redis | None
    executor: Executor
    judge: Judge
    limiter: RateLimiter
    presence: Presence
    judge_lock: JudgeLock
    idempotency: IdempotencyStore
    bus: EventBus
    competitions: CompetitionService

    async def close(self) -> None:
        await self.competitions.shutdown()
        close = getattr(self.executor, "close", None)
        if close is not None:
            await close()
        if self.redis is not None:
            await self.redis.aclose()
        await self.db.dispose()


def build_context(
    settings: Settings,
    executor: Executor,
    bus: EventBus,
    db: Database | None = None,
    redis: Redis | None = None,
) -> AppContext:
    database = db or Database(
        settings.database_url,
        echo=settings.database_echo,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_timeout=settings.db_pool_timeout_seconds,
        pool_recycle=settings.db_pool_recycle_seconds,
    )
    shared = redis if redis is not None else create_redis(settings.redis_url)
    instrumented = InstrumentedExecutor(executor)
    limiter = build_rate_limiter(shared, settings.rate_limit_enabled)
    presence = build_presence(shared)
    judge_lock = build_judge_lock(shared)
    idempotency = IdempotencyStore(database.sessionmaker, settings.idempotency_ttl_hours)
    judge = Judge(instrumented)
    competitions = CompetitionService(
        database.sessionmaker,
        settings,
        judge,
        bus,
        presence,
        limiter,
        judge_lock,
        maintenance=[idempotency.purge_expired],
    )
    return AppContext(
        settings=settings,
        db=database,
        redis=shared,
        executor=instrumented,
        judge=judge,
        limiter=limiter,
        presence=presence,
        judge_lock=judge_lock,
        idempotency=idempotency,
        bus=bus,
        competitions=competitions,
    )
