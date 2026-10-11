"""Client for the isolated judge worker.

The API process never executes user code.  It forwards jobs over HTTP to the
judge worker (``judge-worker/``) which runs them in restricted processes.
``Executor`` is a protocol so tests can swap in a fake, and so a different
engine (for example Judge0 on a Linux server) can be plugged in later.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx

log = logging.getLogger("pyarena.execution")


class ExecutionUnavailable(Exception):
    """The execution service could not be reached or failed internally.

    ``reason`` is a short machine-readable code (``unreachable``, ``timeout``,
    ``auth``, ``bad_status``, ``internal``) and ``detail`` carries what the
    worker said, for logs and development-mode error messages.
    """

    def __init__(self, message: str, reason: str = "internal", detail: str = "") -> None:
        super().__init__(message)
        self.reason = reason
        self.detail = detail


@dataclass
class ExecLimits:
    cpu_seconds: float = 2.0
    wall_seconds: float = 5.0
    memory_mb: int = 256
    max_output_bytes: int = 64 * 1024

    def as_dict(self) -> dict[str, Any]:
        return {
            "cpu_seconds": self.cpu_seconds,
            "wall_seconds": self.wall_seconds,
            "memory_mb": self.memory_mb,
            "max_output_bytes": self.max_output_bytes,
        }


@dataclass
class ExecResult:
    status: str
    stdout: str = ""
    stderr: str = ""
    exit_code: int | None = None
    duration_ms: int = 0
    truncated: bool = False
    error_type: str | None = None
    kill_reason: str | None = None
    return_value: Any = None
    has_return_value: bool = False
    extra: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> ExecResult:
        known = {k: data.get(k) for k in cls.__dataclass_fields__ if k != "extra" and k in data}
        result = cls(status=str(data.get("status", "INTERNAL_ERROR")))
        for key, value in known.items():
            setattr(result, key, value)
        return result


class Executor(Protocol):
    async def run(self, code: str, stdin: str, limits: ExecLimits) -> ExecResult: ...

    async def call(self, code: str, function_name: str, args: list[Any], limits: ExecLimits) -> ExecResult: ...

    async def health(self) -> dict[str, Any]: ...


def _worker_detail(response: httpx.Response) -> str:
    """The worker's own error message, shortened for logs."""
    try:
        body = response.json()
        detail = body.get("detail", body) if isinstance(body, dict) else body
    except ValueError:
        detail = response.text
    return str(detail)[:300]


class WorkerExecutor:
    def __init__(self, base_url: str, token: str, timeout_seconds: float, connect_timeout_seconds: float = 3.0) -> None:
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            timeout=httpx.Timeout(timeout_seconds, connect=connect_timeout_seconds),
            headers={"X-Worker-Token": token},
        )

    async def _post(self, path: str, payload: dict[str, Any]) -> ExecResult:
        try:
            response = await self._client.post(path, json=payload)
        except httpx.ConnectError as exc:
            log.warning("judge worker unreachable at %s: %s", self._client.base_url, exc)
            raise ExecutionUnavailable(
                "execution service unreachable", "unreachable", f"cannot connect to {self._client.base_url}"
            ) from exc
        except httpx.TimeoutException as exc:
            log.warning("judge worker timed out: %s", type(exc).__name__)
            raise ExecutionUnavailable("execution service timed out", "timeout", type(exc).__name__) from exc
        except httpx.HTTPError as exc:
            log.warning("judge worker request failed: %s", type(exc).__name__)
            raise ExecutionUnavailable("execution service request failed", "bad_status", type(exc).__name__) from exc

        if response.status_code != 200:
            detail = _worker_detail(response)
            reason = "auth" if response.status_code == 401 else "bad_status"
            log.warning("judge worker returned HTTP %s: %s", response.status_code, detail)
            raise ExecutionUnavailable(f"execution service returned HTTP {response.status_code}", reason, detail)
        result = ExecResult.from_json(response.json())
        if result.status == "INTERNAL_ERROR":
            log.error("judge worker internal error: %s", result.stderr)
            raise ExecutionUnavailable("execution service internal error", "internal", result.stderr[:300])
        return result

    async def run(self, code: str, stdin: str, limits: ExecLimits) -> ExecResult:
        return await self._post("/run", {"code": code, "stdin": stdin, "limits": limits.as_dict()})

    async def call(self, code: str, function_name: str, args: list[Any], limits: ExecLimits) -> ExecResult:
        payload = {"code": code, "function_name": function_name, "args": args, "limits": limits.as_dict()}
        return await self._post("/call", payload)

    async def health(self) -> dict[str, Any]:
        try:
            response = await self._client.get("/health", timeout=2.0)
            response.raise_for_status()
            return dict(response.json())
        except httpx.HTTPError as exc:
            raise ExecutionUnavailable(str(type(exc).__name__)) from exc

    async def close(self) -> None:
        await self._client.aclose()
