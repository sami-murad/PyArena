"""Shared fixtures.

* Database: SQLite in a temp file by default.  Set ``TEST_DATABASE_URL`` to a
  PostgreSQL URL to run the same suite against Postgres.
* Executor: the real judge-worker sandbox, imported from ../judge-worker and
  run in subprocesses, so judging tests execute real Python code.
"""

from __future__ import annotations

import os
import sys
from collections.abc import AsyncIterator, Callable
from pathlib import Path
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "judge-worker"))

from worker.sandbox import Limits, Sandbox  # noqa: E402

import app.models  # noqa: E402,F401
from app.config import Settings  # noqa: E402
from app.core.context import AppContext, build_context  # noqa: E402
from app.core.database import Base, Database  # noqa: E402
from app.execution.client import ExecLimits, ExecResult, ExecutionUnavailable  # noqa: E402
from app.main import create_fastapi_app  # noqa: E402
from app.seed import load_file, seed_questions  # noqa: E402
from app.websocket.events import RecordingBus  # noqa: E402

SEED_FILE = ROOT / "database" / "seeds" / "questions.json"


class SandboxExecutor:
    """Executor backed by the real sandbox (subprocesses), for tests."""

    def __init__(self) -> None:
        self.box = Sandbox(ceiling=Limits(cpu_seconds=3, wall_seconds=6, memory_mb=256), max_concurrent=4)
        self.calls = 0
        self.fail = False

    def _check(self) -> None:
        self.calls += 1
        if self.fail:
            raise ExecutionUnavailable("simulated outage")

    async def run(self, code: str, stdin: str, limits: ExecLimits) -> ExecResult:
        self._check()
        r = await self.box.run_script(code, stdin, Limits(**limits.as_dict()))
        return ExecResult.from_json(r.to_dict())

    async def call(self, code: str, function_name: str, args: list[Any], limits: ExecLimits) -> ExecResult:
        self._check()
        r = await self.box.call_function(code, function_name, args, Limits(**limits.as_dict()))
        return ExecResult.from_json(r.to_dict())

    async def health(self) -> dict[str, Any]:
        if self.fail:
            raise ExecutionUnavailable("down")
        return {"status": "ok", "mode": self.box.mode}


def make_settings(**overrides: Any) -> Settings:
    base: dict[str, Any] = {
        "environment": "test",
        "database_url": "sqlite+aiosqlite:///:memory:",
        "competition_min_players": 2,
        "competition_countdown_seconds": 0,
        "submission_cooldown_seconds": 0,
        "rate_execute_per_minute": 1000,
        "rate_login_per_minute": 1000,
        "rate_register_per_hour": 1000,
        "rate_join_per_minute": 1000,
        "rate_submit_per_minute": 1000,
    }
    base.update(overrides)
    return Settings(_env_file=None, **base)  # type: ignore[call-arg]


@pytest.fixture
def db_url(tmp_path: Path) -> str:
    return os.getenv("TEST_DATABASE_URL") or f"sqlite+aiosqlite:///{tmp_path / 'test.db'}"


@pytest.fixture
def executor() -> SandboxExecutor:
    return SandboxExecutor()


@pytest.fixture
def settings_overrides() -> dict[str, Any]:
    return {}


@pytest.fixture
async def ctx(db_url: str, executor: SandboxExecutor, settings_overrides: dict[str, Any]) -> AsyncIterator[AppContext]:
    settings = make_settings(database_url=db_url, **settings_overrides)
    db = Database(db_url)
    async with db.engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    async with db.sessionmaker() as session:
        await seed_questions(session, load_file(SEED_FILE))
    context = build_context(settings, executor, RecordingBus(), db=db)
    yield context
    await context.competitions.shutdown()
    async with db.engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await db.dispose()


@pytest.fixture
def make_client(ctx: AppContext) -> Callable[[], AsyncClient]:
    app = create_fastapi_app(ctx, start_background=False)
    clients: list[AsyncClient] = []

    def factory() -> AsyncClient:
        client = AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")
        clients.append(client)
        return client

    return factory


@pytest.fixture
async def client(make_client: Callable[[], AsyncClient]) -> AsyncClient:
    return make_client()


async def register(client: AsyncClient, username: str, password: str = "correct-horse-1") -> dict[str, Any]:
    r = await client.post(
        "/api/auth/register", json={"username": username, "email": f"{username}@pyarena.dev", "password": password}
    )
    assert r.status_code == 201, r.text
    return r.json()


async def question_id(client: AsyncClient, slug: str) -> int:
    r = await client.get("/api/questions")
    return next(q["id"] for q in r.json() if q["slug"] == slug)


def reference_solution(slug: str) -> str:
    return next(q["reference_solution"] for q in load_file(SEED_FILE) if q["slug"] == slug)
