"""The seccomp policy compiles completely and fails closed when required."""

import pytest


def test_seccomp_policy_file_is_fully_compiled() -> None:
    from worker.seccomp import SeccompUnavailable, compile_filter, load_policy

    try:
        compiled = compile_filter()
    except SeccompUnavailable:
        pytest.skip("libseccomp not available")
    policy = load_policy()
    deny = policy["deny"]
    assert isinstance(deny, dict)
    listed = [n for group in deny.values() for n in group]
    for name in ("ptrace", "mount", "bpf", "keyctl", "unshare", "setns"):
        assert name in listed and name in compiled.denied_syscalls
    assert "clone3" in compiled.denied_syscalls


def test_seccomp_required_mode_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    import ctypes.util

    from worker import seccomp

    monkeypatch.setattr(ctypes.util, "find_library", lambda _name: "/nonexistent/libseccomp.so")
    with pytest.raises(seccomp.SeccompUnavailable):
        seccomp.build_from_env("required")
    assert seccomp.build_from_env("auto") is None
    assert seccomp.build_from_env("off") is None
    with pytest.raises(ValueError):
        seccomp.build_from_env("maybe")
