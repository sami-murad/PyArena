"""Health checks.

* ``/health/live``: the process is up and serving. Never touches dependencies,
  so a database outage does not make an orchestrator restart healthy processes.
* ``/health/ready``: database, judge worker and (when configured) Redis are all
  reachable. Returns 503 when any is not, so a load balancer stops routing here.
* ``/health``: the original combined check, kept for compatibility (always 200).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from redis.exceptions import RedisError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.context import AppContext
from app.dependencies import Ctx
from app.execution.client import ExecutionUnavailable

router = APIRouter(tags=["health"])


async def _checks(ctx: AppContext) -> dict[str, Any]:
    checks: dict[str, Any] = {}
    try:
        async with ctx.db.sessionmaker() as s:
            await s.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except (SQLAlchemyError, OSError):
        checks["database"] = "unavailable"
    try:
        worker = await ctx.executor.health()
        checks["executor"] = "ok"
        checks["executor_mode"] = worker.get("mode")
    except ExecutionUnavailable:
        checks["executor"] = "unavailable"
    if ctx.redis is not None:
        try:
            await ctx.redis.ping()
            checks["redis"] = "ok"
        except (RedisError, OSError):
            checks["redis"] = "unavailable"
    else:
        checks["redis"] = "not_configured"
    return checks


def _status(checks: dict[str, Any]) -> str:
    return "ok" if all(v != "unavailable" for v in checks.values()) else "degraded"


@router.get("/health/live")
async def live() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/ready")
async def ready(ctx: Ctx) -> JSONResponse:
    checks = await _checks(ctx)
    state = _status(checks)
    return JSONResponse({"status": state, "checks": checks}, status_code=200 if state == "ok" else 503)


@router.get("/health")
async def health(ctx: Ctx) -> dict[str, Any]:
    checks = await _checks(ctx)
    return {"status": _status(checks), "checks": checks}
