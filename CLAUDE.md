# Finance Manager — Claude working notes

Single-user, local-first personal finance app. Imports bank CSVs, classifies
transactions, detects subscriptions, sets budgets, projects spending, tracks
net worth. Read `docs/SPEC.md` before planning anything substantive.

## Stack

- **Backend**: Python 3.11+, FastAPI, SQLAlchemy 2.x, Alembic, Pydantic v2,
  SQLite (`data/finance.db`). Managed with `uv`.
- **Frontend**: React 18, Vite, TypeScript, Tailwind, shadcn/ui (Radix
  primitives), Recharts, TanStack Query, react-router. Vitest for tests.
- **Build**: separate dev servers (`vite` on 5173, `uvicorn` on 8000); Vite
  proxies `/api` to FastAPI.

## Layout

```
backend/
  app/
    main.py              FastAPI app + router includes
    config.py            Pydantic Settings (DATABASE_URL, INPUT_DIR)
    database.py          engine, sessionmaker, get_db dep
    models/              SQLAlchemy ORM (transaction, account, category, ...)
    schemas/             Pydantic request/response shapes
    routers/             one router per domain (transactions, budget, ...)
    services/            business logic (ingestion, classification, budget,
                         forecast/, payment, snapshot, ...)
    parsers/             pluggable CSV parsers (base, registry, chase_cc,
                         becu_checking)
  alembic/               migrations
  tests/                 pytest
frontend/
  src/
    pages/               one component per route
    components/          Layout, sidebar, calculators/, ui/ (shadcn)
    api/                 fetch wrappers
    hooks/               useGlobalFilters, etc.
data/                    sqlite db (gitignored)
input/                   CSV drop dir (gitignored, sensitive)
docs/                    spec + pipeline artifacts (see Docs section)
```

## Commands

From repo root:

- `make install` — set up backend venv via uv
- `make dev` — backend + frontend dev servers in parallel
- `make dev-backend` / `make dev-frontend` — run individually
- `make test` — backend pytest
- `make lint` / `make lint-fix` — ruff check + format
- `make migrate` — apply alembic migrations
- `make migrate-new` — autogenerate a new migration (prompts for message)

Frontend tests: `cd frontend && npm test` (vitest).

## Conventions

- **Amount sign**: positive = inflow, negative = outflow. Every parser
  normalizes to this. BECU's separate Debit/Credit columns must collapse
  correctly (Debit already negative, Credit positive).
- **Transfer exclusion**: spending queries (`stats`, `budget`,
  `forecast`, `subscriptions`) MUST filter `is_transfer = false` and
  honor `categories.exclude_from_budget`. This is structural, not a
  per-feature decision.
- **Vendor identity**: `transactions.vendor` is the parser's best-effort
  string; `classification_rules.vendor_display_name` overrides for
  display. Subscription detection / payment matching key off `vendor`,
  so parser vendor extraction quality matters. Future: canonical
  `vendors` table — see `docs/FUTURE.md`.
- **Categories are FKs**, seeded with a canonical set on migration. Don't
  auto-create from CSV. Per-category `exclude_from_budget` flag acts as
  a category-level companion to `is_transfer`.
- **Imports are idempotent** via `import_hash` (per-parser dedup
  fingerprint) and `import_log.file_hash`.

## Data flow

CSV in `input/` → parser registry detects format from header → parser
emits `RawTransaction`s → ingestion service applies classification rules,
maps source category to canonical FK, dedups, inserts → payment
matching runs → stats/budget/forecast read from the same table.

## Docs

Top-level:

- `docs/SPEC.md` — product spec. Single source of truth. **Always
  consult before planning a new feature.** If the new thing isn't in
  the spec, add it (additive only — don't reformat other sections).
- `docs/FUTURE.md` — scratchpad for ideas not yet ready to spec.

Pipeline artifacts (dated, sequenced):

- `docs/specs/YYYY-MM-DD-NN-slug.md` — feature specs
- `docs/plans/YYYY-MM-DD-NN-slug.md` — implementation plans
- `docs/prompts/YYYY-MM-DD-NN-slug.md` — orchestration prompts
- `docs/handoff/` — implementer handoff notes per step
- `docs/archive/` — superseded docs

Naming: `YYYY-MM-DD-NN-slug.md`. Check existing files in the directory
to determine the next `NN`.

## Testing

- `make test` runs backend pytest. Tests live in `backend/tests/`.
- Service tests cross-check stats/budget math against raw CSV sums minus
  transfers. Don't mock the database — use a real SQLite test fixture.
- Frontend: vitest, but coverage is light. Check
  `frontend/src/pages/__tests__/` for examples.

## Working style

- Read `docs/SPEC.md` before designing anything new.
- Follow the pipeline: spec → plan → implement → handoff. Use the
  dated `YYYY-MM-DD-NN-slug.md` convention.
- No code in specs (pseudocode only for key algorithms).
- No AI co-author lines or AI mentions in commit messages.
- Don't estimate hours/days.
