# Architecture

## Components

```
 Browser (React + Monaco + socket.io-client)
    │  HTTPS: /api/*  and  WebSocket: /socket.io/*      (same origin)
    ▼
 nginx (Docker) or Vite dev server (development)
    │
    ▼
 FastAPI + python-socketio  ── one ASGI app (backend/app/main.py)
    │            │
    │ SQL        │ HTTP + shared token (X-Worker-Token)
    ▼            ▼
 PostgreSQL    Judge worker (judge-worker/) ── spawns one restricted Python process per test
```

| Part | Responsibility | Never does |
|---|---|---|
| Frontend | Editing, display, client-side input checks | Decide correctness, timing or winners |
| API | Auth, validation, rooms, judging decisions, winner selection | Execute user code |
| Judge worker | Run code with limits, report stdout/stderr/return value | See expected outputs, users or database credentials |
| PostgreSQL | Persistent state, the atomic winner update | Reachable from the worker |

## Execution engine decision

Judge0 CE was evaluated first. Its documented deployment requires a Linux host using **cgroup v1** (a GRUB change on Ubuntu 22.04). Docker Desktop, WSL2 and current Linux distributions default to cgroup v2, where Judge0's bundled isolate sandbox fails to start. Rather than making local development depend on changing the host kernel configuration, PyArena ships its own small worker behind an `Executor` protocol (`backend/app/execution/client.py`), so Judge0 or another engine can be plugged in later on a suitable server.

## The judge worker

Every run:

1. Gets a fresh temporary directory and an empty environment (no inherited variables).
2. Starts `python -I -B` with `setrlimit` limits: CPU seconds, address space (memory), file size, open files, no core dumps.
3. In Docker the worker runs as root inside the container only to give each job **its own UID** (`20000+`), apply `RLIMIT_NPROC` to that UID, and afterwards kill every process owned by that UID. UIDs rotate so a reused UID has no leftovers.
4. A wall-clock timeout and an output cap stop runaway programs.
5. The directory is deleted.

Function problems use a harness (`_pyarena_harness.py`) that loads `solution.py`, calls the named function with the test arguments and prints the JSON-encoded return value after a random marker. The backend compares that value with the expected answer, which the worker never receives.

## Competition state machine

```
WAITING ──host starts──▶ COUNTDOWN ──starts_at──▶ RUNNING ──first accepted──▶ FINISHED (solved)
   │                                                 └──────ends_at────────▶ FINISHED (time_up)
   ├── host cancels / everyone leaves ──▶ CANCELLED
   └── idle for COMPETITION_IDLE_MINUTES ──▶ EXPIRED
```

- Every transition is a compare-and-set `UPDATE ... WHERE status = <expected>`, so duplicate requests cannot apply it twice.
- `starts_at` and `ends_at` are set by the server when the host starts. Clients compute a clock offset from `server_time` and only use it for display.
- The question is chosen at start but only included in responses once `starts_at` has passed.
- Timers are `asyncio` tasks, and every read path also calls `refresh()`, and a sweeper re-checks active rooms every 15 seconds. A restart therefore never leaves a room stuck.

## Fairness rule (winner selection)

1. A submission is stored as `PENDING` the moment the server receives it. Its auto-incrementing id is the receipt order.
2. One judge loop per competition always takes the **lowest pending id** next.
3. When a submission passes every test, the server runs one conditional update:
   ```sql
   UPDATE competitions
      SET status='FINISHED', winner_user_id=:u, winner_submission_id=:s, winner_accepted_at=now()
    WHERE id=:c AND status='RUNNING' AND winner_submission_id IS NULL AND ends_at >= :submitted_at
   ```
   At most one such update can match, whatever the timing of requests, retries or reconnects.
4. Remaining pending submissions are marked `CANCELLED` (not judged).

So among near-simultaneous correct submissions, **the one the server received first wins**. Browser clocks play no part. Infrastructure failures (`SYSTEM_ERROR`) never win and do not block resubmission.

## Real-time protocol

Socket.IO protocol on both ends (`python-socketio` 5 and `socket.io-client` 4). There is no native WebSocket endpoint, so protocols are never mixed. The socket authenticates with the same httpOnly session cookie as the REST API, and every event re-checks membership. Commands that change state (start, submit) go through REST; the socket pushes results. After any change the server broadcasts a full `room:state` snapshot, which makes reconnection simple: the client re-joins and receives the current state.

## Scaling

The API is designed to run as **one process** today. These pieces live in that process's memory:

- rate-limit counters,
- socket presence (who is online),
- judge queues and timers (the winner decision itself is safe in the database regardless).

To run several API processes, move rate limits and presence to Redis, use the python-socketio Redis manager, and run judging with a database-backed job queue (for example `SELECT ... FOR UPDATE SKIP LOCKED`). The judge worker can already be scaled by running more containers behind the same token.

## Frontend structure

- `config/`: single sources of truth (`websitesInfo.ts`, `appConfig.ts`, `navigation.ts`, `socialLinks.ts`, `features.ts`).
- `services/`: `apiClient.ts` (fetch wrapper, readable errors) and `socketClient.ts`.
- `features/*/services`: API calls per feature; `features/*/hooks`: state and side effects; components only render.
- `components/editor/`: Monaco bundled locally (no CDN), only the Python language registered, theme built from the CSS tokens.
