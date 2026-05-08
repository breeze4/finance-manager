# Finance Manager

Local-first personal finance app. Drop bank CSVs into a folder, get
classified transactions, detected subscriptions, budgets with
historical analysis, spending forecasts, and a net-worth chart. Single
user, runs on your machine, SQLite on disk, nothing leaves the box.

## What it does

- **Import** CSVs from supported banks (Chase credit card, BECU
  checking) via a pluggable parser registry. Format auto-detected from
  headers. Idempotent — re-importing the same file is a no-op.
- **Classify** transactions. Editing a category auto-creates a vendor
  rule so future imports inherit it. Bulk-classify by filter.
- **Match payments** across accounts so credit-card payments don't
  double-count as spending.
- **Detect subscriptions**, both fixed (Netflix-style) and variable
  recurring (utility bills), with annual-cost estimates and trend
  sparklines.
- **Budget** per category with monthly/yearly targets, per-month
  overrides, rollover mode, and historical-analysis-driven suggestions.
- **Forecast** spending with a pluggable engine (current: simple
  seasonal + trend + subscription model).
- **Track net worth** via manual balance snapshots, with last-value
  carry-forward across the timeline.
- **Calculators** for Coast FIRE and mortgage payoff scenarios.

Full product spec: [`docs/SPEC.md`](docs/SPEC.md).

## Stack

- Backend: Python 3.11+, FastAPI, SQLAlchemy 2, Alembic, SQLite, `uv`.
- Frontend: React 18 + Vite + TypeScript, Tailwind, shadcn/ui, Recharts,
  TanStack Query, react-router.

## Quickstart

```bash
# install backend
make install

# apply migrations (creates data/finance.db with seed categories)
make migrate

# install frontend deps
cd frontend && npm install && cd ..

# run backend + frontend dev servers
make dev
```

Backend on `:8000`, frontend on `:5173`. Vite proxies `/api` to FastAPI.

Drop CSVs into `input/` (gitignored). Trigger an import from the UI's
Transactions page or `POST /api/import/all`.

## Layout

```
backend/    FastAPI app, models, services, parsers, alembic migrations
frontend/   Vite/React app
data/       SQLite db (gitignored)
input/      CSV drop dir (gitignored, sensitive)
docs/       spec + pipeline artifacts
```

See [`CLAUDE.md`](CLAUDE.md) for working notes (conventions, data flow,
docs pipeline).

## Common commands

| Command          | Effect                                       |
|------------------|----------------------------------------------|
| `make install`   | set up backend venv via uv                   |
| `make dev`       | run backend + frontend dev servers           |
| `make test`      | run backend pytest                           |
| `make lint`      | ruff check + format check                    |
| `make lint-fix`  | ruff fix + format                            |
| `make migrate`   | apply alembic migrations                     |
| `make migrate-new` | autogenerate a new migration              |

Frontend tests: `cd frontend && npm test`.

## Adding a new bank parser

1. New module in `backend/app/parsers/`, subclass the base parser:
   `can_parse(headers)`, `parse(filepath)`, `compute_import_hash(row)`.
2. Register in `backend/app/parsers/registry.py`.
3. Map source categories to canonical FKs if the source provides them.
4. Add a sample CSV slice to `backend/tests/` and verify vendor
   extraction + import hash stability.

## Status

Active development. Backend covers Tier 1–3 of the plan (import,
classify, match, subscriptions, budgets, forecast, rollover). Frontend
covers the core pages plus Coast FIRE / mortgage calculators. See
`docs/plans/` for in-flight work.
