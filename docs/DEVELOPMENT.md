# Development guide

## Prerequisites (all free)

| Tool | Version | Why |
|---|---|---|
| Python | 3.12+ | backend, worker, tests |
| Node.js + npm | 20+ (22 LTS recommended) | frontend |
| Docker Desktop / Docker Engine | recent | PostgreSQL and the sandboxed worker |
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

## Running locally

```bash
docker compose -f docker-compose.dev.yml up -d       # PostgreSQL :5432 + worker :8001
cd backend && .venv/bin/alembic upgrade head && .venv/bin/python -m app.seed && cd ..
bash scripts/dev.sh                                  # backend :8000 + frontend :5173
```

Open http://localhost:5173. The Vite dev server proxies `/api` and `/socket.io` to the backend, so the browser sees one origin and cookies just work.

### Without Docker

- **Database:** install PostgreSQL and create a `pyarena` user and database, or use SQLite by setting `DATABASE_URL=sqlite+aiosqlite:///./pyarena-dev.db` in `backend/.env`.
- **Worker:** `START_WORKER=1 bash scripts/dev.sh` (or `scripts\dev.ps1 -StartWorker`). On Linux/macOS this applies resource limits; on Windows only time and output limits. Do not run untrusted code this way.

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

The worker's isolation tests only run when the worker runs as root (as in Docker); otherwise they are skipped.

The backend tests execute code through the real worker sandbox (imported from `judge-worker/`), so they need no running services. `tests/test_socket.py` starts a real uvicorn server on a free port and connects two Socket.IO clients.

## Adding a question

1. Add an entry to `QUESTIONS` in `database/seeds/build_questions.py` with a reference solution and tests (mark 1–2 as `"public": True`).
2. `python database/seeds/build_questions.py` regenerates `questions.json` with computed expected outputs.
3. `cd backend && .venv/bin/python -m app.seed`.
4. `.venv/bin/python -m pytest tests/test_questions.py` checks every reference solution is accepted.

## Changing the database schema

Edit the models in `backend/app/models/`, then `alembic revision --autogenerate -m "describe change"`, review the generated file, and `alembic upgrade head`.

## Useful settings for development

In `backend/.env`: `COMPETITION_MIN_PLAYERS=1` (play alone), `COMPETITION_COUNTDOWN_SECONDS=3`, `SUBMISSION_COOLDOWN_SECONDS=0`, `RATE_LIMIT_ENABLED=false`.
