"""Application container: one place that wires settings, database and services."""

from __future__ import annotations

from dataclasses import dataclass

from app.config import Settings
from app.core.database import Database
from app.core.rate_limit import RateLimiter
from app.execution.client import Executor
from app.services.competitions import CompetitionService
from app.services.judge import Judge
from app.websocket.events import EventBus, Presence


@dataclass
class AppContext:
    settings: Settings
    db: Database
    executor: Executor
    judge: Judge
    limiter: RateLimiter
    presence: Presence
    bus: EventBus
    competitions: CompetitionService


def build_context(settings: Settings, executor: Executor, bus: EventBus, db: Database | None = None) -> AppContext:
    database = db or Database(settings.database_url, echo=settings.database_echo)
    limiter = RateLimiter(enabled=settings.rate_limit_enabled)
    presence = Presence()
    judge = Judge(executor)
    competitions = CompetitionService(database.sessionmaker, settings, judge, bus, presence, limiter)
    return AppContext(
        settings=settings,
        db=database,
        executor=executor,
        judge=judge,
        limiter=limiter,
        presence=presence,
        bus=bus,
        competitions=competitions,
    )
