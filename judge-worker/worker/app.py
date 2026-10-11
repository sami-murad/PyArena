"""HTTP interface of the PyArena judge worker.

The backend is the only intended client.  Every request must carry the shared
``X-Worker-Token`` header.  The worker never sees expected outputs, users,
passwords or database credentials: it only executes code and reports what
happened.
"""

from __future__ import annotations

import hmac
import logging
import os
import platform
from dataclasses import asdict
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field

from .sandbox import ENV_WHITELIST, IS_POSIX, Limits, Sandbox

log = logging.getLogger("pyarena.worker")

MAX_CODE_CHARS = int(os.getenv("WORKER_MAX_CODE_CHARS", "65536"))
MAX_STDIN_CHARS = int(os.getenv("WORKER_MAX_STDIN_CHARS", "65536"))


def _ceiling_from_env() -> Limits:
    return Limits(
        cpu_seconds=float(os.getenv("WORKER_MAX_CPU_SECONDS", "5")),
        wall_seconds=float(os.getenv("WORKER_MAX_WALL_SECONDS", "10")),
        memory_mb=int(os.getenv("WORKER_MAX_MEMORY_MB", "256")),
        max_output_bytes=int(os.getenv("WORKER_MAX_OUTPUT_BYTES", str(64 * 1024))),
        max_processes=int(os.getenv("WORKER_MAX_PROCESSES", "16")),
    )


class LimitsIn(BaseModel):
    cpu_seconds: float = Field(2.0, gt=0, le=30)
    wall_seconds: float = Field(5.0, gt=0, le=60)
    memory_mb: int = Field(256, ge=32, le=2048)
    max_output_bytes: int = Field(64 * 1024, ge=1024, le=1024 * 1024)

    def to_limits(self) -> Limits:
        return Limits(
            cpu_seconds=self.cpu_seconds,
            wall_seconds=self.wall_seconds,
            memory_mb=self.memory_mb,
            max_output_bytes=self.max_output_bytes,
        )


class RunRequest(BaseModel):
    code: str = Field(..., max_length=MAX_CODE_CHARS)
    stdin: str = Field("", max_length=MAX_STDIN_CHARS)
    limits: LimitsIn = Field(default_factory=LimitsIn)


class CallRequest(BaseModel):
    code: str = Field(..., max_length=MAX_CODE_CHARS)
    function_name: str = Field(..., pattern=r"^[A-Za-z_][A-Za-z0-9_]{0,63}$")
    args: list[Any] = Field(default_factory=list)
    limits: LimitsIn = Field(default_factory=LimitsIn)


def _diag_enabled() -> bool:
    return os.getenv("WORKER_ENABLE_DIAG", "false").strip().lower() in ("1", "true", "yes")


def _cgroup_version() -> str:
    if Path("/sys/fs/cgroup/cgroup.controllers").exists():
        return "v2"
    if Path("/sys/fs/cgroup/memory").exists():
        return "v1"
    return "unknown"


def create_app(sandbox: Sandbox | None = None, token: str | None = None, enable_diag: bool | None = None) -> FastAPI:
    box = sandbox or Sandbox(
        ceiling=_ceiling_from_env(),
        max_concurrent=int(os.getenv("WORKER_MAX_CONCURRENT_JOBS", "4")),
        work_root=os.getenv("WORKER_WORK_ROOT") or None,
    )
    secret = token if token is not None else os.getenv("WORKER_TOKEN", "")
    if not secret:
        raise RuntimeError("WORKER_TOKEN must be set (shared secret between backend and worker).")

    diag = _diag_enabled() if enable_diag is None else enable_diag

    app = FastAPI(title="PyArena Judge Worker", docs_url=None, redoc_url=None, openapi_url=None)
    log.warning("Judge worker sandbox mode: %s", box.mode)

    def require_token(x_worker_token: str = Header(default="")) -> None:
        if not hmac.compare_digest(x_worker_token.encode(), secret.encode()):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid worker token")

    @app.get("/health")
    async def health() -> dict[str, Any]:
        return {"status": "ok", "mode": box.mode, "isolated": box.isolate_uids}

    @app.post("/run", dependencies=[Depends(require_token)])
    async def run(req: RunRequest) -> dict[str, Any]:
        result = await box.run_script(req.code, req.stdin, req.limits.to_limits())
        return result.to_dict()

    @app.post("/call", dependencies=[Depends(require_token)])
    async def call(req: CallRequest) -> dict[str, Any]:
        result = await box.call_function(req.code, req.function_name, req.args, req.limits.to_limits())
        return result.to_dict()

    if diag:
        # Development-only diagnostics (WORKER_ENABLE_DIAG=true). Still requires
        # the worker token, and reports no secrets or environment values.
        @app.get("/_diag", dependencies=[Depends(require_token)])
        async def diagnostics() -> dict[str, Any]:
            probe = await box.run_script("import sys\nprint('hello from', sys.version.split()[0])")
            return {
                "python_version": platform.python_version(),
                "python_executable": box.python,
                "platform": platform.platform(),
                "sandbox_mode": box.mode,
                "uid_isolated": box.isolate_uids,
                "rlimits_available": IS_POSIX,
                "cgroup": _cgroup_version(),
                "ceiling": asdict(box.ceiling),
                "max_concurrent_jobs": box.max_concurrent,
                "env_whitelist": list(ENV_WHITELIST),
                "self_test": probe.to_dict(),
            }

        log.warning("Diagnostics endpoint /_diag is enabled. Disable it outside development.")

    return app
