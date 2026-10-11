from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from sqlalchemy import text

from app.dependencies import Ctx
from app.execution.client import ExecutionUnavailable

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(ctx: Ctx) -> dict[str, Any]:
    """Liveness plus a quick check of the database and the execution worker."""
    checks: dict[str, Any] = {}
    try:
        async with ctx.db.sessionmaker() as s:
            await s.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "unavailable"
    try:
        worker = await ctx.executor.health()
        checks["executor"] = "ok"
        checks["executor_mode"] = worker.get("mode")
    except ExecutionUnavailable:
        checks["executor"] = "unavailable"
    status = "ok" if all(v != "unavailable" for v in checks.values()) else "degraded"
    return {"status": status, "checks": checks}
