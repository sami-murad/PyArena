"""Prometheus metrics.

Exposed at ``GET /metrics`` (not under ``/api``, and not proxied by nginx, so
only the internal network can scrape it). Counters and histograms are updated
as events happen; the two database gauges are refreshed on every scrape.
"""

from __future__ import annotations

from typing import Any

from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.execution.client import ExecLimits, ExecResult, ExecutionUnavailable, Executor
from app.models import Competition, Submission, SubmissionStatus
from app.models.competition import ACTIVE_STATUSES

JUDGE_QUEUE_DEPTH = Gauge("pyarena_judge_queue_depth", "Competition submissions waiting to be judged")
ACTIVE_COMPETITIONS = Gauge("pyarena_active_competitions", "Competitions not yet ended", ["status"])
SOCKET_CONNECTIONS = Gauge("pyarena_socket_connections", "Open Socket.IO connections on this process")
SANDBOX_KILLS = Counter("pyarena_sandbox_kills_total", "Runs stopped by the sandbox", ["reason"])
EXECUTOR_UNAVAILABLE = Counter("pyarena_executor_unavailable_total", "Failed calls to the judge worker", ["reason"])
SUBMISSION_LATENCY = Histogram(
    "pyarena_submission_latency_seconds",
    "Time from receiving a submission to its verdict",
    ["kind", "status"],
    buckets=(0.1, 0.25, 0.5, 1, 2, 4, 8, 15, 30, 60, 120),
)
HTTP_REQUESTS = Counter("pyarena_http_requests_total", "HTTP requests", ["method", "route", "status"])
HTTP_LATENCY = Histogram(
    "pyarena_http_request_duration_seconds",
    "HTTP request duration",
    ["method", "route"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
)
IDEMPOTENT_REPLAYS = Counter("pyarena_idempotent_replays_total", "Responses replayed for a repeated Idempotency-Key")


class InstrumentedExecutor:
    """Wraps any Executor to count sandbox kills and worker failures."""

    def __init__(self, inner: Executor) -> None:
        self.inner = inner

    def _observe(self, result: ExecResult) -> ExecResult:
        if result.kill_reason:
            SANDBOX_KILLS.labels(reason=result.kill_reason).inc()
        return result

    async def run(self, code: str, stdin: str, limits: ExecLimits) -> ExecResult:
        try:
            return self._observe(await self.inner.run(code, stdin, limits))
        except ExecutionUnavailable as exc:
            EXECUTOR_UNAVAILABLE.labels(reason=exc.reason).inc()
            raise

    async def call(self, code: str, function_name: str, args: list[Any], limits: ExecLimits) -> ExecResult:
        try:
            return self._observe(await self.inner.call(code, function_name, args, limits))
        except ExecutionUnavailable as exc:
            EXECUTOR_UNAVAILABLE.labels(reason=exc.reason).inc()
            raise

    async def health(self) -> dict[str, Any]:
        return await self.inner.health()

    async def close(self) -> None:
        close = getattr(self.inner, "close", None)
        if close is not None:
            await close()


def observe_submission(kind: str, submission: Submission) -> None:
    if submission.judged_at is not None:
        seconds = (submission.judged_at - submission.created_at).total_seconds()
        SUBMISSION_LATENCY.labels(kind=kind, status=submission.status).observe(max(0.0, seconds))


async def render_metrics(sessionmaker: async_sessionmaker[AsyncSession]) -> tuple[bytes, str]:
    async with sessionmaker() as s:
        pending = await s.scalar(
            select(func.count())
            .select_from(Submission)
            .where(Submission.status == SubmissionStatus.PENDING, Submission.competition_id.is_not(None))
        )
        rows = (
            await s.execute(
                select(Competition.status, func.count())
                .where(Competition.status.in_([str(x) for x in ACTIVE_STATUSES]))
                .group_by(Competition.status)
            )
        ).all()
    JUDGE_QUEUE_DEPTH.set(int(pending or 0))
    counts = {str(status): int(n) for status, n in rows}
    for status in ACTIVE_STATUSES:
        ACTIVE_COMPETITIONS.labels(status=str(status)).set(counts.get(str(status), 0))
    return generate_latest(), CONTENT_TYPE_LATEST
