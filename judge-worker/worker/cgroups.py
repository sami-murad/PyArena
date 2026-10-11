"""Per-job cgroup v2 limits (memory.max, pids.max).

Threat: ``RLIMIT_AS`` limits *address space* per process and ``RLIMIT_NPROC``
counts processes per UID. A job can still use more memory in total by forking
several processes that each stay under the address-space limit, and memory
pressure from one job can reach the whole container. A cgroup puts every
process of a job into one group with a hard total memory limit
(``memory.max``, no swap) and a hard process limit (``pids.max``), and the
kernel's out-of-memory killer then kills only that job (``memory.oom.group``).
``cgroup.kill`` ends every process of the group in one step afterwards.

This needs a *delegated* cgroup v2 directory that the worker can write
(``WORKER_CGROUP_ROOT``). Docker does not give containers a writable cgroup
tree by default; ``docs/SECURITY.md`` explains how to provide one. Without it
the sandbox keeps working with rlimits only, and ``/health`` says so.
"""

from __future__ import annotations

import os
import signal
import time
from pathlib import Path


class CgroupUnavailable(RuntimeError):
    pass


class CgroupJobs:
    """Creates, limits and removes one child cgroup per job under ``root``."""

    def __init__(self, root: Path) -> None:
        self.root = root

    @classmethod
    def setup(cls, root: str | Path) -> CgroupJobs:
        path = Path(root)
        controllers_file = path / "cgroup.controllers"
        if not controllers_file.exists():
            raise CgroupUnavailable(f"{path} is not a cgroup v2 directory")
        available = set(controllers_file.read_text().split())
        missing = {"memory", "pids"} - available
        if missing:
            raise CgroupUnavailable(f"controllers not delegated to {path}: {', '.join(sorted(missing))}")
        # cgroup v2 "no internal processes" rule: a group that hands controllers
        # to its children must not contain processes itself.
        if (path / "cgroup.procs").read_text().strip():
            raise CgroupUnavailable(f"{path} must be an empty cgroup dedicated to jobs")
        enabled = set((path / "cgroup.subtree_control").read_text().split())
        if not {"memory", "pids"} <= enabled:
            try:
                (path / "cgroup.subtree_control").write_text("+memory +pids")
            except OSError as exc:
                raise CgroupUnavailable(f"cannot enable memory and pids controllers: {exc}") from exc
        return cls(path)

    def job_path(self, uid: int) -> Path:
        return self.root / f"job-{uid}"

    def create(self, uid: int, memory_bytes: int, max_processes: int) -> Path:
        path = self.job_path(uid)
        if path.exists():  # left over from a crash: clear it first
            self.remove(path)
        path.mkdir()
        _write(path / "memory.max", str(memory_bytes))
        _write_optional(path / "memory.swap.max", "0")
        _write_optional(path / "memory.oom.group", "1")
        _write(path / "pids.max", str(max_processes))
        return path

    @staticmethod
    def oom_killed(path: Path) -> bool:
        try:
            for line in (path / "memory.events").read_text().splitlines():
                key, _, value = line.partition(" ")
                if key == "oom_kill" and int(value or 0) > 0:
                    return True
        except OSError:
            return False
        return False

    @staticmethod
    def pids_limit_hit(path: Path) -> bool:
        try:
            for line in (path / "pids.events").read_text().splitlines():
                key, _, value = line.partition(" ")
                if key == "max" and int(value or 0) > 0:
                    return True
        except OSError:
            return False
        return False

    def remove(self, path: Path, timeout: float = 2.0) -> None:
        """Kill every process in the group, wait until it is empty, delete it."""
        kill_file = path / "cgroup.kill"
        deadline = time.monotonic() + timeout
        while True:
            pids = _read_pids(path)
            if not pids:
                break
            if kill_file.exists():
                _write_optional(kill_file, "1")
            else:  # kernels before 5.14
                for pid in pids:
                    try:
                        os.kill(pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
            if time.monotonic() > deadline:
                break
            time.sleep(0.02)
        try:
            path.rmdir()
        except OSError:
            # Still populated (zombies not yet reaped) or already gone; the next
            # create() for this UID retries the removal.
            pass


def join_cgroup(path: Path) -> None:  # pragma: no cover - runs in the child before exec
    """Move the calling (child) process into ``path``. Called while still root."""
    fd = os.open(str(path / "cgroup.procs"), os.O_WRONLY)
    try:
        os.write(fd, str(os.getpid()).encode())
    finally:
        os.close(fd)


def _read_pids(path: Path) -> list[int]:
    try:
        return [int(p) for p in (path / "cgroup.procs").read_text().split()]
    except (OSError, ValueError):
        return []


def _write(path: Path, value: str) -> None:
    path.write_text(value)


def _write_optional(path: Path, value: str) -> None:
    try:
        path.write_text(value)
    except OSError:
        pass  # optional knob not available on this kernel


def build_from_env(root: str | None = None) -> CgroupJobs | None:
    """``WORKER_CGROUP_ROOT`` unset: no cgroups. Set but unusable: fail loudly."""
    value = root if root is not None else os.getenv("WORKER_CGROUP_ROOT", "")
    if not value.strip():
        return None
    return CgroupJobs.setup(value.strip())
