#!/usr/bin/env bash
# One-time local setup for macOS, Linux and WSL.
#   - creates the Python virtual environments (backend/.venv, judge-worker/.venv)
#   - installs frontend packages
#   - creates .env files with freshly generated secrets (never overwrites existing ones)
#
# Usage (from the repository root):  bash scripts/setup.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

say() { printf '\n\033[1;33m==>\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

PYTHON="${PYTHON:-python3}"
command -v "$PYTHON" >/dev/null || fail "Python 3.12+ is required (https://www.python.org/downloads/)."
"$PYTHON" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)' \
  || fail "Python 3.12 or newer is required; found $("$PYTHON" --version)."
command -v node >/dev/null || fail "Node.js 20+ is required (https://nodejs.org/)."
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)' \
  || fail "Node.js 20 or newer is required; found $(node --version)."

secret() { "$PYTHON" -c "import secrets; print(secrets.token_urlsafe($1))"; }

say "Backend virtual environment (backend/.venv)"
"$PYTHON" -m venv backend/.venv
backend/.venv/bin/python -m pip install --upgrade pip --quiet
backend/.venv/bin/pip install -e "backend[dev]" --quiet

say "Judge worker virtual environment (judge-worker/.venv)"
"$PYTHON" -m venv judge-worker/.venv
judge-worker/.venv/bin/python -m pip install --upgrade pip --quiet
judge-worker/.venv/bin/pip install -r judge-worker/requirements-dev.txt --quiet

say "Frontend packages (frontend/node_modules)"
(cd frontend && npm ci --no-fund --no-audit)

say "Environment files"
if [ ! -f backend/.env ]; then
  sed "s|^SECRET_KEY=.*|SECRET_KEY=$(secret 48)|" backend/.env.example > backend/.env
  echo "  created backend/.env"
else
  echo "  backend/.env already exists, left unchanged"
fi
if [ ! -f .env ]; then
  sed -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(secret 24)|" \
      -e "s|^SECRET_KEY=.*|SECRET_KEY=$(secret 48)|" \
      -e "s|^WORKER_TOKEN=.*|WORKER_TOKEN=$(secret 32)|" .env.example > .env
  echo "  created .env (used by docker compose)"
else
  echo "  .env already exists, left unchanged"
fi

cat <<'EOF'

Setup complete. Next steps:

  1. Start PostgreSQL and the judge worker (needs Docker):
       docker compose -f docker-compose.dev.yml up -d
     No Docker? See docs/DEVELOPMENT.md for running them without it.

  2. Create the tables and load the questions:
       cd backend && .venv/bin/alembic upgrade head && .venv/bin/python -m app.seed && cd ..

  3. Run everything:
       bash scripts/dev.sh
     then open http://localhost:5173
EOF
