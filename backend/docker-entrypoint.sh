#!/bin/sh
# Apply migrations, load the question bank (idempotent), then serve the API.
set -e
alembic upgrade head
python -m app.seed
# One worker process: rate limits, presence and judge queues live in memory
# (see docs/ARCHITECTURE.md, "Scaling").
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips="*"
