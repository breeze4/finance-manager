#!/usr/bin/env bash
# Snapshot the finance-analyzer SQLite DB to ~/backups/finance.
# Run by the finance-analyzer-backup.timer systemd user timer.
#
# Uses sqlite3 .backup for a consistent online snapshot — safe even if
# uvicorn is mid-write. cp / rsync of a live DB can capture a torn page.
set -euo pipefail

SRC="$HOME/dev/finance-analyzer/data/finance.db"
DST_DIR="$HOME/backups/finance"
RETAIN=30

if [ ! -f "$SRC" ]; then
  echo "Source DB not found: $SRC" >&2
  exit 1
fi

mkdir -p "$DST_DIR"

TS=$(date +%Y-%m-%d-%H%M%S)
DST="$DST_DIR/finance-$TS.db"

sqlite3 "$SRC" ".backup '$DST'"
gzip -9 "$DST"

# Keep the RETAIN newest snapshots, prune older.
mapfile -t OLD < <(ls -1t "$DST_DIR"/finance-*.db.gz 2>/dev/null | tail -n +$((RETAIN + 1)))
if [ "${#OLD[@]}" -gt 0 ]; then
  rm -f -- "${OLD[@]}"
fi

echo "Backup OK: ${DST}.gz ($(du -h "${DST}.gz" | cut -f1))"
