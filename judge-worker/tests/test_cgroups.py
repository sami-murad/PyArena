"""cgroup v2 job groups.

The unit tests use a fake cgroup directory (plain files), so they run anywhere.
The real-kernel tests run only when PYARENA_TEST_CGROUP_ROOT points to a
delegated, empty cgroup v2 directory with the memory and pids controllers, and
the tests run as root (as the worker does in Docker).
"""

import os
from pathlib import Path

import pytest

from worker.cgroups import CgroupJobs, CgroupUnavailable, build_from_env
from worker.sandbox import Limits, Sandbox


def fake_root(tmp_path: Path, controllers: str = "cpu memory pids", procs: str = "") -> Path:
    (tmp_path / "cgroup.controllers").write_text(controllers)
    (tmp_path / "cgroup.subtree_control").write_text("")
    (tmp_path / "cgroup.procs").write_text(procs)
    return tmp_path


def test_setup_rejects_a_non_cgroup_directory(tmp_path: Path) -> None:
    with pytest.raises(CgroupUnavailable, match="not a cgroup v2"):
        CgroupJobs.setup(tmp_path)


def test_setup_requires_memory_and_pids(tmp_path: Path) -> None:
    with pytest.raises(CgroupUnavailable, match="memory"):
        CgroupJobs.setup(fake_root(tmp_path, controllers="cpu pids"))


def test_setup_requires_an_empty_group(tmp_path: Path) -> None:
    with pytest.raises(CgroupUnavailable, match="empty"):
        CgroupJobs.setup(fake_root(tmp_path, procs="123\n"))


def test_setup_enables_controllers_and_create_writes_limits(tmp_path: Path) -> None:
    jobs = CgroupJobs.setup(fake_root(tmp_path))
    assert (tmp_path / "cgroup.subtree_control").read_text() == "+memory +pids"
    path = jobs.create(20001, 256 * 1024 * 1024, 16)
    assert path == tmp_path / "job-20001"
    assert (path / "memory.max").read_text() == str(256 * 1024 * 1024)
    assert (path / "memory.swap.max").read_text() == "0"
    assert (path / "memory.oom.group").read_text() == "1"
    assert (path / "pids.max").read_text() == "16"


def test_oom_and_pids_events_are_parsed(tmp_path: Path) -> None:
    (tmp_path / "memory.events").write_text("low 0\nhigh 0\nmax 4\noom 1\noom_kill 1\n")
    (tmp_path / "pids.events").write_text("max 3\n")
    assert CgroupJobs.oom_killed(tmp_path)
    assert CgroupJobs.pids_limit_hit(tmp_path)
    (tmp_path / "memory.events").write_text("oom_kill 0\n")
    (tmp_path / "pids.events").write_text("max 0\n")
    assert not CgroupJobs.oom_killed(tmp_path)
    assert not CgroupJobs.pids_limit_hit(tmp_path)
    assert not CgroupJobs.oom_killed(tmp_path / "missing")


def test_build_from_env_is_off_when_unset_and_loud_when_wrong(tmp_path: Path) -> None:
    assert build_from_env("") is None
    with pytest.raises(CgroupUnavailable):
        build_from_env(str(tmp_path))


REAL_ROOT = os.getenv("PYARENA_TEST_CGROUP_ROOT", "")
real = pytest.mark.skipif(
    not REAL_ROOT or os.name != "posix" or os.geteuid() != 0,
    reason="set PYARENA_TEST_CGROUP_ROOT to a delegated cgroup v2 directory and run as root",
)
LIMITS = Limits(cpu_seconds=2, wall_seconds=4, memory_mb=128, max_output_bytes=8192, max_processes=16)


@real
@pytest.mark.asyncio
async def test_real_fork_bomb_stops_at_pids_max() -> None:
    box = Sandbox(ceiling=LIMITS, cgroups=CgroupJobs.setup(REAL_ROOT))
    code = (
        "import os, time\n"
        "n = 0\n"
        "try:\n"
        "    while True:\n"
        "        if os.fork() == 0:\n"
        "            time.sleep(10)\n"
        "            os._exit(0)\n"
        "        n += 1\n"
        "except OSError:\n"
        "    print('stopped at', n)\n"
    )
    r = await box.run_script(code)
    assert r.stdout.startswith("stopped at"), r
    assert int(r.stdout.split()[-1]) < LIMITS.max_processes
    assert not any(Path(REAL_ROOT).glob("job-*")), "job cgroups must be removed"


@real
@pytest.mark.asyncio
async def test_real_memory_spread_over_processes_is_oom_killed() -> None:
    # Each process stays under RLIMIT_AS (128 MB) but together they exceed memory.max.
    box = Sandbox(ceiling=LIMITS, cgroups=CgroupJobs.setup(REAL_ROOT))
    code = (
        "import os, time\n"
        "for _ in range(4):\n"
        "    if os.fork() == 0:\n"
        "        b = bytearray(90 * 1024 * 1024)\n"
        "        time.sleep(5)\n"
        "        os._exit(0)\n"
        "b = bytearray(90 * 1024 * 1024)\n"
        "time.sleep(5)\n"
    )
    r = await box.run_script(code)
    assert (r.status, r.kill_reason) == ("MEMORY_LIMIT", "oom"), r
