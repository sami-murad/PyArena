# Development guide

## Prerequisites (all free)

| Tool | Version | Why |
|---|---|---|
| Python | 3.12+ | backend, worker, tests |
| Node.js + npm | 20+ (22 LTS recommended) | frontend |
| Docker Desktop / Docker Engine | recent | PostgreSQL, Redis and the sandboxed worker |
| make, pre-commit | optional | shortcuts (`make help`) and commit hooks |
| Git, VS Code | any | |

On Windows, Docker Desktop with the WSL2 backend is recommended. You can either use the PowerShell scripts, or work inside WSL (Ubuntu) with the bash scripts; inside WSL keep the project under `~/`, not `/mnt/c`, for speed.

## First-time setup

`scripts/setup.sh` (bash) or `scripts/setup.ps1` (PowerShell):

1. checks Python and Node versions,
2. creates `backend/.venv` and installs `backend[dev]` (pinned versions),
3. creates `judge-worker/.venv` and installs its requirements,
4. runs `npm ci` in `frontend/`,
5. creates `backend/.env` and `.env` from the examples with random secrets (existing files are never overwritten).

Manual equivalent:

```bash
python3 -m venv backend/.venv && backend/.venv/bin/pip install -e "backend[dev]"
python3 -m venv judge-worker/.venv && judge-worker/.venv/bin/pip install -r judge-worker/requirements-dev.txt
cd frontend && npm ci
cp backend/.env.example backend/.env   # then set SECRET_KEY
```

Activate a venv when you want its tools on your PATH: `source backend/.venv/bin/activate` (Windows: `backend\.venv\Scripts\Activate.ps1`).

## Everyday commands (Makefile)

On macOS, Linux and WSL, `make help` lists everything. The common ones:

| Command | Does |
|---|---|
| `make setup` | virtual environments, `npm ci`, `.env` files |
| `make services` | PostgreSQL, Redis and the worker in Docker |
| `make migrate` / `make seed` | apply migrations / load the question bank |
| `make dev` | API on :8000 and frontend on :5173 |
| `make test` | backend, worker and frontend unit tests |
| `make test-integration` | backend suite on PostgreSQL + Redis |
| `make e2e` | Playwright (functional, accessibility, visual); needs `make dev` running |
| `make lint` / `make format` / `make typecheck` | Ruff + ESLint / Ruff fixes / mypy + tsc |
| `make contract` | regenerate the OpenAPI schema and TypeScript types after an API change |
| `make stickers` | rebuild the Deb mascot stickers (`PNGS=out` adds 1024 px PNGs) |
| `make precommit` / `make audit` | all pre-commit hooks / dependency audits |

On Windows PowerShell, use the scripts in `scripts/` or run `make` inside WSL.

## Pre-commit hooks

```bash
pip install pre-commit        # once, in any Python environment
pre-commit install            # runs the hooks on every commit
pre-commit run --all-files    # or: make precommit
```

The hooks (`.pre-commit-config.yaml`, pinned to commit SHAs) fix trailing whitespace and line endings, validate YAML/TOML/JSON, block large files and private keys, run Ruff (check and format) on Python, gitleaks on staged changes, and ESLint and `tsc` on frontend changes. The gitleaks hook is built with Go the first time it runs (recent pre-commit versions fetch a Go toolchain when none is installed). If that does not work on your machine, skip just that hook with `SKIP=gitleaks git commit ...`; CI scans every push with gitleaks anyway.

## Running locally

```bash
docker compose -f docker-compose.dev.yml up -d       # PostgreSQL :5432, Redis :6379, worker :8001
cd backend && .venv/bin/alembic upgrade head && .venv/bin/python -m app.seed && cd ..
bash scripts/dev.sh                                  # backend :8000 + frontend :5173
```

Open http://localhost:5173. The Vite dev server proxies `/api` and `/socket.io` to the backend, so the browser sees one origin and cookies just work.

### Without Docker

- **Database:** install PostgreSQL and create a `pyarena` user and database, or use SQLite by setting `DATABASE_URL=sqlite+aiosqlite:///./pyarena-dev.db` in `backend/.env`.
- **Worker:** `START_WORKER=1 bash scripts/dev.sh` (or `scripts\dev.ps1 -StartWorker`). On Linux/macOS this applies resource limits; on Windows only time and output limits. Do not run untrusted code this way.

## Smoke tests for code execution

Four tests in `judge-worker/tests/test_smoke.py` check the whole execution path: print, input round trip, function harness, and a surfaced syntax error. Run them in-process, and against the Docker worker:

```bash
cd judge-worker
.venv/bin/python -m pytest tests/test_smoke.py                       # local sandbox (http variants skipped)
docker compose -f ../docker-compose.dev.yml up -d --build worker
WORKER_SMOKE_URL=http://127.0.0.1:8001 WORKER_SMOKE_TOKEN=dev-only-worker-token \
  .venv/bin/python -m pytest tests/test_smoke.py -v                    # local + Docker: 8 passed
curl -s -H "X-Worker-Token: dev-only-worker-token" http://127.0.0.1:8001/_diag
```

On Windows PowerShell set the variables first: `$env:WORKER_SMOKE_URL="http://127.0.0.1:8001"; $env:WORKER_SMOKE_TOKEN="dev-only-worker-token"`, then run `.venv\Scripts\python.exe -m pytest tests\test_smoke.py -v`.

`/_diag` (development only, needs the token) reports the Python version, sandbox mode (`uid-isolated` in Docker), cgroup version and limits, and runs a tiny self-test.

## Tests and quality checks

```bash
# Judge worker
cd judge-worker && .venv/bin/python -m pytest && .venv/bin/ruff check .

# Backend (SQLite by default)
cd backend && .venv/bin/python -m pytest
.venv/bin/ruff check . && .venv/bin/ruff format --check . && .venv/bin/mypy app
# Same suite on PostgreSQL:
TEST_DATABASE_URL=postgresql+asyncpg://pyarena:pyarena@localhost:5432/pyarena_test .venv/bin/python -m pytest

# Frontend
cd frontend && npm run typecheck && npm run lint && npm test && npm run build

# End to end (stack running on :5173)
cd frontend && npx playwright install chromium && npm run test:e2e
```

The Playwright suite (`frontend/e2e/`) covers:

| Spec | Checks |
|---|---|
| `pyarena.spec.ts` | the playground runs real Python; two players race and the server picks one winner |
| `mascot.spec.ts` | Deb reacts to runs; mute and mascot visibility persist; no AudioContext before a gesture; reduced motion |
| `scroll.spec.ts` | smooth scrolling on marketing pages only; inner scrollers keep the wheel; fonts load |
| `focus.spec.ts` | Focus Mode notice, 2 s grace, warnings, the opponent's "left tab" marker |
| `a11y.spec.ts` | axe-core WCAG 2.1 A/AA rules on six public pages, in both themes |
| `visual.spec.ts` | screenshots of four key pages in both themes against baselines |

### Visual baselines

Baselines live in `frontend/e2e/visual.spec.ts-snapshots/` and depend on the browser build and the OS fonts that drew them (file names end in `-linux`). After an intentional UI change, run `npm run test:visual:update` and review the new images in your pull request. CI runs the visual spec as advisory until the baselines come from CI itself: start the workflow by hand with **Update visual baselines** ticked, download the `visual-baselines` artifact, and commit it.

## Contract testing (backend ↔ frontend)

The frontend's API types (`src/types/api.ts`) are written by hand for readability. To make sure they match the backend:

1. `python -m app.export_openapi` (in `backend/`) writes the OpenAPI schema to `frontend/openapi.json`.
2. `npm run api:types` turns it into `frontend/src/types/openapi.d.ts` with openapi-typescript. The generator lives in `frontend/tools/openapi/` with its own lockfile because it needs TypeScript 5, while the app uses TypeScript 6.
3. `frontend/tests/contract.test.ts` compares 19 response types at the type level (same fields, compatible types), so `npm run typecheck` fails on a mismatch.

After changing an endpoint or schema, run `make contract` and commit `frontend/openapi.json` and `frontend/src/types/openapi.d.ts`. CI regenerates both and fails if they differ from what is committed.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request:

| Job | What |
|---|---|
| backend | Ruff, Ruff format, mypy, pytest on SQLite |
| backend-integration | pytest on PostgreSQL 16 + Redis 7 (migrations both ways on both databases, two API replicas) |
| worker | Ruff, sandbox tests unprivileged and as root (UID isolation, seccomp), a bounded Atheris fuzz run |
| frontend | tsc (with the contract test), ESLint, Vitest, production build |
| contract | regenerated OpenAPI schema and TS types match the committed ones |
| e2e | the full stack (worker as root), Playwright including axe; visual regression advisory |
| docker | builds the three images and scans each with Trivy; pushes to GHCR when `PUBLISH_IMAGES=true` on `main` |
| security | gitleaks over the whole history, pip-audit, npm audit, Trivy (dependencies, Dockerfiles, secrets) |

Every third-party action is pinned to a full commit SHA. When updating, prefer releases that have been out for a while, and check advisories: in March 2026 most `aquasecurity/trivy-action` tags were replaced with a credential stealer (GHSA-69fq-xp46-6x23), which is why the workflow uses trivy-action ≥ v0.35.0 with Trivy v0.69.3.

The worker's isolation tests only run when the worker runs as root (as in Docker); otherwise they are skipped.

Each end-to-end run creates new accounts, and sign-ups are limited to `RATE_REGISTER_PER_HOUR` (20) per IP. With `REDIS_URL` set, that counter is kept in Redis and survives backend restarts, so after several runs sign-up answers "Too many requests". For local testing set `RATE_LIMIT_ENABLED=false`, or clear the counter: `redis-cli DEL pyarena:rl:register:ip:127.0.0.1`.

Redis-dependent backend tests use `fakeredis` by default. Point them at a real Redis to also run the real-server variants and the two-replica match:

```bash
docker compose -f docker-compose.dev.yml up -d redis
REDIS_TEST_URL=redis://127.0.0.1:6379/15 .venv/bin/python -m pytest
```

`REDIS_TEST_URL` databases are flushed by the tests; never point it at data you need.

The backend tests execute code through the real worker sandbox (imported from `judge-worker/`), so they need no running services. `tests/test_socket.py` starts a real uvicorn server on a free port and connects two Socket.IO clients.

## Adding a question

1. Add an entry to `QUESTIONS` in `database/seeds/build_questions.py` with a reference solution and tests (mark 1–2 as `"public": True`).
2. `python database/seeds/build_questions.py` regenerates `questions.json` with computed expected outputs.
3. `cd backend && .venv/bin/python -m app.seed`.
4. `.venv/bin/python -m pytest tests/test_questions.py` checks every reference solution is accepted.

## Changing the database schema

Edit the models in `backend/app/models/`, then `alembic revision --autogenerate -m "describe change"`, review the generated file, and `alembic upgrade head`. Keep migrations portable (use `op.batch_alter_table` and `sa.false()`-style defaults), run `pytest tests/test_migrations.py` (it also runs `alembic check`), add the table to `docs/DATABASE.md`, and run `make contract` if responses changed. See ADR 0007.

## Useful settings for development

In `backend/.env`: `COMPETITION_MIN_PLAYERS=1` (play alone), `COMPETITION_COUNTDOWN_SECONDS=3`, `SUBMISSION_COOLDOWN_SECONDS=0`, `RATE_LIMIT_ENABLED=false`. To try Focus Mode quickly: `FOCUS_GRACE_MS=500`, `FOCUS_WARN_LIMIT=1`, `FOCUS_PAUSE_SECONDS=10`.
