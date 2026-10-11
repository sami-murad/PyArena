# API

Base path `/api`. Interactive documentation (development only): http://localhost:8000/api/docs.

## Conventions

- Request and response bodies are JSON. Errors look like `{"detail": "message", "code": "optional_code"}`; validation errors use FastAPI's list format.
- **Authentication:** an httpOnly, `SameSite=Lax` cookie (`pyarena_session`) set by register/login. Send requests with credentials (`fetch(..., {credentials: "include"})`).
- **CSRF:** POST/PUT/DELETE requests whose `Origin` header is not an allowed origin are rejected with 403.
- **Object-level authorization:** other users' snippets, submissions and rooms you are not in return 404, the same as missing ones.

## Status codes

| Code | Meaning |
|---|---|
| 200 / 201 / 202 / 204 | Success (202: submission queued for judging) |
| 401 | Not signed in |
| 403 | Signed in but not allowed (not host, left the room, cross-site request) |
| 404 | Not found, or not yours |
| 409 | Conflict with the current state (room full, already started, previous submission pending) |
| 422 | Invalid input (sizes, formats) |
| 429 | Rate limited; see `Retry-After` |
| 503 | The judge worker is unavailable |

## Rate limits (defaults, configurable)

| Endpoint | Limit |
|---|---|
| `POST /execute` | 30 per minute per user (per IP for guests) |
| `POST /auth/login` | 10 per minute per IP |
| `POST /auth/register` | 20 per hour per IP |
| `POST /competitions/join` | 20 per minute per user |
| Submissions | 30 per minute per user, plus a 3 s cooldown per competition |

## Endpoints

### Health
`GET /health` → `{"status": "ok"|"degraded", "checks": {"database": "ok", "executor": "ok", "executor_mode": "uid-isolated"}}`

### Auth
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/register` | `{username, email, password}` (username `^[A-Za-z0-9_]{3,24}$`, password 8–128) | 201 user, sets cookie |
| POST | `/auth/login` | `{login, password}` (login = username or email) | user, sets cookie |
| POST | `/auth/logout` | | 204, clears cookie |
| GET | `/auth/session` | | user or `null` |

### Users
| GET | `/users/me` | current user |
|---|---|---|
| GET | `/users/me/statistics` | `{competitions_played, competitions_won, submissions_total, submissions_accepted, questions_solved, acceptance_rate}` |

### Playground
`POST /execute` (no sign-in needed)

```json
{ "code": "print(input())", "stdin": "hi" }
```
```json
{ "status": "OK", "stdout": "hi\n", "stderr": "", "exit_code": 0, "duration_ms": 21,
  "truncated": false, "error_type": null, "explanation": null }
```
`status` is one of `OK, SYNTAX_ERROR, RUNTIME_ERROR, TIMEOUT, MEMORY_LIMIT, OUTPUT_LIMIT`. `explanation` is `{title, summary, tips[], line}` for recognised errors.

`kill_reason` says why the sandbox stopped the program, or is `null` when it ended on its own:

| Value | Meaning |
|---|---|
| `oom` | memory limit (MemoryError, crash from exhausted memory, or killed by the memory cgroup) |
| `cpu` | CPU time limit |
| `wall` | wall-clock limit, e.g. sleeping or waiting for input |
| `output` | printed more than the output cap |
| `signal` | another fatal signal |

When the judge worker is unavailable the response is 503. Outside production the message ends with the cause, for example `(auth: invalid worker token)` or `(unreachable: cannot connect to http://localhost:8001)`.

### Questions
| GET | `/questions?difficulty=easy` | list `{id, slug, title, difficulty, mode}` |
|---|---|---|
| GET | `/questions/{id}` | statement, signature, specs, constraints, starter code, **public** examples, limits, `total_tests` |

Hidden tests are never returned.

### Practice submissions (signed in)
| POST | `/submissions` | `{question_id, code}` → judged submission |
|---|---|---|
| GET | `/submissions?question_id=` | your submissions |
| GET | `/submissions/{id}` | one of your submissions, including `code` |

A submission has `status` (`ACCEPTED, WRONG_ANSWER, SYNTAX_ERROR, RUNTIME_ERROR, TIMEOUT, MEMORY_LIMIT, OUTPUT_LIMIT, SYSTEM_ERROR, CANCELLED, PENDING`), `passed_count`, `total_count` and `feedback`. For a failed **example** test, feedback includes input, expected and actual output. For a failed **hidden** test it contains only the test number and error type.

### Competitions (signed in)
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/competitions` | `{difficulty: easy\|medium\|hard\|any, max_players: 2–16, duration_minutes: 3–60}` | creates a room, you are host |
| GET | `/competitions` | | your recent rooms |
| POST | `/competitions/join` | `{code}` | case-insensitive |
| GET | `/competitions/{id}` | | full state (members only) |
| POST | `/competitions/{id}/ready` | `{ready}` | lobby only |
| POST | `/competitions/{id}/start` | | host only; needs enough players, all ready |
| POST | `/competitions/{id}/leave` | | |
| POST | `/competitions/{id}/cancel` | | host only, lobby only |
| POST | `/competitions/{id}/submissions` | `{code}` | 202; verdict arrives by socket |
| GET | `/competitions/{id}/results` | | after the room ends |

## Socket.IO events

Connect to `/socket.io` with the session cookie. Unauthenticated connections are refused.

**Client → server** (all return an acknowledgement `{ok, error?, state?}`)

| Event | Payload |
|---|---|
| `room:join` | `{competition_id}`; joins the live channel and returns the state |
| `room:leave` | `{competition_id}`; leaves the competition |
| `player:ready` | `{competition_id, ready}` |

**Server → client** (sent to everyone in the room)

| Event | Payload |
|---|---|
| `room:state` | full competition state (same as `GET /competitions/{id}`) |
| `room:participants` | `{competition_id, participants}` |
| `competition:countdown` | `{competition_id, starts_at, ends_at, server_time}` |
| `competition:started` | `{competition_id, starts_at, ends_at, question}` |
| `submission:received` | `{competition_id, submission_id, user_id, username}` |
| `submission:result` | `{competition_id, submission_id, user_id, username, status, passed_count, total_count}` |
| `competition:winner` | `{competition_id, winner}` |
| `competition:finished` | `{competition_id, reason: solved\|time_up\|host_cancelled\|everyone_left\|idle}` |
| `player:disconnected` | `{competition_id, user_id}` |
| `room:error` | `{message}` (to one socket) |
