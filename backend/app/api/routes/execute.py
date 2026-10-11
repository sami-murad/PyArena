from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import Ctx, rate_limit
from app.execution.client import ExecLimits, ExecutionUnavailable
from app.execution.explanations import explain
from app.schemas.execution import ExecuteRequest, ExecuteResponse, ExplanationOut

router = APIRouter(tags=["playground"])


@router.post(
    "/execute",
    response_model=ExecuteResponse,
    dependencies=[Depends(rate_limit("execute", "rate_execute_per_minute", 60, per_user=True))],
)
async def execute(body: ExecuteRequest, ctx: Ctx) -> ExecuteResponse:
    """Run playground code in the isolated worker.  Open to everyone, rate limited."""
    s = ctx.settings
    if len(body.code) > s.max_code_chars:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Code is limited to {s.max_code_chars} characters.")
    if len(body.stdin) > s.max_stdin_chars:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, f"Input is limited to {s.max_stdin_chars} characters."
        )
    limits = ExecLimits(
        cpu_seconds=s.playground_cpu_seconds, wall_seconds=s.playground_wall_seconds, memory_mb=s.playground_memory_mb
    )
    try:
        result = await ctx.executor.run(body.code, body.stdin, limits)
    except ExecutionUnavailable as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "The code runner is unavailable right now. Check that the judge worker is running, then try again.",
        ) from exc
    explanation = explain(result.status, result.error_type, result.stderr)
    return ExecuteResponse(
        status=result.status,
        stdout=result.stdout,
        stderr=result.stderr,
        exit_code=result.exit_code,
        duration_ms=result.duration_ms,
        truncated=result.truncated,
        error_type=result.error_type,
        explanation=ExplanationOut(**explanation.to_dict()) if explanation else None,
    )
