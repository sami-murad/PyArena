"""Checks that only apply in the Docker-style mode (worker started as root, one UID per job)."""

import os

import pytest

from worker.sandbox import Limits, Sandbox

pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.skipif(os.name != "posix" or os.geteuid() != 0, reason="UID isolation needs the worker to run as root"),
]

FAST = Limits(cpu_seconds=1, wall_seconds=3, memory_mb=256, max_output_bytes=8192)


async def test_job_runs_as_unprivileged_uid() -> None:
    r = await Sandbox(ceiling=FAST).run_script("import os\nprint(os.getuid(), os.geteuid())")
    uid, euid = map(int, r.stdout.split())
    assert uid >= 20000 and euid == uid


async def test_job_cannot_read_worker_environment() -> None:
    os.environ["PYARENA_TEST_SECRET"] = "top-secret-value"
    try:
        code = f"print(open('/proc/{os.getpid()}/environ', 'rb').read())"
        r = await Sandbox(ceiling=FAST).run_script(code)
    finally:
        del os.environ["PYARENA_TEST_SECRET"]
    assert "top-secret-value" not in r.stdout
    assert r.status == "RUNTIME_ERROR"


async def test_job_cannot_signal_the_worker() -> None:
    r = await Sandbox(ceiling=FAST).run_script(f"import os, signal\nos.kill({os.getpid()}, signal.SIGKILL)")
    assert r.error_type == "PermissionError"


async def test_fork_bomb_is_contained() -> None:
    code = "import os\nwhile True:\n    try:\n        os.fork()\n    except OSError:\n        pass\n"
    r = await Sandbox(ceiling=FAST).run_script(code)
    assert r.status in ("TIMEOUT", "RUNTIME_ERROR")
    # The worker itself must still be able to run new jobs afterwards.
    after = await Sandbox(ceiling=FAST).run_script("print('alive')")
    assert after.stdout == "alive\n"


async def test_background_process_is_killed_after_job(tmp_path) -> None:  # type: ignore[no-untyped-def]
    marker = tmp_path / "survived"
    os.chmod(tmp_path, 0o777)
    code = (
        "import os, time\n"
        "if os.fork() == 0:\n"
        "    os.setsid()\n"
        "    time.sleep(2)\n"
        f"    open({str(marker)!r}, 'w').write('x')\n"
        "    os._exit(0)\n"
        "print('parent done')\n"
    )
    r = await Sandbox(ceiling=FAST).run_script(code)
    assert r.stdout == "parent done\n", r
    import asyncio

    await asyncio.sleep(3)
    assert not marker.exists()
