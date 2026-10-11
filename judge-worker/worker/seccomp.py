"""Per-job seccomp filter.

Threat: user code asking the kernel for things a Python exercise never needs:
debugging other processes (``ptrace``), new namespaces (``unshare``, ``clone``
with ``CLONE_NEW*``), mounts, BPF programs, the kernel keyring, raw or IP
sockets. Each of these is either a known container-escape path or kernel
attack surface. A seccomp filter makes the kernel refuse them with ``EPERM``
before any code that handles them runs.

How it works:

1. At worker start-up, the policy in ``seccomp/job-policy.json`` is compiled
   ONCE into a classic BPF program with libseccomp (through ``ctypes``; no
   Python package needed, only ``libseccomp.so.2``, which Debian ships).
2. In each job's child process, right before ``exec`` of Python, the child sets
   ``PR_SET_NO_NEW_PRIVS`` and installs the precompiled program with
   ``prctl(PR_SET_SECCOMP)``. No allocation or library call happens in the
   child beyond two ``prctl`` calls.

The filter is inherited by every process the job starts and cannot be removed.

Modes (``WORKER_SECCOMP``):

* ``auto`` (default): use it when libseccomp and kernel support exist.
* ``required``: refuse to start the worker without it (set in the Docker image).
* ``off``: do not install a filter (debugging only).
"""

from __future__ import annotations

import ctypes
import ctypes.util
import errno
import json
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path

POLICY_PATH = Path(__file__).resolve().parent.parent / "seccomp" / "job-policy.json"

SCMP_ACT_ALLOW = 0x7FFF0000
SCMP_CMP_EQ = 4
SCMP_CMP_MASKED_EQ = 7
PR_SET_NO_NEW_PRIVS = 38
PR_SET_SECCOMP = 22
SECCOMP_MODE_FILTER = 2


def _act_errno(code: int) -> int:
    return 0x00050000 | (code & 0xFFFF)


class _ArgCmp(ctypes.Structure):
    _fields_ = [
        ("arg", ctypes.c_uint),
        ("op", ctypes.c_int),
        ("datum_a", ctypes.c_uint64),
        ("datum_b", ctypes.c_uint64),
    ]


class _SockFprog(ctypes.Structure):
    _fields_ = [("len", ctypes.c_ushort), ("filter", ctypes.c_void_p)]


class SeccompUnavailable(RuntimeError):
    pass


@dataclass
class CompiledFilter:
    """A ready-to-install BPF program. Keep the instance alive while jobs run."""

    program: ctypes.Array[ctypes.c_char]
    fprog: _SockFprog
    denied_syscalls: tuple[str, ...]
    libc: ctypes.CDLL

    def install(self) -> None:  # pragma: no cover - runs in the child before exec
        libc = self.libc  # resolved in the parent, so the child loads nothing
        if libc.prctl(PR_SET_NO_NEW_PRIVS, 1, None, 0, 0) != 0:
            raise OSError(ctypes.get_errno(), "PR_SET_NO_NEW_PRIVS failed")
        if libc.prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, ctypes.addressof(self.fprog), 0, 0) != 0:
            raise OSError(ctypes.get_errno(), "PR_SET_SECCOMP failed")


def load_policy(path: Path = POLICY_PATH) -> dict[str, object]:
    data: dict[str, object] = json.loads(path.read_text(encoding="utf-8"))
    return data


def _names(group: object) -> list[str]:
    if not isinstance(group, dict):
        return []
    out: list[str] = []
    for names in group.values():
        if isinstance(names, list):
            out.extend(str(n) for n in names)
    return out


def _int_values(group: object) -> list[int]:
    if not isinstance(group, dict):
        return []
    return [int(v) for v in group.values()]


def compile_filter(path: Path = POLICY_PATH) -> CompiledFilter:
    if os.name != "posix":
        raise SeccompUnavailable("seccomp needs Linux")
    lib_name = ctypes.util.find_library("seccomp") or "libseccomp.so.2"
    try:
        lib = ctypes.CDLL(lib_name, use_errno=True)
    except OSError as exc:
        raise SeccompUnavailable(f"libseccomp not found ({exc})") from exc

    lib.seccomp_init.restype = ctypes.c_void_p
    lib.seccomp_init.argtypes = [ctypes.c_uint32]
    lib.seccomp_release.argtypes = [ctypes.c_void_p]
    lib.seccomp_syscall_resolve_name.argtypes = [ctypes.c_char_p]
    lib.seccomp_syscall_resolve_name.restype = ctypes.c_int
    lib.seccomp_rule_add_array.argtypes = [
        ctypes.c_void_p,
        ctypes.c_uint32,
        ctypes.c_int,
        ctypes.c_uint,
        ctypes.POINTER(_ArgCmp),
    ]
    lib.seccomp_export_bpf.argtypes = [ctypes.c_void_p, ctypes.c_int]

    policy = load_policy(path)
    ctx = lib.seccomp_init(SCMP_ACT_ALLOW)
    if not ctx:
        raise SeccompUnavailable("seccomp_init failed")
    denied: list[str] = []
    try:

        def resolve(name: str) -> int | None:
            nr = int(lib.seccomp_syscall_resolve_name(name.encode()))
            return None if nr < 0 else nr  # unknown on this architecture or libseccomp version

        def add(action: int, name: str, cmps: list[_ArgCmp] | None = None) -> None:
            nr = resolve(name)
            if nr is None:
                return
            arr = (_ArgCmp * len(cmps))(*cmps) if cmps else None
            rc = lib.seccomp_rule_add_array(ctx, action, nr, len(cmps or []), arr)
            if rc != 0:
                raise SeccompUnavailable(f"could not add rule for {name}: {rc}")

        eperm = _act_errno(errno.EPERM)
        for name in _names(policy.get("deny")):
            add(eperm, name)
            denied.append(name)
        for name in _names(policy.get("deny_enosys")):
            add(_act_errno(errno.ENOSYS), name)
            denied.append(name)
        for flag in _int_values(policy.get("deny_clone_flags")):
            # x86_64 and arm64 both pass clone's flags in argument 0.
            add(eperm, "clone", [_ArgCmp(0, SCMP_CMP_MASKED_EQ, flag, flag)])
        for family in _int_values(policy.get("deny_socket_families")):
            add(eperm, "socket", [_ArgCmp(0, SCMP_CMP_EQ, family, 0)])

        with tempfile.TemporaryFile() as fh:
            if lib.seccomp_export_bpf(ctx, fh.fileno()) != 0:
                raise SeccompUnavailable("seccomp_export_bpf failed")
            fh.seek(0)
            raw = fh.read()
    finally:
        lib.seccomp_release(ctx)

    if not raw or len(raw) % 8:
        raise SeccompUnavailable("libseccomp produced an invalid program")
    program = ctypes.create_string_buffer(raw, len(raw))
    fprog = _SockFprog(len(raw) // 8, ctypes.cast(program, ctypes.c_void_p).value)
    libc = ctypes.CDLL(None, use_errno=True)
    libc.prctl.argtypes = [ctypes.c_int, ctypes.c_ulong, ctypes.c_void_p, ctypes.c_ulong, ctypes.c_ulong]
    libc.prctl.restype = ctypes.c_int
    return CompiledFilter(program=program, fprog=fprog, denied_syscalls=tuple(denied), libc=libc)


def build_from_env(mode: str | None = None) -> CompiledFilter | None:
    """Return a compiled filter, or ``None`` when disabled or unavailable in ``auto`` mode."""
    choice = (mode if mode is not None else os.getenv("WORKER_SECCOMP", "auto")).strip().lower()
    if choice == "off":
        return None
    if choice not in ("auto", "required"):
        raise ValueError("WORKER_SECCOMP must be auto, required or off")
    try:
        return compile_filter()
    except SeccompUnavailable:
        if choice == "required":
            raise
        return None
