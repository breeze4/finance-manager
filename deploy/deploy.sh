#!/usr/bin/env bash
# Deploy finance-analyzer to a remote host from the dev machine.
# Usage: DEPLOY_HOST=your-server ./deploy/deploy.sh
# Or export DEPLOY_HOST in your shell. Defaults to "finance-host".
#
# Pipeline: lint -> tests -> build -> sync -> install -> migrate -> restart -> verify.
# Any failing step aborts the deploy (`set -e`).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Load .env (gitignored) for DEPLOY_HOST and other secrets, if present.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

HOST="${DEPLOY_HOST:-finance-host}"
APP_DIR=dev/finance-analyzer
PORT=8003

echo "==> [1/8] Backend: ruff lint"
(cd backend && uv run ruff check . && uv run ruff format --check .)

echo "==> [2/8] Backend: pytest"
(cd backend && uv run pytest -q)

echo "==> [3/8] Frontend: typecheck + build"
(cd frontend && npm run build)

echo "==> [4/8] Frontend: vitest"
(cd frontend && npm test -- --run)

echo "==> [5/8] Sync code to $HOST:~/$APP_DIR"
# data/ and input/ are intentionally excluded so the server's DB is canonical
# and sensitive CSVs never leave the dev machine.
rsync -az --delete \
  --exclude='node_modules' \
  --exclude='.venv' \
  --exclude='venv' \
  --exclude='__pycache__' \
  --exclude='.pytest_cache' \
  --exclude='.ruff_cache' \
  --exclude='.git' \
  --exclude='data' \
  --exclude='input' \
  --exclude='*.db' \
  --exclude='*.db.*' \
  --exclude='*.tsbuildinfo' \
  "$PROJECT_DIR/" "$HOST:$APP_DIR/"

echo "==> [6/8] Install Python deps on server"
ssh "$HOST" "cd ~/$APP_DIR/backend && venv/bin/pip install -q --upgrade pip && venv/bin/pip install -q -e ."

echo "==> [7/8] Run alembic migrations"
ssh "$HOST" "cd ~/$APP_DIR/backend && venv/bin/alembic upgrade head"

echo "==> [8/8] Install/refresh systemd units, restart service, ensure backup timer"
ssh "$HOST" "
  set -e
  mkdir -p ~/.config/systemd/user ~/backups/finance
  cp ~/$APP_DIR/deploy/finance-analyzer.service          ~/.config/systemd/user/
  cp ~/$APP_DIR/deploy/finance-analyzer-backup.service   ~/.config/systemd/user/
  cp ~/$APP_DIR/deploy/finance-analyzer-backup.timer     ~/.config/systemd/user/
  chmod +x ~/$APP_DIR/deploy/backup-finance-db.sh
  systemctl --user daemon-reload
  systemctl --user enable finance-analyzer >/dev/null 2>&1 || true
  systemctl --user enable --now finance-analyzer-backup.timer >/dev/null 2>&1 || true
  systemctl --user restart finance-analyzer
"

# Give the service a moment, then verify it answered an HTTP request.
# Match the JSON body (not just status) — neighbouring services on this host
# have SPA catch-alls that return 200 + HTML for unknown paths.
sleep 2
echo "==> Health check"
HEALTH=$(ssh "$HOST" "curl -fsS http://127.0.0.1:$PORT/finance/api/health" || echo "")
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  echo "$HEALTH"
  echo "==> Deploy OK. http://$HOST:$PORT/finance/"
else
  echo "!! Health check failed. Got: ${HEALTH:-<empty>}"
  echo "!! Last service logs:"
  ssh "$HOST" "journalctl --user -u finance-analyzer -n 50 --no-pager" || true
  exit 1
fi
