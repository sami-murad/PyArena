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

With `REDIS_URL` set, several API processes (replicas) can run behind one load balancer:

| Concern | Without Redis (one process) | With Redis |
|---|---|---|
| Rate limits | in-memory sliding window | Redis fixed window (`SET NX PX` + `INCR` in one transaction); fails open if Redis is down |
| Socket.IO fan-out | local | `AsyncRedisManager`: an event emitted on any process reaches sockets on every process |
| Presence (online dots) | local | Redis hash per competition: `user_id -> open sockets` |
| Judge ordering | one judge loop per competition in the process | Redis lock `judge-lock:{competition_id}`: only one process drains a competition, so strict receipt order holds |
| Winner | atomic `UPDATE` | unchanged (the database is the authority either way) |
| Timers and state transitions | compare-and-set `UPDATE`s | unchanged: any process may run them; only one wins each transition |
| Idempotency keys | database | database |

`tests/test_multi_replica.py` runs two API servers on one Redis, with the host connected to one and the guest to the other, and plays a full match.

Known limits: a crashed process leaves its sockets counted as online until the presence hash expires (12 h idle); Socket.IO's long-polling fallback needs sticky sessions at the load balancer (WebSocket transport does not).

## Observability

- **Logs:** one JSON object per line (`LOG_FORMAT=json`) with `request_id`, `user_id`, `competition_id`, `submission_id` when known. The request id comes from `X-Request-ID` or is generated, and is returned on every response.
- **Metrics:** Prometheus at `GET /metrics` (internal only). A starter Grafana dashboard is in `docs/observability/grafana-dashboard.json`.
- **Health:** `/api/v1/health/live` for liveness (Docker `HEALTHCHECK`), `/api/v1/health/ready` for readiness (503 when the database, worker or Redis is down).

## Frontend structure

- `config/`: single sources of truth (`websitesInfo.ts`, `appConfig.ts`, `navigation.ts`, `socialLinks.ts`, `features.ts`).
- `services/`: `apiClient.ts` (fetch wrapper, readable errors) and `socketClient.ts`.
- `features/*/services`: API calls per feature; `features/*/hooks`: state and side effects; components only render.
- `components/editor/`: Monaco bundled locally (no CDN), only the Python language registered, theme built from the CSS tokens.
