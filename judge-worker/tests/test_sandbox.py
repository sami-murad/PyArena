import os
import sys

import pytest
from httpx import ASGITransport, AsyncClient

from worker.app import create_app
from worker.sandbox import Limits, Sandbox

pytestmark = pytest.mark.asyncio

FAST = Limits(cpu_seconds=1, wall_seconds=3, memory_mb=256, max_output_bytes=4096)


@pytest.fixture
def box() -> Sandbox:
    return Sandbox(ceiling=FAST, max_concurrent=2)


async def test_success_and_stdin(box: Sandbox) -> None:
    r = await box.run_script("name = input()\nprint(f'hi {name}')", stdin="Ada\n")
    assert r.status == "OK"
    assert r.stdout == "hi Ada\n"
    assert r.exit_code == 0


async def test_syntax_error(box: Sandbox) -> None:
    r = await box.run_script("print('x'")
    assert r.status == "SYNTAX_ERROR"
    assert r.error_type == "SyntaxError"
    assert 'File "main.py"' in r.stderr
    assert "pyarena-job" not in r.stderr


async def test_indentation_error(box: Sandbox) -> None:
    r = await box.run_script("def f():\nreturn 1")
    assert r.status == "SYNTAX_ERROR"
    assert r.error_type == "IndentationError"


async def test_runtime_error(box: Sandbox) -> None:
    r = await box.run_script("print('before')\n1/0")
    assert r.status == "RUNTIME_ERROR"
    assert r.error_type == "ZeroDivisionError"
    assert r.stdout == "before\n"


async def test_infinite_loop_times_out(box: Sandbox) -> None:
    r = await box.run_script("while True:\n    pass")
    assert r.status == "TIMEOUT"


async def test_sleep_hits_wall_clock(box: Sandbox) -> None:
    r = await box.run_script("import time\ntime.sleep(30)")
    assert r.status == "TIMEOUT"
    assert r.duration_ms < 6000


async def test_output_limit(box: Sandbox) -> None:
    r = await box.run_script("while True:\n    print('x' * 100)")
    assert r.status == "OUTPUT_LIMIT"
    assert r.truncated
    assert len(r.stdout.encode()) <= 4096


@pytest.mark.skipif(os.name != "posix", reason="rlimits are POSIX only")
async def test_memory_limit(box: Sandbox) -> None:
    r = await box.run_script("x = bytearray(1024 * 1024 * 1024)")
    assert r.status == "MEMORY_LIMIT"


async def test_environment_is_empty(box: Sandbox) -> None:
    os.environ["PYARENA_FAKE_SECRET"] = "s3cret"
    try:
        r = await box.run_script("import os\nprint(sorted(os.environ))")
    finally:
        del os.environ["PYARENA_FAKE_SECRET"]
    assert r.status == "OK"
    assert "PYARENA_FAKE_SECRET" not in r.stdout


async def test_function_call_returns_value(box: Sandbox) -> None:
    code = "def add(a, b):\n    print('debug')\n    return a + b"
    r = await box.call_function(code, "add", [2, 3])
    assert r.status == "OK"
    assert r.has_return_value and r.return_value == 5
    assert "debug" in r.stdout


async def test_function_call_tuple_and_set(box: Sandbox) -> None:
    r = await box.call_function("def f():\n    return (1, {3, 2})", "f", [])
    assert r.return_value == [1, [2, 3]]


async def test_function_missing(box: Sandbox) -> None:
    r = await box.call_function("def other():\n    return 1", "solve", [])
    assert r.status == "RUNTIME_ERROR"
    assert r.error_type == "NameError"


async def test_function_exception_hides_harness(box: Sandbox) -> None:
    r = await box.call_function("def f(x):\n    return x[5]", "f", [[1]])
    assert r.status == "RUNTIME_ERROR"
    assert r.error_type == "IndexError"
    assert "_pyarena_harness" not in r.stderr
    assert 'File "solution.py"' in r.stderr


async def test_function_syntax_error(box: Sandbox) -> None:
    r = await box.call_function("def f(:\n  pass", "f", [])
    assert r.status == "SYNTAX_ERROR"


async def test_function_cannot_read_call_spec(box: Sandbox) -> None:
    code = "import os\ndef f():\n    return os.path.exists('_call.json')"
    r = await box.call_function(code, "f", [])
    assert r.return_value is False


async def test_temp_dir_removed(box: Sandbox) -> None:
    r = await box.run_script("import os\nprint(os.getcwd())")
    assert not os.path.exists(r.stdout.strip()) or "pyarena-job" not in r.stdout


@pytest.mark.skipif(sys.platform != "linux", reason="fork bomb test only on Linux")
async def test_background_child_does_not_block(box: Sandbox) -> None:
    code = (
        "import subprocess, sys\nsubprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'])\nprint('done')"
    )
    r = await box.run_script(code)
    assert r.status in ("OK", "TIMEOUT")


async def test_http_requires_token() -> None:
    app = create_app(Sandbox(ceiling=FAST), token="t0ken")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://w") as client:
        bad = await client.post("/run", json={"code": "print(1)"})
        assert bad.status_code == 401
        good = await client.post("/run", json={"code": "print(1)"}, headers={"X-Worker-Token": "t0ken"})
        assert good.status_code == 200
        assert good.json()["stdout"] == "1\n"
        call = await client.post(
            "/call",
            json={"code": "def sq(n):\n    return n*n", "function_name": "sq", "args": [7]},
            headers={"X-Worker-Token": "t0ken"},
        )
        assert call.json()["return_value"] == 49
        health = await client.get("/health")
        assert health.json()["status"] == "ok"


async def test_http_rejects_bad_function_name() -> None:
    app = create_app(Sandbox(ceiling=FAST), token="t")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://w") as client:
        r = await client.post(
            "/call", json={"code": "", "function_name": "a; import os", "args": []}, headers={"X-Worker-Token": "t"}
        )
        assert r.status_code == 422


# ---------------------------------------------------------------- Phase 1 additions


async def test_environment_is_exactly_the_whitelist(box: Sandbox) -> None:
    from worker.sandbox import ENV_WHITELIST

    r = await box.run_script("import os\nprint(','.join(sorted(os.environ)))")
    names = set(r.stdout.strip().split(","))
    # Python itself may add LC_CTYPE when it coerces the C locale.
    assert names - {"LC_CTYPE"} <= set(ENV_WHITELIST)
    assert {"PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"} <= names


async def test_tmpdir_points_inside_the_job(box: Sandbox) -> None:
    r = await box.run_script("import os, tempfile\nprint(tempfile.gettempdir() == os.getcwd())")
    assert r.stdout == "True\n"


async def test_missing_input_ends_with_eof_not_a_hang(box: Sandbox) -> None:
    r = await box.run_script("input()")
    assert r.status == "RUNTIME_ERROR"
    assert r.error_type == "EOFError"
    assert r.kill_reason is None
    assert r.duration_ms < 2500


async def test_kill_reason_wall(box: Sandbox) -> None:
    r = await box.run_script("import time\ntime.sleep(30)")
    assert (r.status, r.kill_reason) == ("TIMEOUT", "wall")


async def test_kill_reason_cpu(box: Sandbox) -> None:
    r = await box.run_script("while True:\n    pass")
    assert r.status == "TIMEOUT"
    assert r.kill_reason in ("cpu", "wall")  # "wall" only on platforms without RLIMIT_CPU
    if os.name == "posix":
        assert r.kill_reason == "cpu"


async def test_kill_reason_output(box: Sandbox) -> None:
    r = await box.run_script("while True:\n    print('x' * 100)")
    assert (r.status, r.kill_reason) == ("OUTPUT_LIMIT", "output")


@pytest.mark.skipif(os.name != "posix", reason="rlimits are POSIX only")
async def test_kill_reason_oom(box: Sandbox) -> None:
    r = await box.run_script("x = bytearray(1024 * 1024 * 1024)")
    assert (r.status, r.kill_reason) == ("MEMORY_LIMIT", "oom")


@pytest.mark.skipif(os.name != "posix", reason="signals are POSIX only")
async def test_kill_reason_signal(box: Sandbox) -> None:
    r = await box.run_script("import os, signal\nos.kill(os.getpid(), signal.SIGABRT)")
    assert r.status == "RUNTIME_ERROR"
    assert r.kill_reason == "signal"
    assert "SIGABRT" in r.stderr


async def test_ordinary_exception_has_no_kill_reason(box: Sandbox) -> None:
    r = await box.run_script("raise ValueError('nope')")
    assert r.kill_reason is None


async def test_harness_loads_solution_as_a_real_module(box: Sandbox) -> None:
    code = "import sys\ndef f():\n    return [__name__, 'solution' in sys.modules]"
    r = await box.call_function(code, "f", [])
    assert r.return_value == ["solution", True]


async def test_harness_error_at_import_time(box: Sandbox) -> None:
    r = await box.call_function("x = 1 / 0\ndef f():\n    return 1", "f", [])
    assert r.error_type == "ZeroDivisionError"
    assert 'File "solution.py", line 1' in r.stderr
    assert "_pyarena_harness" not in r.stderr


async def test_diag_is_off_by_default_and_needs_token_when_on() -> None:
    off = create_app(Sandbox(ceiling=FAST), token="t", enable_diag=False)
    async with AsyncClient(transport=ASGITransport(app=off), base_url="http://w") as client:
        assert (await client.get("/_diag", headers={"X-Worker-Token": "t"})).status_code == 404

    on = create_app(Sandbox(ceiling=FAST), token="t", enable_diag=True)
    async with AsyncClient(transport=ASGITransport(app=on), base_url="http://w") as client:
        assert (await client.get("/_diag")).status_code == 401
        body = (await client.get("/_diag", headers={"X-Worker-Token": "t"})).json()
    assert body["self_test"]["status"] == "OK"
    assert body["self_test"]["stdout"].startswith("hello from")
    assert "t" not in body["env_whitelist"]
    assert "WORKER_TOKEN" not in str(body)
