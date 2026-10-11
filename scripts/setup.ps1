# One-time local setup for Windows (PowerShell).
#   - creates the Python virtual environments (backend\.venv, judge-worker\.venv)
#   - installs frontend packages
#   - creates .env files with freshly generated secrets (never overwrites existing ones)
#
# Usage (from the repository root):
#   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Say($msg) { Write-Host "`n==> $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "Error: $msg" -ForegroundColor Red; exit 1 }

$Python = if ($env:PYTHON) { $env:PYTHON } elseif (Get-Command py -ErrorAction SilentlyContinue) { "py" } else { "python" }
if (-not (Get-Command $Python -ErrorAction SilentlyContinue)) { Fail "Python 3.12+ is required (https://www.python.org/downloads/)." }
& $Python -c "import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)"
if ($LASTEXITCODE -ne 0) { Fail "Python 3.12 or newer is required." }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "Node.js 20+ is required (https://nodejs.org/)." }

function New-Secret([int]$n) { & $Python -c "import secrets; print(secrets.token_urlsafe($n))" }

Say "Backend virtual environment (backend\.venv)"
& $Python -m venv backend\.venv
& backend\.venv\Scripts\python.exe -m pip install --upgrade pip --quiet
& backend\.venv\Scripts\pip.exe install -e "backend[dev]" --quiet

Say "Judge worker virtual environment (judge-worker\.venv)"
& $Python -m venv judge-worker\.venv
& judge-worker\.venv\Scripts\python.exe -m pip install --upgrade pip --quiet
& judge-worker\.venv\Scripts\pip.exe install -r judge-worker\requirements-dev.txt --quiet

Say "Frontend packages (frontend\node_modules)"
Push-Location frontend
npm ci --no-fund --no-audit
Pop-Location

Say "Environment files"
if (-not (Test-Path backend\.env)) {
  (Get-Content backend\.env.example) -replace '^SECRET_KEY=.*', "SECRET_KEY=$(New-Secret 48)" |
    Set-Content -Encoding utf8 backend\.env
  Write-Host "  created backend\.env"
} else { Write-Host "  backend\.env already exists, left unchanged" }

if (-not (Test-Path .env)) {
  (Get-Content .env.example) `
    -replace '^POSTGRES_PASSWORD=.*', "POSTGRES_PASSWORD=$(New-Secret 24)" `
    -replace '^SECRET_KEY=.*', "SECRET_KEY=$(New-Secret 48)" `
    -replace '^WORKER_TOKEN=.*', "WORKER_TOKEN=$(New-Secret 32)" |
    Set-Content -Encoding utf8 .env
  Write-Host "  created .env (used by docker compose)"
} else { Write-Host "  .env already exists, left unchanged" }

Write-Host @"

Setup complete. Next steps:

  1. Start PostgreSQL and the judge worker (Docker Desktop must be running):
       docker compose -f docker-compose.dev.yml up -d

  2. Create the tables and load the questions:
       cd backend; .\.venv\Scripts\alembic.exe upgrade head; .\.venv\Scripts\python.exe -m app.seed; cd ..

  3. Run everything (opens two windows):
       powershell -ExecutionPolicy Bypass -File scripts\dev.ps1
     then open http://localhost:5173
"@
