# Orchestration Prompt: Balance Snapshots & Net Worth Tracking

## Project context

- Working directory: `.`
- Spec: `docs/specs/2026-05-06-02-balance-snapshots.md`
- Backend test: `make test`
- Backend lint: `make lint`
- Frontend build: `cd frontend && npm run build`
- Frontend test: `cd frontend && npm test -- --run` (skip if no frontend tests are added in a step)
- Migration apply: `make migrate`
- New migration: `make migrate-new`
- Handoff directory: `docs/handoff/` (create if needed)
- Plans directory: `docs/plans/`

## Orchestrator responsibilities

You are actively managing context between agents. Before launching each step:

1. Read the files listed under "Context sources" and include the relevant sections in the agent's "Context" field. Do NOT have the agent re-discover files the orchestrator can hand it.
2. If a previous step completed, read `docs/handoff/step-{N-1}-<step name>.md` and use it to fill the next agent's "Prior step context" — file paths created, models exposed, exact pattern set, anything load-bearing.
3. Run the gate commands in the working directory after each step. Do not proceed past a failing gate — stop and report.
4. Each step is one agent invocation, run sequentially. Each plan = one agent. Do not split or combine plans.

## Execution plan (serial)

```
Step 1: Accounts foundation         (no blockers; defines Account + accounts table consumed by 2 & 3)
   ↓
Step 2: Balance snapshot entry      (defines BalanceSnapshot + snapshots router consumed by 3)
   ↓
Step 3: Net worth chart             (consumes snapshots aggregation, no further dependents)
```

All three steps are AFK. No HITL checkpoints. The chain is strict — no parallelization opportunities (later steps consume schemas and router files defined by earlier steps).

---

### Step 1 — Accounts foundation

**Plan**: `docs/plans/2026-05-06-05-accounts-foundation.md`

**Agent briefing**:

- **Context sources** (orchestrator reads these and inlines into Context):
  - `docs/specs/2026-05-06-02-balance-snapshots.md` §"Data Model — accounts", §"Backend — Alembic migration", §"Backend — Existing transaction import_service", §"API — /accounts endpoints", §"Frontend — Accounts page"
  - `backend/app/models/category.py` (model exemplar)
  - `backend/app/models/transaction.py` (the file being modified)
  - `backend/app/schemas/category.py` and `backend/app/schemas/transaction.py` (schema exemplar + the file being modified)
  - `backend/app/routers/category_router.py` (router exemplar)
  - `backend/app/routers/transaction_router.py` (the response builder being modified)
  - `backend/app/services/import_service.py` (the service being modified)
  - `backend/alembic/versions/b762a8a2c851_initial_schema.py` (Alembic style reference)
  - `backend/tests/conftest.py` (fixture conventions)
  - `backend/tests/test_transaction_api.py` (API test exemplar)
  - `backend/app/main.py` (router registration)
  - `frontend/src/App.tsx` and `frontend/src/components/AppSidebar.tsx` (where the new route + sidebar entry slot in)
- **Read first**: `docs/plans/2026-05-06-05-accounts-foundation.md`
- **Context**: <orchestrator pastes the model/router/schema exemplars, the existing Transaction model, the existing import_service.py contents, the Alembic initial migration boilerplate, and the App.tsx + AppSidebar.tsx structures>
- **Owns**: see plan §"Owns" — `backend/app/models/account.py`, `models/transaction.py`, `models/__init__.py`, the new Alembic migration, `schemas/account.py`, `schemas/transaction.py`, `routers/account_router.py`, `routers/transaction_router.py`, `services/import_service.py`, `app/main.py`, all backend tests touching `Transaction.account`, plus the frontend Accounts page + modal + sidebar/route entries.
- **Must not touch**:
  - `backend/app/models/balance_snapshot.py`, `backend/app/routers/snapshots_router.py`, `backend/app/services/net_worth_service.py` — those belong to Step 2/3.
  - `frontend/src/pages/NetWorth.tsx`, `frontend/src/components/SnapshotBatchModal.tsx`, `frontend/src/api/snapshots.ts` — Step 2.
  - `mockup/` — legacy.
  - `docs/plans/backend.md`, `frontend.md`, `todo.md`, `spec-backport.md` — legacy.
- **MUST follow the pattern in**:
  - `backend/app/models/category.py` for SQLAlchemy model shape (Mapped columns, Index, table_args).
  - `backend/app/routers/category_router.py` for FastAPI router (list/create-201/patch/delete-204). Add the archive route as a sibling extension (`POST /{id}/archive`).
  - `backend/app/schemas/category.py` for Pydantic Create/Update/Response triple.
  - `backend/alembic/versions/b762a8a2c851_initial_schema.py` for Alembic migration style. Use a self-contained `sa.table(...)` for `bulk_insert` of the two seeded rows; do not import the SQLAlchemy model into the migration.
  - `backend/tests/test_transaction_api.py` for FastAPI TestClient + sqlite fixture flow.
- **Do not — name the owning step**:
  - Do not add a `BalanceSnapshot` model, the `balance_snapshots` table, or any `/snapshots` route — that is Step 2's responsibility.
  - Do not add a `net_worth_service`, `/api/net-worth` route, or any chart UI — that is Step 3's responsibility.
  - Do not refactor `snapshots_router.py` (it will not exist yet — do not create it).
- **If unclear, stop**:
  - If the existing CSV transaction parsers (`ChaseCcParser`, `BecuCheckingParser`) already do something different than emit account strings, ask before changing parser internals — the plan assumes they emit `RawTransaction.account` strings.
  - If `tests/conftest.py` has an unexpected fixture pattern, ask rather than rewrite it.
- **Done when**:
  - All of plan 05's Acceptance Criteria checkboxes are marked complete in the plan file.
  - `make migrate` runs cleanly against a fresh DB and produces the two seeded accounts and the FK rewrite.
  - `make test` passes (full backend test suite).
  - `make lint` passes.
  - `cd frontend && npm run build` succeeds with no TS errors.
- **Handoff**: Write `docs/handoff/step-1-accounts-foundation.md` recording:
  - Final `Account` model field names and types (especially the type enum values exactly as encoded).
  - Alembic revision hash, filename, and the exact bulk_insert payload used.
  - The `AccountResponse` Pydantic shape (consumed by Step 2's `/net-worth/latest` and frontend types).
  - The `account_id` query param convention added to `/api/transactions` (for the frontend client).
  - Any new fixtures added in `tests/conftest.py` (Step 2 will reuse them).
  - The shape of the `_resolve_account_id` helper in `import_service` (Step 2 may follow a similar pattern for snapshot upserts).
  - The new sidebar nav-item array entry (Step 2 will add another one matching the same shape).

**Stay within your plan's scope. If you see an improvement that belongs to a later step, leave it.**

**Gate (run from repo root)**:

```
make test && make lint && (cd frontend && npm run build)
```

Pass = all three commands exit 0. Fail = stop and report. Do not auto-fix.

**Interface gate** (orchestrator runs after Step 1 before launching Step 2):

- [ ] `python -c "from backend.app.models import Account; print([(c.name, c.type) for c in Account.__table__.columns])"` lists at minimum: `id, name, type, institution, is_archived, created_at, updated_at`.
- [ ] `Account.__table__.c.type.type` is a SQLAlchemy `Enum` (or string with CHECK) accepting all six values: `checking, savings, credit_card, brokerage, retirement, asset`.
- [ ] `Transaction.__table__.c.account_id` exists and `Transaction.__table__.c.account` does NOT.
- [ ] `curl -s localhost:8000/api/accounts` (after `make dev-backend`) returns a JSON array containing both seeded accounts.

If any check fails, do NOT proceed to Step 2 — return to Step 1's agent for fixes.

---

### Step 2 — Balance snapshot entry

**Plan**: `docs/plans/2026-05-06-06-balance-snapshot-entry.md`

**Agent briefing**:

- **Context sources** (orchestrator reads these):
  - `docs/handoff/step-1-accounts-foundation.md` (load-bearing — defines the Account schema this step references)
  - `docs/specs/2026-05-06-02-balance-snapshots.md` §"Data Model — balance_snapshots", §"API — POST /snapshots/batch", §"API — GET /net-worth/latest", §"Frontend — Net Worth page", §"Frontend — Batch entry modal", §"Same-Day Duplicates"
  - `backend/app/models/account.py` (just created) and `backend/app/models/transaction.py` (FK + relationship pattern)
  - `backend/app/schemas/account.py` (just created — for `LatestBalanceResponse` to embed account fields)
  - `backend/app/routers/category_router.py` (router exemplar — Step 1 may have added the snapshots-router skeleton, but probably not; this step creates it)
  - `backend/app/main.py` (where the new router is registered)
  - `backend/tests/conftest.py` (fixtures — including any Account fixtures Step 1 added)
  - `backend/tests/test_transaction_api.py` (API test pattern)
  - `frontend/src/api/` (any client files Step 1 added) and `frontend/src/pages/Accounts.tsx` (just created — for layout style)
  - `frontend/src/components/ui/dialog.tsx` consumers (shadcn modal pattern), `frontend/src/components/ui/table.tsx` consumers
  - `frontend/src/components/AppSidebar.tsx` and `frontend/src/App.tsx` (where the new entry + route slot in)
- **Read first**: `docs/plans/2026-05-06-06-balance-snapshot-entry.md`
- **Context**: <orchestrator pastes the Step 1 handoff in full, the new Account model + AccountResponse schema, the existing AppSidebar nav-item shape, and the FK pattern from `Transaction` for the agent to mirror>
- **Owns**: see plan §"Owns" — new `BalanceSnapshot` model, new Alembic migration for `balance_snapshots`, new `schemas/balance_snapshot.py`, new `services/snapshot_service.py`, new `routers/snapshots_router.py`, registration in `app/main.py`, new tests, plus the frontend Net Worth page (table only), batch entry modal, snapshots API client, and sidebar/route entries.
- **Must not touch**:
  - `backend/app/models/account.py`, `backend/app/models/transaction.py`, `backend/app/routers/account_router.py`, `backend/app/services/import_service.py` — owned by Step 1.
  - `backend/app/services/net_worth_service.py` and the `GET /api/net-worth?start_date=&end_date=` time-series route — owned by Step 3. The latest-balances endpoint mounts at `/api/net-worth/latest` IN THIS STEP; the time-series endpoint mounts at `/api/net-worth` in Step 3, in the same router.
  - `frontend/src/pages/Accounts.tsx`, `frontend/src/components/AccountFormModal.tsx` — owned by Step 1.
  - The chart on the Net Worth page — owned by Step 3. THIS step renders only the latest-balance table on `NetWorth.tsx`. Step 3 will modify `NetWorth.tsx` to add the chart above the table — leave that area alone, do not pre-stub a chart placeholder.
  - `mockup/`, legacy plans.
- **Prior step context**: Step 1 added the `accounts` table, the `Account` SQLAlchemy model, `AccountResponse` Pydantic schema, the `transactions.account_id` FK, the `/api/accounts` CRUD router, an Accounts page, and a sidebar entry. Trust `docs/handoff/step-1-accounts-foundation.md` over this description for exact field names and shapes.
- **MUST follow the pattern in**:
  - `backend/app/models/transaction.py` — for `account_id` FK + `account` relationship pattern (apply the same to `BalanceSnapshot.account_id`).
  - `backend/app/routers/category_router.py` — for the FastAPI router shape.
  - `backend/app/schemas/category.py` — for Pydantic schema layout.
  - `backend/tests/test_transaction_api.py` — for FastAPI TestClient + sqlite fixture flow.
  - The Step 1 frontend Accounts page (just created in `frontend/src/pages/Accounts.tsx`) — for shadcn `Table` + page layout conventions.
  - The Step 1 sidebar nav-item entry — match its shape exactly when adding "Net Worth".
- **Follow the pattern in**:
  - SQLAlchemy 2.x sqlite `on_conflict_do_update` docs — use `from sqlalchemy.dialects.sqlite import insert as sqlite_insert` and `sqlite_insert(BalanceSnapshot).values(...).on_conflict_do_update(index_elements=['account_id', 'as_of_date'], set_=...)`.
- **Do not — name the owning step**:
  - Do not implement `net_worth_service`, the `/api/net-worth?start&end` time-series route, the `NetWorthChart` component, the `DateRangePicker` component, or any aggregation logic — that is Step 3's responsibility.
  - Do not pre-stub a chart placeholder on `NetWorth.tsx` — leave the chart area completely absent. Step 3 will insert it.
- **If unclear, stop**:
  - If the on-conflict upsert behaves oddly under sqlite (some SQLAlchemy versions vary), ask rather than fall back to a delete-then-insert pattern.
  - If Step 1's handoff doesn't make clear what `AccountType` enum values are exactly named (string vs Python enum), ask before importing.
- **Done when**:
  - All of plan 06's Acceptance Criteria checkboxes are marked complete in the plan file.
  - `make migrate` applies the new migration cleanly on top of Step 1's migration.
  - `make test` passes including the new `test_snapshot_batch_api`.
  - `make lint` passes.
  - `cd frontend && npm run build` succeeds.
  - Manual smoke (orchestrator may run): `make dev-backend` + frontend dev → create two accounts via Accounts page → navigate to Net Worth → click Snapshot today → enter balances → save → see them in the latest-balance table → re-enter for the same date → table updates.
- **Handoff**: Write `docs/handoff/step-2-snapshot-entry.md` recording:
  - Final `BalanceSnapshot` model field names and types (especially `source` column type — string with CHECK or SQLAlchemy Enum).
  - Alembic revision hash + filename for the snapshots migration.
  - The exact `LatestBalanceResponse` Pydantic shape and the `/api/net-worth/latest` route URL.
  - The `snapshots_router` file structure — where Step 3 should insert the time-series route.
  - The `frontend/src/api/snapshots.ts` exports — Step 3 will append `getNetWorthSeries` here.
  - The `NetWorth.tsx` page structure — exactly where Step 3 should insert the chart (above the latest-balance table) and the existing layout markers (e.g., heading, "Snapshot today" button location).

**Stay within your plan's scope. If you see an improvement that belongs to a later step, leave it.**

**Gate (run from repo root)**:

```
make test && make lint && (cd frontend && npm run build)
```

**Interface gate** (orchestrator runs after Step 2 before launching Step 3):

- [ ] `BalanceSnapshot.__table__.c` includes: `id, account_id, as_of_date, balance, source, notes, created_at, updated_at`.
- [ ] A unique constraint on `(account_id, as_of_date)` exists (`grep` the migration file or reflect the table).
- [ ] `curl -s localhost:8000/api/net-worth/latest` returns a JSON array of `{account_id, account_name, account_type, balance, as_of_date}` rows.
- [ ] `routers/snapshots_router.py` exists and contains `POST /snapshots/batch` and `GET /net-worth/latest`.

If any check fails, return to Step 2 for fixes.

---

### Step 3 — Net worth chart

**Plan**: `docs/plans/2026-05-06-07-net-worth-chart.md`

**Agent briefing**:

- **Context sources** (orchestrator reads these):
  - `docs/handoff/step-1-accounts-foundation.md` (Account schema)
  - `docs/handoff/step-2-snapshot-entry.md` (BalanceSnapshot + router structure — load-bearing)
  - `docs/specs/2026-05-06-02-balance-snapshots.md` §"Backend — Net worth aggregation", §"API — GET /net-worth?start_date=&end_date=", §"Frontend — Net Worth page" (chart portion)
  - `backend/app/services/stats_service.py` (aggregation service exemplar)
  - `backend/app/routers/stats_router.py` (read-only aggregation router exemplar)
  - `backend/app/routers/snapshots_router.py` (just created — the file Step 3 appends to)
  - `backend/app/schemas/balance_snapshot.py` (just created — the file Step 3 appends to)
  - `backend/tests/test_stats_api.py` and `backend/tests/test_forecast.py` (service-level test exemplars)
  - `frontend/src/api/snapshots.ts` (just created — the file Step 3 appends to)
  - `frontend/src/pages/NetWorth.tsx` (just created — the file Step 3 modifies)
  - Any existing Recharts usage in `frontend/src/pages/CoastFire.tsx` or `frontend/src/pages/Mortgage.tsx` if the calculator-port plans landed (style/theme reference)
- **Read first**: `docs/plans/2026-05-06-07-net-worth-chart.md`
- **Context**: <orchestrator pastes the Step 2 handoff in full, the existing `snapshots_router.py` structure, the existing `NetWorth.tsx` markup, and any existing chart-component pattern from CoastFire/Mortgage if present>
- **Owns**: see plan §"Owns" — new `services/net_worth_service.py`, append-only edits to `schemas/balance_snapshot.py`, `routers/snapshots_router.py`, `frontend/src/api/snapshots.ts`, modifications to `frontend/src/pages/NetWorth.tsx`, new `NetWorthChart.tsx` and `DateRangePicker.tsx` components, new `tests/test_net_worth_service.py`.
- **Must not touch**:
  - Any model file, any migration. Step 3 adds zero schema.
  - `backend/app/routers/account_router.py`, `backend/app/services/import_service.py` — owned by Step 1.
  - `POST /api/snapshots/batch` and `GET /api/net-worth/latest` route handlers — owned by Step 2. Step 3 must NOT alter their signatures or behavior.
  - The latest-balance table render in `NetWorth.tsx` — Step 3 only adds the chart section above it; do not refactor the existing table.
  - `mockup/`, legacy plans.
- **Prior step context**:
  - Step 1: `accounts` table + Account model + `/api/accounts` CRUD + Accounts page.
  - Step 2: `balance_snapshots` table + BalanceSnapshot model + `snapshots_router.py` (with `POST /snapshots/batch` and `GET /net-worth/latest`) + Net Worth page (table only) + batch entry modal + sidebar entry.
  - Trust `docs/handoff/step-2-snapshot-entry.md` over this description for exact router structure and frontend file shapes.
- **MUST follow the pattern in**:
  - `backend/app/services/stats_service.py` for read-only aggregation service style.
  - `backend/app/routers/stats_router.py` for date-range query-param endpoint style.
  - `backend/tests/test_stats_api.py` (or `test_forecast.py`) for service tests with synthetic fixtures.
- **Follow the pattern in**:
  - Existing Recharts usage in the frontend (likely `frontend/src/pages/CoastFire.tsx` or `frontend/src/pages/Mortgage.tsx` from the calculator port). Match stroke colors, axis label styling, tooltip formatting. If no chart exists yet, set sensible defaults using theme tokens (`hsl(var(--primary))`, monospace tick labels via Tailwind `font-mono`).
- **Do not — name the owning step**:
  - Do not modify any model, migration, or `POST /snapshots/batch` / `GET /net-worth/latest` handler — those belong to Steps 1/2.
  - Do not refactor `NetWorth.tsx`'s existing table render — only add a chart section above it.
- **If unclear, stop**:
  - If LVCF semantics are ambiguous for an account that becomes archived mid-history, ask. The plan says archived accounts are excluded entirely; verify before writing the test.
  - If the analyzer's chart theme tokens aren't obvious from the index.css, ask rather than introduce new color tokens.
- **Done when**:
  - All of plan 07's Acceptance Criteria checkboxes are marked complete in the plan file.
  - `make test` passes including the new `test_net_worth_service` covering all listed scenarios.
  - `make lint` passes.
  - `cd frontend && npm run build` succeeds.
  - Manual smoke: with snapshots in the DB from Step 2's smoke run, Net Worth page renders a single line chart, the line tracks correctly, the range picker quick-buttons (30d/90d/1y/all) work, hover tooltips show formatted currency, empty-DB case shows the empty-state message.
- **Handoff**: Write `docs/handoff/step-3-net-worth-chart.md` recording:
  - Final `net_worth_service.compute_time_series` signature.
  - The `NetWorthPoint` schema shape.
  - Confirmation that the existing latest-balance table render was untouched.
  - Any chart-styling choices that future plans should mirror (color tokens used, tick formatter conventions).

**Stay within your plan's scope. If you see an improvement that belongs to a later step, leave it.**

**Gate (run from repo root)**:

```
make test && make lint && (cd frontend && npm run build)
```

---

## Completion criteria

- All three plan files have every Acceptance Criterion checkbox marked complete.
- `make test && make lint && (cd frontend && npm run build)` passes from a clean checkout after all three steps.
- All three handoff files exist in `docs/handoff/`.
- Manual end-to-end smoke: create two accounts via the Accounts page → snapshot balances → see them in the Net Worth page table → see them on the chart line → archive an account → verify it disappears from both the table and the chart aggregation → re-snapshot for the same date → verify replace semantics.

## Notes on parallelization

Strict serial. The dependency chain is:

- Step 2 imports the `Account` model and consumes `accounts.id` as an FK target.
- Step 3 imports `BalanceSnapshot` and aggregates over snapshot rows.
- Both later steps append to files Step 1/2 created (`snapshots_router.py`, `balance_snapshot.py` schema, `NetWorth.tsx`, `snapshots.ts`).

Worktree isolation per step is fine but not required — sequential commits to a single branch work equally well since gates pass between steps.
