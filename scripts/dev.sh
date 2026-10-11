#!/usr/bin/env bash
# Runs the backend and frontend dev servers together (Ctrl+C stops both).
# Expects PostgreSQL and the judge worker to be running already
# (docker compose -f docker-compose.dev.yml up -d), or set START_WORKER=1 to
# run the worker locally without Docker (development only, weaker isolation).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
pids=()
cleanup() { kill "${pids[@]}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

if [ "${START_WORKER:-0}" = "1" ]; then
  (cd "$ROOT/judge-worker" && WORKER_TOKEN="${WORKER_TOKEN:-dev-only-worker-token}" \
    .venv/bin/uvicorn runner:app --host 127.0.0.1 --port 8001) &
  pids+=($!)
fi

(cd "$ROOT/backend" && .venv/bin/alembic upgrade head && .venv/bin/python -m app.seed \
  && .venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000) &
pids+=($!)

(cd "$ROOT/frontend" && npm run dev) &
pids+=($!)

echo "PyArena: http://localhost:5173  (API docs: http://localhost:8000/api/docs)"
wait
