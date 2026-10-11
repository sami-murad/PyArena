"""Alembic migrations: upgrade, model match, downgrade, upgrade again.

Runs on a temporary SQLite file, and also on PostgreSQL when
``TEST_DATABASE_URL`` points at one (that database is reset by the test).
"""

import asyncio
import os
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

import app.models  # noqa: F401
from app.core.database import Base

BACKEND = Path(__file__).resolve().parents[1]


def alembic(url: str, *args: str) -> str:
    env = {**os.environ, "DATABASE_URL": url}
    result = subprocess.run(  # noqa: S603 - fixed command, test-only
        [sys.executable, "-m", "alembic", *args], cwd=BACKEND, env=env, capture_output=True, text=True, timeout=120
    )
    assert result.returncode == 0, result.stdout + result.stderr
    return result.stdout + result.stderr


def urls(tmp_path: Path) -> list[str]:
    found = [f"sqlite+aiosqlite:///{tmp_path / 'migrations.db'}"]
    if os.getenv("TEST_DATABASE_URL", "").startswith("postgresql"):
        found.append(os.environ["TEST_DATABASE_URL"])
    return found


async def reset_database(url: str) -> None:
    engine = create_async_engine(url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.execute(text("DROP TABLE IF EXISTS alembic_version"))
    await engine.dispose()


@pytest.mark.parametrize("backend", ["sqlite", "postgresql"])
def test_migrations_round_trip(backend: str, tmp_path: Path) -> None:
    candidates = [u for u in urls(tmp_path) if u.startswith(backend)]
    if not candidates:
        pytest.skip("set TEST_DATABASE_URL to a PostgreSQL database to test migrations there")
    url = candidates[0]
    if backend == "postgresql":
        asyncio.run(reset_database(url))  # the shared test database may hold tables from other tests
    out = alembic(url, "upgrade", "head")
    assert "0004" in out
    assert "No new upgrade operations detected" in alembic(url, "check")
    alembic(url, "downgrade", "base")
    alembic(url, "upgrade", "head")
