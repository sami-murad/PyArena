#!/bin/sh
# Apply migrations, load the question bank (idempotent), then serve the API.
set -e
alembic upgrade head
python -m app.seed
# One process per container; run more containers to scale (shared state lives
# in Redis, see docs/ARCHITECTURE.md, "Scaling"). On SIGTERM uvicorn stops
# accepting connections and gives in-flight requests (judging can take ~20 s)
# up to 25 s to finish; compose allows 30 s before SIGKILL.
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips="*" \
  --timeout-graceful-shutdown 25
