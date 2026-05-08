# Finance Manager

Single-user personal finance app. Read `docs/SPEC.md` before planning new work — source of truth, additive only.

## Invariants
- Positive = inflow, negative = outflow. Every parser normalises.
- Spending queries filter `is_transfer = false` AND `categories.exclude_from_budget = false`. Structural, not per-feature.

## Pipeline
`docs/SPEC.md` → `docs/specs/YYYY-MM-DD-NN-slug.md` → `docs/plans/YYYY-MM-DD-NN-slug.md` → implement → `docs/handoff/`.

## Deployment
The deploy host is canonical; local `data/finance.db` is ephemeral test data. Set `DEPLOY_HOST` in `.env` (gitignored) or shell env.
- `app.main:app` exposes `/api/*` for dev/tests; `app.main:mounted_app` wraps it under `/finance/` and serves built frontend (production target on port 8003).
- One-time: `ssh "$DEPLOY_HOST" 'bash -s' < deploy/setup.sh`, `scp data/finance.db "$DEPLOY_HOST":~/dev/finance-analyzer/data/`, then `./deploy/deploy.sh`.
- Ongoing: `./deploy/deploy.sh` gates on lint/tests/build, runs alembic, restarts. Live at `http://$DEPLOY_HOST:8003/finance/`.
- Daily snapshots in `~/backups/finance/*.db.gz` on the deploy host (30 kept). rsync excludes `data/` + `input/` — server DB is canonical.
