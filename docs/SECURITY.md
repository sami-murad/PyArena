# Security

This document separates what PyArena protects against, what it does not, and what has actually been tested. It makes no claim of complete security.

## Running untrusted code

All submitted Python is treated as hostile. It never runs in the API process. The judge worker runs each job like this:

| Control | Docker (`docker-compose.yml`) | Local worker on Linux/macOS | Local worker on Windows |
|---|---|---|---|
| Separate process per run, empty environment | yes | yes | yes |
| Wall-clock timeout, output cap | yes | yes | yes |
| CPU, memory, file-size, open-file limits (`setrlimit`) | yes | yes | **no** |
| Own UID per job; all its processes killed afterwards | yes | no | no |
| Process count limit (`RLIMIT_NPROC` + `pids_limit`) | yes | no | no |
| No internet (internal Docker network) | yes | no | no |
| Read-only root filesystem, 64 MB tmpfs scratch space | yes | no | no |
| Capabilities limited to SETUID, SETGID, KILL, CHOWN, DAC_OVERRIDE, FOWNER; no-new-privileges | yes | n/a | n/a |
| Can reach the database | no (not on the `data` network) | depends on your machine | depends on your machine |

**Only the Docker mode is meant for code you do not trust.** The local modes exist for development convenience.

### What is not protected

- Containers share the host kernel. A kernel vulnerability could allow an escape. Before running a public service, add a stronger boundary such as **gVisor** (`runtime: runsc`), **nsjail**, or a dedicated VM for the worker, and keep the host patched.
- Inside the `judge` network, user code can reach the API on port 8000 (the same public API anyone can call) and the worker port (which requires the secret token). It cannot reach PostgreSQL or the internet.
- Jobs can read world-readable files in the worker image (Python's standard library, the worker's own source). The worker image contains no secrets; `WORKER_TOKEN` is in the worker process's environment, which other UIDs cannot read (tested).
- CPU time is limited per process; a job that forks up to the process limit can use several CPU cores until the wall-clock timeout. `cpus: 2` caps the container.
- Hidden tests and reference solutions are in `database/seeds/questions.json`. If your repository is public, so are they. For a real public competition, keep the production question bank private.

## Application security

| Threat | Protection |
|---|---|
| Password theft | Argon2id via `argon2-cffi` (automatic rehash when parameters change); passwords are never logged or returned |
| Account enumeration | Same error for unknown user and wrong password; dummy hash keeps timing similar |
| Session theft by XSS | Session token in an httpOnly cookie; React escapes all output; problem statements rendered by a tiny Markdown subset as text nodes; ESLint forbids `dangerouslySetInnerHTML` |
| CSRF | `SameSite=Lax` cookie, JSON-only bodies, and an `Origin` check on every state-changing request |
| Broken object-level authorization | Snippets and submissions are always queried by owner; rooms check membership; other users' data returns 404 |
| SQL injection | SQLAlchemy parameterised queries only |
| Brute force and abuse | In-memory rate limits on login, registration, execution, joining and submitting; per-competition submission cooldown |
| Room-code guessing | 8 characters from a 31-symbol alphabet (about 8.5 × 10^11 codes), generated with `secrets`; join is rate limited; wrong codes and non-member access look identical |
| Cheating in competitions | Winner decided on the server, atomically; client timers and statuses are never trusted; hidden-test inputs and outputs never sent; the question is withheld until the start |
| Secret leakage | Secrets only in environment variables; the app refuses to start in production with placeholder secrets or insecure cookies; the frontend bundle contains only public settings |
| Clickjacking, MIME sniffing | `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'`, `nosniff` (nginx) |

### Known limitations

- Sessions are stateless JWTs. Logging out deletes the cookie, but a copied token stays valid until it expires (`SESSION_DAYS`). A server-side session table would allow revocation.
- Rate limits and presence are per process (see ARCHITECTURE.md, Scaling).
- No email verification or password reset yet.
- The Content-Security-Policy allows inline styles because the Monaco editor needs them.

## What has been tested

Automated tests (all run and passing at the time of writing):

- Worker: syntax/runtime errors, infinite loops, `sleep` past the wall clock, output flooding, 1 GB allocation, empty environment, harness hiding its own frames, the call spec file being removed before user code runs, unauthenticated worker requests.
- Worker isolation (run as root with exactly the Docker capability set and no-new-privileges): job runs as an unprivileged UID, cannot read the worker's environment, cannot signal the worker, a fork bomb is contained and the worker keeps working, background processes that call `setsid` are killed after the job.
- Backend: Argon2id hashes, identical login errors, tampered cookies rejected, cross-site POST blocked, login and execution rate limits, size limits, hidden tests absent from question responses, hidden failures revealing no input or exception text, submissions and snippets private to their owner, room membership, participant limit, duplicate pending submissions rejected, cooldown, judge outage reported as `SYSTEM_ERROR` and never winning, concurrent `claim_winner` calls producing exactly one winner, simultaneous correct submissions won by the earlier one, production config refusing default secrets.
- End to end (Playwright, real stack): playground run with input and error explanation; two players in a room, wrong answer then correct answer, both browsers see the same winner.

Not yet tested: the Docker images themselves were not built in the environment where this project was written (no access to Docker Hub there); the compose files were validated with `docker compose config`. Build and run them yourself with `docker compose up --build` and check `GET /api/health` reports `executor_mode: uid-isolated`. No penetration test or third-party audit has been done.

## Reporting

Before going public, add a contact address in `frontend/src/config/websitesInfo.ts` and describe how people should report vulnerabilities.
