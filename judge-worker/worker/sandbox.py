"""Restricted execution of untrusted Python code.

Every job runs in a brand-new Python process with:

* a fresh temporary working directory (deleted afterwards),
* an empty, minimal environment (no secrets are inherited),
* kernel resource limits (CPU seconds, address space, file size, open files,
  process count) applied through ``setrlimit`` before the program starts,
* a wall-clock timeout,
* a hard cap on captured stdout/stderr, enforced while the program writes,
* a seccomp filter that refuses dangerous system calls (``worker/seccomp.py``),
* optionally, a cgroup v2 group per job with a total memory and process limit
  (``worker/cgroups.py``, enabled with ``WORKER_CGROUP_ROOT``).

When the worker runs as root inside its container (the Docker setup), each
concurrent job slot also gets its *own unprivileged UID*.  After a job ends,
every process owned by that UID is killed, so code that forks into the
background or calls ``setsid`` cannot survive the job.

When the worker runs as a normal user (local development) the same limits are
applied, but jobs share the worker's UID.  On Windows ``setrlimit`` does not
exist, so only the timeout and output caps apply.  ``SECURITY.md`` documents
these differences.  Local development modes are NOT a security boundary.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import secrets
import shutil
import signal
import sys
import tempfile
import time
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from .cgroups import CgroupJobs, join_cgroup
from .seccomp import CompiledFilter
from .seccomp import build_from_env as build_seccomp

IS_POSIX = os.name == "posix"
if IS_POSIX:  # pragma: no branch
    import resource

HARNESS_FILE = "_pyarena_harness.py"
SOLUTION_FILE = "solution.py"
MAIN_FILE = "main.py"

# Statuses returned to the backend.
OK = "OK"
SYNTAX_ERROR = "SYNTAX_ERROR"
RUNTIME_ERROR = "RUNTIME_ERROR"
TIMEOUT = "TIMEOUT"
MEMORY_LIMIT = "MEMORY_LIMIT"
OUTPUT_LIMIT = "OUTPUT_LIMIT"
INTERNAL_ERROR = "INTERNAL_ERROR"

# Why the sandbox stopped a program (None when it ended on its own).
KILL_OOM = "oom"  # memory limit: MemoryError, SIGSEGV from exhausted memory, or a SIGKILL we did not send
KILL_CPU = "cpu"  # RLIMIT_CPU reached (SIGXCPU)
KILL_WALL = "wall"  # wall-clock timeout, e.g. sleeping or waiting for input
KILL_OUTPUT = "output"  # stdout+stderr exceeded the output cap
KILL_SIGNAL = "signal"  # any other fatal signal

# Threat: secrets or host configuration leaking into user code through
# environment variables. Child processes get ONLY these names, with values set
# by the sandbox; nothing is copied from the worker's own environment.
ENV_WHITELIST = (
    "PATH",
    "LANG",
    "LC_ALL",
    "PYTHONUNBUFFERED",
    "PYTHONDONTWRITEBYTECODE",
    "PYTHONIOENCODING",
    "HOME",
    "TMPDIR",
)


@dataclass(frozen=True)
class Limits:
    cpu_seconds: float = 2.0
    wall_seconds: float = 5.0
    memory_mb: int = 256
    max_output_bytes: int = 64 * 1024
    max_processes: int = 32
    max_file_bytes: int = 1024 * 1024
    max_open_files: int = 64

    def clamp(self, ceiling: Limits) -> Limits:
        """Never allow a request to exceed the worker's configured ceiling."""
        return Limits(
            cpu_seconds=min(self.cpu_seconds, ceiling.cpu_seconds),
            wall_seconds=min(self.wall_seconds, ceiling.wall_seconds),
            memory_mb=min(self.memory_mb, ceiling.memory_mb),
            max_output_bytes=min(self.max_output_bytes, ceiling.max_output_bytes),
            max_processes=min(self.max_processes, ceiling.max_processes),
            max_file_bytes=min(self.max_file_bytes, ceiling.max_file_bytes),
            max_open_files=min(self.max_open_files, ceiling.max_open_files),
        )


@dataclass
class RunResult:
    status: str
    stdout: str = ""
    stderr: str = ""
    exit_code: int | None = None
    duration_ms: int = 0
    truncated: bool = False
    return_value: Any = None
    has_return_value: bool = False
    error_type: str | None = None
    kill_reason: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data.pop("extra")
        return data


# --------------------------------------------------------------------------
# Harness used for function-based problems.  It runs *inside* the sandboxed
# process.  It never receives expected outputs: it only reports what the
# participant's function returned.  Correctness is decided by the backend.
# --------------------------------------------------------------------------
_HARNESS_SOURCE = r"""
import importlib.util, json, os, sys, traceback

def _load():
    with open("_call.json", "r", encoding="utf-8") as fh:
        data = json.load(fh)
    os.remove("_call.json")
    return data

_spec = _load()
_marker = _spec["marker"]
_fn_name = _spec["function"]
_args = _spec["args"]

def _to_json(value):
    if isinstance(value, (set, frozenset)):
        try:
            return sorted(value)
        except TypeError:
            return list(value)
    if isinstance(value, bytes):
        return value.decode("utf-8", "replace")
    raise TypeError("unsupported return type: " + type(value).__name__)

def _report_user_error(exc):
    frames = [f for f in traceback.extract_tb(exc.__traceback__) if os.path.basename(f.filename) == "solution.py"]
    lines = ["Traceback (most recent call last):\n"] if frames else []
    lines += traceback.format_list(frames)
    lines += traceback.format_exception_only(type(exc), exc)
    sys.stderr.write("".join(lines))
    sys.stderr.flush()

# Load the participant's file as a real module named "solution" with importlib,
# so tracebacks, __name__ and module globals behave exactly as in normal Python.
_path = os.path.join(os.getcwd(), "solution.py")
_module_spec = importlib.util.spec_from_file_location("solution", _path)
_module = importlib.util.module_from_spec(_module_spec)
sys.modules["solution"] = _module
try:
    _module_spec.loader.exec_module(_module)
except SyntaxError as exc:
    sys.stderr.write("".join(traceback.format_exception_only(type(exc), exc)))
    sys.exit(1)
except SystemExit:
    raise
except BaseException as exc:
    _report_user_error(exc)
    sys.exit(1)

try:
    _fn = getattr(_module, _fn_name, None)
    if not callable(_fn):
        raise NameError(f"function '{_fn_name}' is not defined in your solution")
    _result = _fn(*_args)
    _payload = json.dumps(_result, default=_to_json)
except SystemExit:
    raise
except BaseException as exc:
    _report_user_error(exc)
    sys.exit(1)

sys.stdout.flush()
sys.stdout.write("\n" + _marker + _payload + "\n")
sys.stdout.flush()
"""


def extract_result(stdout: str, marker: str) -> tuple[str, bool, Any]:
    """Split the harness output into (user stdout, found, return value).

    The marker is random per run and only the LAST occurrence counts, so user
    code cannot fake a result by printing something that looks like one.
    """
    idx = stdout.rfind("\n" + marker)
    if idx == -1:
        return stdout, False, None
    payload = stdout[idx + len(marker) + 1 :].strip()
    try:
        return stdout[:idx], True, json.loads(payload)
    except (json.JSONDecodeError, RecursionError):
        return stdout[:idx], False, None


class SlotPool:
    """Gives each concurrent job its own UID when running as root."""

    def __init__(self, size: int, base_uid: int) -> None:
        self._queue: asyncio.Queue[int] = asyncio.Queue()
        for i in range(size):
            self._queue.put_nowait(base_uid + i)

    async def acquire(self) -> int:
        return await self._queue.get()

    def release(self, uid: int) -> None:
        self._queue.put_nowait(uid)


class Sandbox:
    def __init__(
        self,
        ceiling: Limits | None = None,
        max_concurrent: int = 4,
        base_uid: int = 20000,
        python_executable: str | None = None,
        work_root: str | None = None,
        seccomp_mode: str = "auto",
        cgroups: CgroupJobs | None = None,
    ) -> None:
        self.ceiling = ceiling or Limits()
        self.max_concurrent = max_concurrent
        self.python = python_executable or sys.executable
        self.work_root = work_root
        self.isolate_uids = IS_POSIX and os.geteuid() == 0
        # More UIDs than concurrent jobs: a UID rests between jobs while init
        # reaps any processes that were killed at the end of its last job.
        self._pool = SlotPool(max_concurrent * 4, base_uid)
        self._slots = asyncio.Semaphore(max_concurrent)
        # Compiled once here; each job only installs the ready-made program.
        self.seccomp: CompiledFilter | None = build_seccomp(seccomp_mode) if IS_POSIX else None
        self.cgroups = cgroups

    @property
    def features(self) -> dict[str, bool]:
        return {
            "uid_isolation": self.isolate_uids,
            "rlimits": IS_POSIX,
            "seccomp": self.seccomp is not None,
            "cgroup": self.cgroups is not None,
        }

    @property
    def mode(self) -> str:
        if self.isolate_uids:
            return "uid-isolated"
        if IS_POSIX:
            return "rlimit-only (development)"
        return "timeout-only (development, NOT isolated)"

    # ------------------------------------------------------------------ API
    async def run_script(self, code: str, stdin: str = "", limits: Limits | None = None) -> RunResult:
        files = {MAIN_FILE: code}
        result = await self._execute(files, [MAIN_FILE], stdin, limits)
        return result

    async def call_function(
        self, code: str, function_name: str, args: list[Any], limits: Limits | None = None
    ) -> RunResult:
        marker = "__PYARENA_RESULT_" + secrets.token_hex(16) + "__"
        files = {
            SOLUTION_FILE: code,
            HARNESS_FILE: _HARNESS_SOURCE,
            "_call.json": json.dumps({"marker": marker, "function": function_name, "args": args}),
        }
        result = await self._execute(files, [HARNESS_FILE], "", limits, script_name=SOLUTION_FILE)
        if result.status == OK:
            stdout, found, value = extract_result(result.stdout, marker)
            result.stdout = stdout
            if found:
                result.return_value = value
                result.has_return_value = True
            else:
                result.status = RUNTIME_ERROR
                result.error_type = "NoResult"
                result.stderr = (result.stderr + "\nYour function did not return a value the judge could read.").strip()
        return result

    # ------------------------------------------------------------ internals
    async def _execute(
        self,
        files: dict[str, str],
        argv: list[str],
        stdin: str,
        limits: Limits | None,
        script_name: str = MAIN_FILE,
    ) -> RunResult:
        lim = (limits or self.ceiling).clamp(self.ceiling)
        await self._slots.acquire()
        uid = await self._pool.acquire()
        workdir = tempfile.mkdtemp(prefix="pyarena-job-", dir=self.work_root)
        cgroup: Path | None = None
        try:
            for name, content in files.items():
                Path(workdir, name).write_text(content, encoding="utf-8")
            if self.isolate_uids:
                os.chown(workdir, uid, uid)
                os.chmod(workdir, 0o700)
                for name in files:
                    os.chown(Path(workdir, name), uid, uid)
            if self.cgroups is not None:
                cgroup = self.cgroups.create(uid, lim.memory_mb * 1024 * 1024, lim.max_processes)
            result = await self._spawn(workdir, argv, stdin, lim, uid, cgroup)
            if cgroup is not None and result.status != OK and CgroupJobs.oom_killed(cgroup):
                # The kernel's OOM killer acted inside this job's group: a certain
                # memory verdict, no need for the SIGKILL timing heuristic.
                result.status, result.kill_reason = MEMORY_LIMIT, KILL_OOM
            result.stderr = _clean_stderr(result.stderr, workdir, script_name)
            if result.status not in (OK, TIMEOUT, OUTPUT_LIMIT) or result.kill_reason == KILL_OOM:
                _classify_error(result)
            return result
        except Exception as exc:  # noqa: BLE001 - any failure here is infrastructure, never the user's fault
            return RunResult(status=INTERNAL_ERROR, stderr=f"Execution service error: {type(exc).__name__}")
        finally:
            if cgroup is not None and self.cgroups is not None:
                await asyncio.to_thread(self.cgroups.remove, cgroup)
            if self.isolate_uids:
                await _kill_all_processes_of(uid)
            shutil.rmtree(workdir, ignore_errors=True)
            self._pool.release(uid)
            self._slots.release()

    async def _spawn(
        self, workdir: str, argv: list[str], stdin: str, lim: Limits, uid: int, cgroup: Path | None = None
    ) -> RunResult:
        env = {
            "PATH": "/usr/local/bin:/usr/bin:/bin",
            "LANG": "C.UTF-8",
            "LC_ALL": "C.UTF-8",
            "PYTHONUNBUFFERED": "1",
            "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONIOENCODING": "utf-8",
            # Scratch files stay inside the job directory, which is deleted afterwards.
            "HOME": workdir,
            "TMPDIR": workdir,
        }
        assert set(env) <= set(ENV_WHITELIST)
        if os.name == "nt":  # Windows needs SYSTEMROOT to start Python at all.
            env["SYSTEMROOT"] = os.environ.get("SYSTEMROOT", "C:\\Windows")
        cmd = [self.python, "-I", "-B", *argv]

        kwargs: dict[str, Any] = {}
        if IS_POSIX:
            kwargs["preexec_fn"] = _make_preexec(lim, uid if self.isolate_uids else None, self.seccomp, cgroup)
            kwargs["start_new_session"] = True

        start = time.monotonic()
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=workdir,
            env=env,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            **kwargs,
        )

        # Threat: a program that prints without end fills the worker's memory or
        # keeps a job slot busy. Both pipes share ONE byte budget. The moment a
        # read would exceed it, the process group is killed right here, in the
        # middle of the write, without waiting for the main loop; nothing past
        # the budget is ever stored. Once we stop reading, the pipe buffer fills
        # and the writer blocks, so it cannot run ahead in the meantime.
        budget = {"left": lim.max_output_bytes}
        overflow = asyncio.Event()

        async def pump(stream: asyncio.StreamReader, sink: bytearray) -> None:
            while True:
                chunk = await stream.read(4096)
                if not chunk:
                    return
                room = budget["left"]
                take = min(len(chunk), room)
                sink.extend(chunk[:take])
                budget["left"] -= take
                if len(chunk) > room:
                    _kill_tree(proc)
                    overflow.set()
                    return

        out_buf, err_buf = bytearray(), bytearray()

        async def feed() -> None:
            assert proc.stdin is not None
            # Always bytes (b"" when there is no input), then EOF: a program that
            # calls input() with nothing left gets EOFError instead of hanging.
            data = (stdin or "").encode("utf-8")
            try:
                if data:
                    proc.stdin.write(data)
                    await proc.stdin.drain()
            except (BrokenPipeError, ConnectionResetError):
                pass
            finally:
                try:
                    proc.stdin.close()
                except (OSError, RuntimeError):  # pipe already closed or event loop shutting down
                    pass

        assert proc.stdout is not None and proc.stderr is not None
        io_tasks = [
            asyncio.create_task(feed()),
            asyncio.create_task(pump(proc.stdout, out_buf)),
            asyncio.create_task(pump(proc.stderr, err_buf)),
        ]
        wait_task = asyncio.create_task(proc.wait())
        overflow_task = asyncio.create_task(overflow.wait())

        done, _ = await asyncio.wait(
            {wait_task, overflow_task}, timeout=lim.wall_seconds, return_when=asyncio.FIRST_COMPLETED
        )

        status: str | None = None
        kill_reason: str | None = None
        if overflow_task in done:
            status, kill_reason = OUTPUT_LIMIT, KILL_OUTPUT
        elif wait_task not in done:
            status, kill_reason = TIMEOUT, KILL_WALL
        if status is not None:
            _kill_tree(proc)
            try:
                await asyncio.wait_for(proc.wait(), timeout=2)
            except TimeoutError:
                pass
        overflow_task.cancel()
        # Give the pumps a moment to drain whatever is left.
        try:
            await asyncio.wait_for(asyncio.gather(*io_tasks, return_exceptions=True), timeout=1)
        except TimeoutError:
            for t in io_tasks:
                t.cancel()

        duration_ms = int((time.monotonic() - start) * 1000)
        code = proc.returncode
        if status is None:
            if code == 0:
                status = OK
            elif IS_POSIX and code is not None and code == -signal.SIGXCPU:
                status, kill_reason = TIMEOUT, KILL_CPU
            elif IS_POSIX and code is not None and code == -signal.SIGKILL:
                # We did not send this SIGKILL (ours are handled above), so the
                # kernel did: either the hard CPU limit (when the program ignored
                # SIGXCPU) or the container's memory cgroup OOM killer. CPU time
                # can never exceed wall time, so a run shorter than the CPU limit
                # must have been killed for memory.
                if duration_ms >= lim.cpu_seconds * 1000:
                    status, kill_reason = TIMEOUT, KILL_CPU
                else:
                    status, kill_reason = MEMORY_LIMIT, KILL_OOM
            else:
                status = RUNTIME_ERROR

        return RunResult(
            status=status,
            stdout=out_buf.decode("utf-8", "replace").replace("\r\n", "\n"),
            stderr=err_buf.decode("utf-8", "replace").replace("\r\n", "\n"),
            exit_code=code,
            duration_ms=duration_ms,
            truncated=status == OUTPUT_LIMIT,
            kill_reason=kill_reason,
        )


def _make_preexec(  # pragma: no cover - runs in the child
    lim: Limits, uid: int | None, seccomp: CompiledFilter | None = None, cgroup: Path | None = None
) -> Callable[[], None]:
    cpu = max(1, int(lim.cpu_seconds + 0.999))
    mem = lim.memory_mb * 1024 * 1024

    def preexec() -> None:
        # Order matters: join the cgroup while still root, apply limits, drop to
        # the job UID, and install seccomp last, right before exec (once
        # installed it can never be removed, and it is inherited by every child).
        if cgroup is not None:
            join_cgroup(cgroup)
        resource.setrlimit(resource.RLIMIT_CPU, (cpu, cpu + 1))
        resource.setrlimit(resource.RLIMIT_AS, (mem, mem))
        resource.setrlimit(resource.RLIMIT_FSIZE, (lim.max_file_bytes, lim.max_file_bytes))
        resource.setrlimit(resource.RLIMIT_NOFILE, (lim.max_open_files, lim.max_open_files))
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        if uid is not None:
            # NPROC counts processes per real UID, so it is only meaningful when
            # the job owns a UID by itself.
            resource.setrlimit(resource.RLIMIT_NPROC, (lim.max_processes, lim.max_processes))
            os.setgroups([])
            os.setgid(uid)
            os.setuid(uid)
        if seccomp is not None:
            seccomp.install()

    return preexec


def _kill_tree(proc: asyncio.subprocess.Process) -> None:
    try:
        if IS_POSIX:
            os.killpg(proc.pid, signal.SIGKILL)
        else:
            proc.kill()
    except (ProcessLookupError, PermissionError, OSError):
        pass


async def _kill_all_processes_of(uid: int) -> None:
    """Kill every process owned by ``uid`` (catches escaped background children).

    The reaper switches to the job's UID and repeats ``kill(-1, SIGKILL)``
    until no process of that UID is left, so even a fork bomb that keeps
    refilling its process table is fully cleared.
    """

    def reaper() -> None:  # pragma: no cover - runs in the child
        os.setgid(uid)
        os.setuid(uid)
        for _ in range(10_000):
            try:
                os.kill(-1, signal.SIGKILL)
            except ProcessLookupError:
                return

    proc = await asyncio.create_subprocess_exec(
        sys.executable,
        "-c",
        "pass",
        preexec_fn=reaper,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    await proc.wait()
    # Killed processes linger as zombies until init reaps them, and zombies still
    # count against RLIMIT_NPROC. Give init a moment before the UID is reused.
    for _ in range(40):
        if not _processes_of(uid):
            return
        await asyncio.sleep(0.05)


def _processes_of(uid: int) -> list[int]:
    pids = []
    for entry in os.scandir("/proc"):
        if entry.name.isdigit():
            try:
                if entry.stat().st_uid == uid:
                    pids.append(int(entry.name))
            except OSError:
                continue
    return pids


_EXC_LINE = re.compile(r"^([A-Za-z_][\w.]*(?:Error|Exception|Exit|Interrupt|Warning)|[A-Z]\w*)(?::|$)")


def _clean_stderr(stderr: str, workdir: str, script_name: str) -> str:
    """Hide sandbox paths so tracebacks read ``File "main.py"``."""
    cleaned = stderr.replace(workdir + os.sep, "").replace(workdir, ".")
    return cleaned.replace(f'File "./{script_name}"', f'File "{script_name}"')


def _classify_error(result: RunResult) -> None:
    lines = [ln for ln in result.stderr.strip().splitlines() if ln.strip()]
    last = lines[-1].strip() if lines else ""
    match = _EXC_LINE.match(last)
    error_type = match.group(1).split(".")[-1] if match else None
    result.error_type = error_type
    if error_type in ("SyntaxError", "IndentationError", "TabError"):
        result.status = SYNTAX_ERROR
    elif error_type == "MemoryError":
        result.status = MEMORY_LIMIT
        result.kill_reason = KILL_OOM
    elif result.status == OK:
        return
    elif result.exit_code is not None and result.exit_code < 0:
        try:
            sig = signal.Signals(-result.exit_code).name
        except ValueError:
            sig = str(-result.exit_code)
        if result.exit_code == -getattr(signal, "SIGSEGV", 11):
            # Usually caused by exhausting memory or recursion depth inside C code.
            result.status = MEMORY_LIMIT
            result.kill_reason = KILL_OOM
        elif result.kill_reason is None:
            result.kill_reason = KILL_SIGNAL
        result.stderr = (result.stderr + f"\nProcess was terminated by signal {sig}.").strip()
