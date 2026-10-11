"""WorkerExecutor: how worker failures are reported (no real network needed)."""

import httpx
import pytest

from app.execution.client import ExecLimits, ExecutionUnavailable, WorkerExecutor


def executor_with(handler) -> WorkerExecutor:  # type: ignore[no-untyped-def]
    ex = WorkerExecutor("http://worker:8001", "secret-token", timeout_seconds=5)
    ex._client = httpx.AsyncClient(
        base_url="http://worker:8001",
        transport=httpx.MockTransport(handler),
        headers={"X-Worker-Token": "secret-token"},
    )
    return ex


async def test_sends_token_and_passes_kill_reason_through() -> None:
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["token"] = request.headers["X-Worker-Token"]
        seen["path"] = request.url.path
        return httpx.Response(200, json={"status": "TIMEOUT", "stdout": "", "stderr": "", "kill_reason": "wall"})

    result = await executor_with(handler).run("x", "", ExecLimits())
    assert seen == {"token": "secret-token", "path": "/run"}
    assert result.status == "TIMEOUT"
    assert result.kill_reason == "wall"


async def test_connect_error_is_unreachable() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    with pytest.raises(ExecutionUnavailable) as info:
        await executor_with(handler).run("x", "", ExecLimits())
    assert info.value.reason == "unreachable"
    assert "worker:8001" in info.value.detail


async def test_timeout_is_reported_as_timeout() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    with pytest.raises(ExecutionUnavailable) as info:
        await executor_with(handler).run("x", "", ExecLimits())
    assert info.value.reason == "timeout"


async def test_http_error_surfaces_the_worker_body() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"detail": "invalid worker token"})

    with pytest.raises(ExecutionUnavailable) as info:
        await executor_with(handler).call("x", "f", [], ExecLimits())
    assert info.value.reason == "auth"
    assert info.value.detail == "invalid worker token"


async def test_worker_internal_error_is_not_a_user_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"status": "INTERNAL_ERROR", "stderr": "Execution service error: OSError"})

    with pytest.raises(ExecutionUnavailable) as info:
        await executor_with(handler).run("x", "", ExecLimits())
    assert info.value.reason == "internal"
    assert "OSError" in info.value.detail
