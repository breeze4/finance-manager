#!/usr/bin/env bash
# One-time setup on finance-host. Run from the dev machine:
#   ssh finance-host 'bash -s' < deploy/setup.sh
#
# After this completes, copy the local DB up once and then run deploy.sh:
#   scp data/finance.db finance-host:~/dev/finance-analyzer/data/finance.db
#   ./deploy/deploy.sh
set -euo pipefail

APP_DIR=~/dev/finance-analyzer

echo "==> Creating app + data directories"
mkdir -p "$APP_DIR/data"
mkdir -p "$APP_DIR/backend"

echo "==> Verifying Python version (need 3.11+)"
PY=$(command -v python3.12 || command -v python3.11 || command -v python3)
"$PY" - <<'PY'
import sys
v = sys.version_info
if (v.major, v.minor) < (3, 11):
    raise SystemExit(f"Python 3.11+ required, got {v.major}.{v.minor}")
print(f"OK: {sys.version.split()[0]} at {sys.executable}")
PY

echo "==> Creating Python venv at $APP_DIR/backend/venv"
if [ ! -d "$APP_DIR/backend/venv" ]; then
  "$PY" -m venv "$APP_DIR/backend/venv"
fi

echo "==> Enabling lingering (so user services start on boot)"
loginctl enable-linger "$(whoami)" 2>/dev/null || \
  echo "Warning: could not enable linger. Service may not auto-start on boot."

echo
echo "==> Setup complete."
echo "    Next, from your dev machine:"
echo "      scp data/finance.db finance-host:$APP_DIR/data/finance.db   # one-time DB copy"
echo "      ./deploy/deploy.sh                                     # ship code + restart"
