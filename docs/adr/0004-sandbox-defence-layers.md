# ADR 0004: Sandbox defence layers (seccomp per job, optional cgroups, optional gVisor)

- Status: accepted
- Date: 2026-10-11

## Context

Until Phase 3 the judge worker relied on rlimits, a separate UID per job, and the container (dropped capabilities, read-only filesystem, internal network, Docker's default seccomp profile). Gaps: user code could still ask the kernel for features no exercise needs (ptrace, namespaces, BPF, the keyring, IP sockets), total memory per job was only bounded by processes × address space, and the output cap was enforced one step after reading.

## Decision

1. **Per-job seccomp filter**, installed in each job process right before `exec`. The policy is a data file (`judge-worker/seccomp/job-policy.json`), compiled once at worker start with libseccomp through `ctypes` (no extra Python dependency). It is a deny list over an allow default, because Docker's default allow-list profile still applies to the whole container; the per-job filter narrows what the job may do *beyond* what the worker itself needs. `WORKER_SECCOMP=required` in the Docker image makes the worker refuse to start without it.
2. **We did not replace Docker's container-wide profile** with a custom one. A custom profile must re-list every allowed syscall, is easy to get subtly wrong, and Docker's default already blocks these calls for a container without `CAP_SYS_ADMIN`. The per-job filter adds defence in depth inside the container and works the same in local development on Linux.
3. **cgroup v2 per job is opt-in** (`WORKER_CGROUP_ROOT`), because Docker gives containers no writable cgroup tree; it needs host preparation (`docker-compose.cgroup.yml`). Without it the worker reports `"cgroup": false` and keeps the rlimit limits.
4. **gVisor is an optional runtime** (`docker-compose.gvisor.yml`), recommended for public deployments.
5. **Output cap enforced in the pipe reader**: the reader that would exceed the budget kills the process group itself.

## Consequences

- Jobs cannot open IP sockets even if the network were reachable; Unix sockets, threads, `fork` and `subprocess` still work.
- Workers on hosts without libseccomp (macOS, Windows, minimal Linux) run without the filter in `auto` mode, visible in `GET /health`.
- The cgroup real-kernel tests are written but were not run in the authoring environment (cgroup v1 controllers only). They must be run on the deployment host before relying on the feature.
- `/health` on the worker and `/api/v1/health/ready` on the API report which layers are active (`features`).
