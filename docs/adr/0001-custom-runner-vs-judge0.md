# ADR 0001: A custom judge worker instead of Judge0

- Status: accepted
- Date: 2026-10-11

## Context

PyArena must run untrusted Python safely, both on developers' machines (Windows with Docker Desktop, macOS, Linux, WSL2) and on a server. Judge0 CE was the first candidate. Its documented deployment needs a Linux host running cgroup v1, which on current distributions means changing the kernel boot configuration. Docker Desktop, WSL2 and recent Linux releases use cgroup v2, where Judge0's bundled isolate sandbox fails to start.

## Decision

Build a small judge worker (`judge-worker/`) that runs each test in a fresh Python process with `setrlimit` limits, an empty whitelisted environment, a wall-clock timeout and an output cap, and in Docker gives each job its own UID that is cleaned up afterwards. The backend talks to it through the `Executor` protocol (`backend/app/execution/client.py`).

## Consequences

- Works the same way on every developer machine that runs Docker, with no host kernel changes.
- Python only; another language needs its own runtime image (a future `LanguageRuntime` abstraction).
- Isolation is ours to maintain and test. `test_isolation.py`, `test_sandbox.py` and the four smoke tests in `test_smoke.py` must pass locally and against the Docker worker.
- Judge0 or another engine can still be plugged in later behind the `Executor` protocol on a host that supports it.
- For public deployment a stronger boundary (gVisor, nsjail or a VM) is still recommended; see SECURITY.md.
