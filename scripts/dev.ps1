# Starts the backend and frontend dev servers in separate windows (Windows).
# Expects PostgreSQL and the judge worker to be running:
#   docker compose -f docker-compose.dev.yml up -d
# Pass -StartWorker to run the judge worker locally without Docker. On Windows
# that mode only enforces time and output limits: use it for trying things out,
# never for code you do not trust.
param([switch]$StartWorker)

$Root = Split-Path -Parent $PSScriptRoot

if ($StartWorker) {
  Start-Process powershell -ArgumentList "-NoExit", "-Command", @"
cd '$Root\judge-worker'; `$env:WORKER_TOKEN='dev-only-worker-token'; .\.venv\Scripts\uvicorn.exe runner:app --host 127.0.0.1 --port 8001
"@
}

Start-Process powershell -ArgumentList "-NoExit", "-Command", @"
cd '$Root\backend'; .\.venv\Scripts\alembic.exe upgrade head; .\.venv\Scripts\python.exe -m app.seed; .\.venv\Scripts\uvicorn.exe app.main:app --reload --host 127.0.0.1 --port 8000
"@

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\frontend'; npm run dev"

Write-Host "PyArena: http://localhost:5173  (API docs: http://localhost:8000/api/docs)"
