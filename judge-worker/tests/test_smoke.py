"""The four smoke tests that must pass both locally and against the Docker worker.

Local (in-process sandbox):
    .venv/bin/python -m pytest tests/test_smoke.py

Against a running worker, e.g. the Docker one from docker-compose.dev.yml:
    WORKER_SMOKE_URL=http://127.0.0.1:8001 WORKER_SMOKE_TOKEN=dev-only-worker-token \\
        .venv/bin/python -m pytest tests/test_smoke.py

With WORKER_SMOKE_URL set, every test runs twice: once in-process ("local")
and once over HTTP ("http"). Without it the HTTP variants are skipped.
"""

from __future__ import annotations

import os
from collections.abc import Awaitable, Callable
from typing import Any

import httpx
import pytest

from worker.sandbox import Limits, Sandbox

pytestmark = pytest.mark.asyncio

SMOKE_URL = os.getenv("WORKER_SMOKE_URL", "").rstrip("/")
SMOKE_TOKEN = os.getenv("WORKER_SMOKE_TOKEN", "")
LIMITS = {"cpu_seconds": 2, "wall_seconds": 5, "memory_mb": 256, "max_output_bytes": 65536}

Run = Callable[[str, str], Awaitable[dict[str, Any]]]
Call = Callable[[str, str, list[Any]], Awaitable[dict[str, Any]]]


@pytest.fixture(params=["local", "http"])
def transport(request: pytest.FixtureRequest) -> tuple[Run, Call]:
    if request.param == "local":
        box = Sandbox(ceiling=Limits(**LIMITS))

        async def run_local(code: str, stdin: str) -> dict[str, Any]:
            return (await box.run_script(code, stdin)).to_dict()

        async def call_local(code: str, fn: str, args: list[Any]) -> dict[str, Any]:
            return (await box.call_function(code, fn, args)).to_dict()

        return run_local, call_local

    if not SMOKE_URL:
        pytest.skip("set WORKER_SMOKE_URL to smoke-test a running worker")

    async def post(path: str, payload: dict[str, Any]) -> dict[str, Any]:
        async with httpx.AsyncClient(base_url=SMOKE_URL, timeout=20) as client:
            response = await client.post(path, json=payload, headers={"X-Worker-Token": SMOKE_TOKEN})
        assert response.status_code == 200, response.text
        return dict(response.json())

    async def run_http(code: str, stdin: str) -> dict[str, Any]:
        return await post("/run", {"code": code, "stdin": stdin, "limits": LIMITS})

    async def call_http(code: str, fn: str, args: list[Any]) -> dict[str, Any]:
        return await post("/call", {"code": code, "function_name": fn, "args": args, "limits": LIMITS})

    return run_http, call_http


async def test_smoke_print_hello(transport: tuple[Run, Call]) -> None:
    run, _ = transport
    result = await run("print('hello')", "")
    assert result["status"] == "OK", result
    assert result["stdout"] == "hello\n"
    assert result["kill_reason"] is None


async def test_smoke_input_roundtrip(transport: tuple[Run, Call]) -> None:
    run, _ = transport
    code = "name = input()\nage = int(input())\nprint(f'{name} is {age + 1} next year')"
    result = await run(code, "Ada\n36\n")
    assert result["status"] == "OK", result
    assert result["stdout"] == "Ada is 37 next year\n"


async def test_smoke_function_harness(transport: tuple[Run, Call]) -> None:
    _, call = transport
    code = "def add(a, b):\n    print('adding')\n    return a + b\n"
    result = await call(code, "add", [2, 40])
    assert result["status"] == "OK", result
    assert result["has_return_value"] is True
    assert result["return_value"] == 42
    assert result["stdout"].strip() == "adding"


async def test_smoke_syntax_error_surfaced(transport: tuple[Run, Call]) -> None:
    run, _ = transport
    result = await run("print('unclosed'", "")
    assert result["status"] == "SYNTAX_ERROR", result
    assert result["error_type"] == "SyntaxError"
    # The raw traceback reaches the caller, with sandbox paths hidden.
    assert 'File "main.py", line 1' in result["stderr"]
    assert "SyntaxError" in result["stderr"]
    assert "pyarena-job" not in result["stderr"]
