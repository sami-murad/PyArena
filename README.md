# PyArena

**Code. Compete. Improve.** PyArena is a Python playground that runs code in a sandbox, plus private rooms where friends get the same problem at the same moment and the first correct solution wins.

Built with React, TypeScript, Vite and Monaco on the front end, and FastAPI, SQLAlchemy, PostgreSQL, Redis and Socket.IO on the back end. User code runs in a separate judge worker, never in the web server.

## Features

**Playground**
- Monaco editor with Python highlighting, `Ctrl/Cmd + Enter` to run
- Standard input panel, output console, run time and status
- Syntax errors, runtime exceptions, time limits, memory limits and output limits, each shown clearly
- The original traceback plus a plain-language explanation of common errors (deterministic, no AI service)
- The failing line is highlighted in the editor
- Copy, download as `.py`, reset, clear; drafts survive a page reload
- Save, reopen, rename and delete snippets when signed in

**Question bank and judging**
- 11 original problems (easy, medium, hard), both function-based and stdin/stdout
- Hidden tests that never leave the server; example tests with full feedback
- Strict comparison (booleans never equal numbers, small float tolerance, trailing whitespace ignored)

**Live competitions**
- Private rooms with unguessable 8-character codes and invite links
- Lobby with ready states and online presence, host transfer when the host leaves
- Server-controlled countdown; the question is revealed to everyone at the same instant
- Race lanes showing every player's attempts live
- Judging in server-receipt order and an atomic database update that records exactly one winner
- Results page with standings, every submission, and the solution explanation
- Optional **Focus Mode** per room: players accept a clear notice, tab switches under 2 seconds never count, and warnings come before any pause, freeze or disqualification, all enforced on the server

**Deb, the mascot**: an original character (28 stickers, drawn as code) who reacts to your runs and matches with seven moods, a speech bubble and a status badge, plus optional synthesised sounds. Mute and hide toggles are in the header; reduced-motion settings are respected.

**Accounts**: Argon2id password hashing, httpOnly session cookies, profile statistics.

**Operations**: versioned API (`/api/v1`), JSON logs with request ids, Prometheus metrics at `/metrics`, liveness and readiness checks, `Idempotency-Key` support on run and submit, and several API processes sharing state through Redis.

**Quality**: GitHub Actions CI (lint, types, unit and integration tests, migrations on PostgreSQL and SQLite, OpenAPI contract check, Playwright with accessibility and visual checks, Docker image scans, gitleaks, pip-audit, npm audit, Trivy), pre-commit hooks and a Makefile.

## Quick start

You need **Python 3.12+**, **Node.js 20+** and **Docker** (Docker Desktop on Windows/macOS).

```bash
# macOS / Linux / WSL
bash scripts/setup.sh
docker compose -f docker-compose.dev.yml up -d
cd backend && .venv/bin/alembic upgrade head && .venv/bin/python -m app.seed && cd ..
bash scripts/dev.sh
```

```powershell
# Windows PowerShell
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
docker compose -f docker-compose.dev.yml up -d
cd backend; .\.venv\Scripts\alembic.exe upgrade head; .\.venv\Scripts\python.exe -m app.seed; cd ..
powershell -ExecutionPolicy Bypass -File scripts\dev.ps1
```

Open http://localhost:5173. API docs are at http://localhost:8000/api/v1/docs. Readiness: http://localhost:8000/api/v1/health/ready. The dev compose file also starts Redis on `127.0.0.1:6379`; set `REDIS_URL=redis://localhost:6379/0` in `backend/.env` to use it (optional in development).

**Everything in Docker instead:** `docker compose up --build`, then open http://localhost:8080. The setup script already created `.env` with random secrets.

To try a competition alone, set `COMPETITION_MIN_PLAYERS=1` in `backend/.env`, or open a second browser profile (or a private window) and sign in as another user.

With `make` (macOS, Linux, WSL): `make setup`, `make services`, `make migrate seed`, `make dev`. `make help` lists the rest.

## Why the virtual environments are not in the repository

A virtual environment contains absolute paths and compiled packages for the machine that created it, so it cannot be copied between computers. The setup scripts create `backend/.venv` and `judge-worker/.venv` on your machine with the exact pinned versions from `backend/pyproject.toml` and `judge-worker/requirements.txt`.

## Project structure

```
pyarena/
├── frontend/          React + TypeScript + Vite app
│   └── src/
│       ├── config/    websitesInfo.ts (site identity), appConfig, navigation, socialLinks, features
│       ├── styles/    tokens.css, themes/_dark.scss, themes/_light.scss, base, components, layouts
│       ├── features/  playground, questions, competitions, focus, mascot, sound, reactions,
│       │              scroll, auth, snippets, profile, home, about
│       ├── components/ ui, layout, feedback, editor
│       ├── services/  apiClient.ts, socketClient.ts
│       └── types/     api.ts (hand-written), openapi.d.ts (generated, contract-tested)
│   ├── public/stickers/deb/   the 28 Deb stickers (built by scripts/build-stickers.mjs)
│   ├── e2e/           Playwright specs (functional, accessibility, visual)
│   └── tools/openapi/ isolated OpenAPI → TypeScript generator
├── backend/           FastAPI API, Socket.IO server, SQLAlchemy models, Alembic migrations
├── judge-worker/      Isolated code execution service
├── database/seeds/    Question bank (generated by build_questions.py)
├── docs/              Architecture, API, database, security, development, deployment, ADRs
├── scripts/           setup and dev scripts for macOS/Linux and Windows
├── .github/workflows/ CI pipeline
├── Makefile           developer shortcuts (make help)
└── .pre-commit-config.yaml
```

## Changing the name, logo or colours

- Name, tagline, contact email, logo path: `frontend/src/config/websitesInfo.ts`. Header, footer, page titles, auth pages and the HTML metadata all read from it.
- Colours: `frontend/src/styles/themes/_dark.scss` and `_light.scss`. Spacing, type and radii: `frontend/src/styles/tokens.css`. See [docs/DESIGN_TOKENS.md](docs/DESIGN_TOKENS.md).
- The contact address is a placeholder (`REPLACE_WITH_VERIFIED_CONTACT_EMAIL`) and is hidden until you replace it.

## Tests

```bash
cd judge-worker && .venv/bin/python -m pytest      # sandbox: limits, isolation, harness
cd backend && .venv/bin/python -m pytest            # API, judging, competitions, Socket.IO
cd frontend && npm test                             # components, config, client logic
cd frontend && npm run test:e2e                     # Playwright, needs the stack running
make contract                                       # after API changes: regenerate the typed contract
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for linting, type checking, PostgreSQL, visual baselines, pre-commit and CI.

## Documentation

- [Architecture](docs/ARCHITECTURE.md): components, trust boundaries, competition state machine, fairness rule
- [API](docs/API.md): REST endpoints and Socket.IO events
- [Database](docs/DATABASE.md): tables, constraints, migrations
- [Security](docs/SECURITY.md): what is protected, what is not, what was tested
- [Development](docs/DEVELOPMENT.md): setup, running without Docker, testing
- [Deployment](docs/DEPLOYMENT.md): running on a server
- [Design tokens](docs/DESIGN_TOKENS.md): colour and theme strategy
- [Observability](docs/observability/README.md): metrics, Prometheus and the Grafana dashboard
- [Decision records](docs/adr/): custom judge worker, Redis, `/api/v1`, sandbox layers, Argon2id, Focus Mode, PostgreSQL with SQLite fallback

## License

Add a license of your choice (for example MIT) before publishing.
