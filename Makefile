# PyArena developer commands (macOS, Linux, WSL). On Windows PowerShell use
# scripts/setup.ps1 and scripts/dev.ps1, or run these inside WSL.
#   make help

SHELL := /bin/bash
.DEFAULT_GOAL := help

BACKEND_PY := backend/.venv/bin/python
WORKER_PY  := judge-worker/.venv/bin/python
NPM        := npm --prefix frontend

.PHONY: help setup dev services test test-backend test-worker test-frontend test-integration e2e \
        lint format typecheck migrate seed contract stickers precommit audit docker-up docker-down

help: ## Show this list
	@grep -hE '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

setup: ## Create both virtual environments, install the frontend, write .env files
	bash scripts/setup.sh

services: ## Start PostgreSQL, Redis and the judge worker in Docker
	docker compose -f docker-compose.dev.yml up -d

dev: ## Run the API and the frontend dev server (needs `make services`)
	bash scripts/dev.sh

migrate: ## Apply database migrations
	cd backend && .venv/bin/alembic upgrade head

seed: ## Load the question bank (idempotent)
	cd backend && .venv/bin/python -m app.seed

test: test-backend test-worker test-frontend ## Unit tests for everything (no services needed)

test-backend: ## Backend tests on SQLite with the real sandbox
	cd backend && .venv/bin/python -m pytest -q

test-worker: ## Judge worker tests (run as root for the isolation tests)
	cd judge-worker && .venv/bin/python -m pytest -q -rs

test-frontend: ## Frontend unit tests
	$(NPM) test

test-integration: ## Backend tests on PostgreSQL + Redis (uses `make services` defaults)
	cd backend && TEST_DATABASE_URL=$${TEST_DATABASE_URL:-postgresql+asyncpg://pyarena:pyarena@localhost:5432/pyarena_test} \
	  REDIS_TEST_URL=$${REDIS_TEST_URL:-redis://localhost:6379/15} .venv/bin/python -m pytest -q -rs

e2e: ## Playwright: functional, accessibility and visual specs (needs `make dev` running)
	$(NPM) run test:e2e

lint: ## Ruff and ESLint
	cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check .
	cd judge-worker && .venv/bin/ruff check . && .venv/bin/ruff format --check .
	$(NPM) run lint

format: ## Apply Ruff formatting and fixes
	cd backend && .venv/bin/ruff check --fix . && .venv/bin/ruff format .
	cd judge-worker && .venv/bin/ruff check --fix . && .venv/bin/ruff format .

typecheck: ## mypy and tsc (tsc includes the API contract test)
	cd backend && .venv/bin/mypy app
	$(NPM) run typecheck

contract: ## Regenerate frontend/openapi.json and src/types/openapi.d.ts after API changes
	cd backend && .venv/bin/python -m app.export_openapi
	$(NPM) run api:types
	$(NPM) run typecheck

stickers: ## Rebuild the Deb mascot stickers (SVG); add PNGS=dir for 1024px PNGs
	cd frontend && node scripts/build-stickers.mjs $(if $(PNGS),--png $(PNGS),)

precommit: ## Run every pre-commit hook on all files
	pre-commit run --all-files

audit: ## Dependency audits (pip-audit must be installed: pip install pip-audit)
	$(BACKEND_PY) -m pip freeze --exclude-editable > /tmp/pyarena-backend-requirements.txt
	pip-audit -r /tmp/pyarena-backend-requirements.txt
	pip-audit -r judge-worker/requirements-dev.txt
	$(NPM) audit --audit-level=high

docker-up: ## Build and run the full production-like stack on http://localhost:8080
	docker compose up -d --build

docker-down: ## Stop the full stack
	docker compose down
