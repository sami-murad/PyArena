# Security

This document separates what PyArena protects against, what it does not, and what has actually been tested. It makes no claim of complete security.

## Running untrusted code

All submitted Python is treated as hostile. It never runs in the API process. The judge worker runs each job like this:

| Control | Docker (`docker-compose.yml`) | Local worker on Linux/macOS | Local worker on Windows |
|---|---|---|---|
| Separate process per run, empty environment | yes | yes | yes |
| Wall-clock timeout, output cap | yes | yes | yes |
| CPU, memory, file-size, open-file limits (`setrlimit`) | yes | yes | **no** |
| Seccomp filter per job (no `ptrace`, mounts, namespaces, BPF, keyring, IP sockets) | yes (`WORKER_SECCOMP=required`) | Linux: yes if libseccomp is installed; macOS: no | no |
| Output cap enforced while writing (process killed at the byte limit) | yes | yes | yes |
| Own UID per job; all its processes killed afterwards | yes | no | no |
| cgroup v2 per job: total `memory.max` (no swap), `pids.max`, group OOM kill | opt-in (`docker-compose.cgroup.yml`) | opt-in (`WORKER_CGROUP_ROOT`) | no |
| Process count limit (`RLIMIT_NPROC` + `pids_limit`) | yes | no | no |
| No internet (internal Docker network) | yes | no | no |
| Read-only root filesystem, 64 MB tmpfs scratch space | yes | no | no |
| Capabilities limited to SETUID, SETGID, KILL, CHOWN, DAC_OVERRIDE, FOWNER; no-new-privileges | yes | n/a | n/a |
| Can reach the database | no (not on the `data` network) | depends on your machine | depends on your machine |

**Environment whitelist.** A job receives only `PATH, LANG, LC_ALL, PYTHONUNBUFFERED, PYTHONDONTWRITEBYTECODE, PYTHONIOENCODING, HOME, TMPDIR` (`ENV_WHITELIST` in `sandbox.py`), with values set by the sandbox. `HOME` and `TMPDIR` point into the job directory, which is deleted afterwards. Nothing is copied from the worker's environment. Threat addressed: secrets or host configuration leaking to user code. Tested by `test_environment_is_exactly_the_whitelist` and `test_tmpdir_points_inside_the_job`.

**Kill reasons.** Every run that the sandbox stops reports why: `oom`, `cpu`, `wall`, `output` or `signal`. This is diagnostic information for users and operators, not a new security control. An unexplained `SIGKILL` is classified as `cpu` when the run lasted at least the CPU limit, otherwise `oom` (CPU time can never exceed wall time).

**Diagnostics endpoint.** `GET /_diag` exists only when `WORKER_ENABLE_DIAG=true` (set in `docker-compose.dev.yml`, never in `docker-compose.yml`). It still requires the worker token and reports versions, sandbox mode and limits, never environment values or secrets. Tested by `test_diag_is_off_by_default_and_needs_token_when_on`.

**Per-job seccomp filter** (`worker/seccomp.py`, policy in `judge-worker/seccomp/job-policy.json`). Threat: user code calling into kernel features a Python exercise never needs, which are common container-escape and kernel-exploit paths. Refused with `EPERM`: `ptrace`, `process_vm_readv/writev`, `kcmp`, `bpf`, `perf_event_open`, `userfaultfd`, `io_uring_*`, `keyctl`, `add_key`, `request_key`, `mount` and the new mount API, `pivot_root`, `chroot`, `open_by_handle_at`, `unshare`, `setns`, `clone` with any `CLONE_NEW*` flag, module loading, `kexec`, `reboot`, `swapon/off`, `acct`, `quotactl`, `syslog`, `iopl/ioperm`, and `socket()` for `AF_INET`, `AF_INET6`, `AF_NETLINK` and `AF_PACKET`. `clone3` reports `ENOSYS` because its flags cannot be inspected, so the C library falls back to the filtered `clone`. Unix sockets, threads, `fork` and `subprocess` keep working. The filter is compiled once at start-up and installed in the child right before `exec`; it is inherited by every process the job starts and cannot be removed. The container also keeps Docker's default seccomp profile. Tested by the `test_seccomp_*` tests in `test_sandbox.py` (each call is shown to succeed without the filter and fail with it) and `test_seccomp.py` (policy fully compiled; `required` mode fails closed).

**Output cap at the pipe.** Threat: a program printing without end exhausting worker memory or holding a job slot. stdout and stderr share one byte budget; when a read would exceed it, the reader kills the process group immediately and keeps nothing beyond the limit. Tested by `test_output_cap_kills_a_single_huge_write` (one 50 MB write stopped at exactly the cap in under 2.5 s) and `test_output_budget_is_shared_by_stdout_and_stderr`.

**cgroup v2 per job (opt-in).** Threat: `RLIMIT_AS` is per process and `RLIMIT_NPROC` per UID, so a job can still use more total memory by spreading it over several processes. With `WORKER_CGROUP_ROOT` set to a delegated, empty cgroup v2 directory, each job gets its own group with `memory.max` = the job's memory limit, `memory.swap.max=0`, `pids.max` = the process limit and `memory.oom.group=1`; the group is killed with `cgroup.kill` and removed afterwards, and an OOM kill inside it is reported as `MEMORY_LIMIT` with certainty. Docker does not give containers a writable cgroup tree, so this needs host preparation (`docker-compose.cgroup.yml`). Unit-tested against a fake cgroup directory (`test_cgroups.py`); the real-kernel tests (`test_real_fork_bomb_stops_at_pids_max`, `test_real_memory_spread_over_processes_is_oom_killed`) run only with `PYARENA_TEST_CGROUP_ROOT` and **have not been run yet**: the machine this was written on only offered cgroup v1 memory and pids controllers.

**Symlinks and `/proc`.** A job can create symlinks pointing anywhere, but cleanup removes links without following them (`test_symlink_out_of_the_job_dir_cannot_delete_outside_files`), and in Docker the job's UID cannot read files that only root can (`test_symlink_cannot_read_root_only_files`). `/proc/self/environ` contains only the whitelist (`test_proc_self_environ_contains_only_the_whitelist`); the worker's own `/proc/<pid>/environ` is unreadable to the job's UID (`test_job_cannot_read_worker_environment`).

**Huge memory maps.** `mmap` of a 4 GB anonymous region fails under `RLIMIT_AS`; a sparse 8 GB file cannot even be created under `RLIMIT_FSIZE` (Python ignores `SIGXFSZ`, so the user sees `File too large`). Tested by `test_mmap_of_huge_anonymous_region_fails` and `test_huge_sparse_file_for_mmap_is_refused`.

**Fuzzing.** `judge-worker/fuzz/fuzz_sandbox.py` fuzzes with Atheris the code that parses what untrusted programs print (result extraction after the random marker, stderr path cleaning, error classification) and the worker's request validation. 200,000 inputs ran without a failure at the time of writing.

**gVisor (optional).** `docker-compose.gvisor.yml` runs the worker with `runtime: runsc`, a user-space kernel that removes most of the host-kernel attack surface. Not tested here (no gVisor in this environment).

**Only the Docker mode is meant for code you do not trust.** The local modes exist for development convenience.

### What is not protected

- **Local worker (no Docker): jobs run as the worker's own user, so a job can read the worker's `/proc/<pid>/environ`, including `WORKER_TOKEN`.** Use a throwaway token locally and never point a local worker at a production backend.
- Containers share the host kernel. A kernel vulnerability could allow an escape. Before running a public service, add a stronger boundary such as **gVisor** (`runtime: runsc`), **nsjail**, or a dedicated VM for the worker, and keep the host patched.
- Inside the `judge` network, user code can reach the API on port 8000 (the same public API anyone can call) and the worker port (which requires the secret token). It cannot reach PostgreSQL or the internet.
- Jobs can read world-readable files in the worker image (Python's standard library, the worker's own source). The worker image contains no secrets; `WORKER_TOKEN` is in the worker process's environment, which other UIDs cannot read (tested).
- CPU time is limited per process; a job that forks up to the process limit can use several CPU cores until the wall-clock timeout. `cpus: 2` caps the container.
- Hidden tests and reference solutions are in `database/seeds/questions.json`. If your repository is public, so are they. For a real public competition, keep the production question bank private.

## Threat model (STRIDE)

Assets: users' accounts and sessions, the integrity of competition results, hidden tests, the worker token, the database, and the host machine. Trust boundaries: browser ↔ nginx/API (internet), API ↔ worker (shared token, `judge` network), worker ↔ job process (the sandbox), API ↔ PostgreSQL/Redis (`data` network).

| | Threat | Where | Mitigation | Residual risk |
|---|---|---|---|---|
| **S**poofing | Stolen or forged session | browser ↔ API | Signed httpOnly `SameSite=Lax` cookie, Argon2id, login rate limit, identical errors for unknown user / wrong password | Stateless JWT cannot be revoked before expiry |
| | A job pretends to be the backend and calls the worker | job → worker | `X-Worker-Token` compared in constant time; token not in the job's environment and the worker's `/proc` unreadable to the job UID | Local (non-Docker) worker: token readable |
| | A program fakes a judge result by printing it | job → harness | Random 128-bit marker per run, only the last occurrence counts, expected outputs never sent to the worker | none known |
| **T**ampering | Client manipulates timers, verdicts or winner | browser → API | Server-side judging, server timestamps, atomic conditional `UPDATE` for the winner | none known |
| | Job modifies worker code or other jobs' files | job → worker | Read-only root filesystem, own UID and `0700` directory per job, cleanup that does not follow symlinks | none known |
| | Replayed or duplicated submissions | browser → API | Idempotency keys scoped per user; one pending submission per player; cooldown | none known |
| | Player looks things up in another tab during a Focus Mode round | browser | Tab and window focus signals, server-side escalation enforced at submission time | Detection depends on an unmodified browser; see "Focus Mode: honest limits" |
| **R**epudiation | "I never submitted that" / disputes over who won | API | Every submission stored with server receipt order (id) and time; JSON logs with request id, user, competition and submission | Logs live as long as you keep them |
| **I**nformation disclosure | Hidden tests leak | API → browser | Never included in responses; failures on hidden tests show no input or output | Public repository exposes the seed bank |
| | Secrets leak to user code | worker → job | Environment whitelist, separate UID, no secrets in the worker image | Kernel bugs (see gVisor) |
| | Operations data leaks | API | `/metrics` not proxied and optionally token-protected; readiness shows only up/down | none known |
| **D**enial of service | Infinite loops, memory bombs, fork bombs, output floods | job | CPU/wall/memory/file/process limits, output cap at the pipe, per-UID kill, optional cgroup memory and pids limits, `pids_limit`, `mem_limit`, `cpus` on the container | Without cgroups, total memory per job is bounded only by process count × address-space limit |
| | Request floods | browser → API | Redis rate limits, size limits on code and input, nginx | Rate limiter fails open while Redis is down |
| **E**levation of privilege | Escape from the job to the worker or host | job → kernel | Unprivileged UID, `no-new-privileges`, six capabilities only, per-job seccomp, Docker default seccomp, internal-only networks | Shared host kernel; use gVisor or a VM for public deployments |
| | Ordinary user acts as host or admin | browser → API | Host-only actions checked on the server per request; no admin endpoints exist | none known |

## Application security

| Threat | Protection |
|---|---|
| Password theft | Argon2id via `argon2-cffi` (automatic rehash when parameters change); passwords are never logged or returned |
| Account enumeration | Same error for unknown user and wrong password; dummy hash keeps timing similar |
| Session theft by XSS | Session token in an httpOnly cookie; React escapes all output; problem statements rendered by a tiny Markdown subset as text nodes; ESLint forbids `dangerouslySetInnerHTML` |
| CSRF | `SameSite=Lax` cookie, JSON-only bodies, and an `Origin` check on every state-changing request |
| Broken object-level authorization | Snippets and submissions are always queried by owner; rooms check membership; other users' data returns 404 |
| SQL injection | SQLAlchemy parameterised queries only |
| Brute force and abuse | Rate limits (Redis, shared by all API processes) on login, registration, execution, joining and submitting; per-competition submission cooldown |
| Room-code guessing | 8 characters from a 31-symbol alphabet (about 8.5 × 10^11 codes), generated with `secrets`; join is rate limited; wrong codes and non-member access look identical |
| Cheating in competitions | Winner decided on the server, atomically; client timers and statuses are never trusted; hidden-test inputs and outputs never sent; the question is withheld until the start |
| Secret leakage | Secrets only in environment variables; the app refuses to start in production with placeholder secrets or insecure cookies; the frontend bundle contains only public settings |
| Clickjacking, MIME sniffing | `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'`, `nosniff` (nginx) |
| Duplicate actions from retries | `Idempotency-Key` on execute and submissions; stored responses are scoped per user (or IP), so one user can never read another's stored response; only 2xx responses are stored |
| Information leaks through operations endpoints | `/metrics` is not proxied by nginx and can require `METRICS_TOKEN`; `/health/ready` reports only up/down per dependency |

### Focus Mode: honest limits

Focus Mode is a fair-play signal, not anti-cheat. What it can and cannot do:

- It only knows what the browser reports: the tab was hidden, the window lost focus, a large paste happened. A modified client, a browser extension or a script can suppress those signals. A long gap in heartbeats during a running round is recorded, but the server cannot tell *why* a client went quiet.
- It cannot see a second device, another person in the room, or a second monitor showing another app while the window keeps focus.
- Absence length is the smaller of the server's measurement and the browser's own, so network delay never counts against a player; a dishonest client can under-report, which is no worse than not reporting.
- It never blocks the browser: no disabled shortcuts, no forced fullscreen, no clipboard reading (only the length of a paste is sent).
- Absences under 2 seconds are ignored so that screen readers, OS prompts and notifications do not count. Players who need more should ask for a room without Focus Mode; the notice says so before the round.
- Penalties are enforced on the server when a submission arrives (423 while paused or frozen, 403 after disqualification); a disqualified player's waiting submissions are cancelled and an accepted one can never win.

### Known limitations

- Sessions are stateless JWTs. Logging out deletes the cookie, but a copied token stays valid until it expires (`SESSION_DAYS`). A server-side session table would allow revocation.
- Without `REDIS_URL`, rate limits and presence are per process (see ARCHITECTURE.md, Scaling). Production refuses to start without Redis.
- The Redis rate limiter fails open: if Redis is unreachable, requests are allowed (and a warning is logged) rather than blocking the whole site. Monitor Redis health.
- Fixed-window rate limiting allows up to twice the limit across a window boundary.
- No email verification or password reset yet.
- The Content-Security-Policy allows inline styles because the Monaco editor needs them.

## What has been tested

Automated tests (all run and passing at the time of writing):

- Worker hardening (Phase 3): seccomp blocks IP sockets, `ptrace`, the keyring, new namespaces, `mount` and `bpf`, and reports `ENOSYS` for `clone3`, while Unix sockets, threads and `fork` work; output cap stops a single 50 MB write; one budget for stdout and stderr; symlinks cannot make cleanup delete outside files or read root-only files; `/proc/self/environ` holds only the whitelist; huge anonymous and file-backed `mmap` refused; cgroup manager unit tests.
- Worker: syntax/runtime errors, infinite loops, `sleep` past the wall clock, output flooding, 1 GB allocation, empty environment, harness hiding its own frames, the call spec file being removed before user code runs, unauthenticated worker requests.
- Worker isolation (run as root with exactly the Docker capability set and no-new-privileges): job runs as an unprivileged UID, cannot read the worker's environment, cannot signal the worker, a fork bomb is contained and the worker keeps working, background processes that call `setsid` are killed after the job.
- Backend: Argon2id hashes, identical login errors, tampered cookies rejected, cross-site POST blocked, login and execution rate limits, size limits, hidden tests absent from question responses, hidden failures revealing no input or exception text, submissions and snippets private to their owner, room membership, participant limit, duplicate pending submissions rejected, cooldown, judge outage reported as `SYSTEM_ERROR` and never winning, concurrent `claim_winner` calls producing exactly one winner, simultaneous correct submissions won by the earlier one, production config refusing default secrets.
- End to end (Playwright, real stack): playground run with input and error explanation; two players in a room, wrong answer then correct answer, both browsers see the same winner.

Not yet tested: the Docker images themselves were not built in the environment where this project was written (no access to Docker Hub there); the compose files were validated with `docker compose config`. Build and run them yourself with `docker compose up --build` and check `GET /api/health` reports `executor_mode: uid-isolated`. No penetration test or third-party audit has been done.

## Reporting

Before going public, add a contact address in `frontend/src/config/websitesInfo.ts` and describe how people should report vulnerabilities.
