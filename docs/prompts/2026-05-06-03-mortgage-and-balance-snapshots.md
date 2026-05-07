# Orchestration Prompt: Mortgage Payoff + Balance Snapshots

This prompt picks up where session 1 left off and runs the remaining unbuilt work in a single serial chain:

1. **Mortgage Payoff** — completes the Calculator Port (plan 04 from `docs/specs/2026-05-06-01-calculator-port.md`).
2. **Accounts foundation** — first slice of Balance Snapshots (plan 05 from `docs/specs/2026-05-06-02-balance-snapshots.md`).
3. **Balance snapshot entry** — second slice (plan 06).
4. **Net worth chart** — third slice (plan 07).

Steps 1–3 of the calculator port (frontend shell, shared infra, Coast FIRE) are already merged on `main` with handoffs at `docs/handoff/step-{1,2,3}-*.md`. Steps 4–7 of *this* prompt produce handoffs `step-{4,5,6,7}-*.md`.

## Project context

- Working directory: `.`
- Specs:
  - `docs/specs/2026-05-06-01-calculator-port.md` (mortgage section)
  - `docs/specs/2026-05-06-02-balance-snapshots.md`
- Backend test: `make test`
- Backend lint: `make lint`
- Frontend build: `cd frontend && npm run build`
- Frontend test: `cd frontend && npm test -- --run`
- Migration apply: `make migrate`
- New migration: `cd backend && uv run alembic revision --autogenerate -m "<msg>"` (use this directly — `make migrate-new` is interactive)
- Handoff directory: `docs/handoff/`
- Plans directory: `docs/plans/`
- Sibling read-only project: `../legacy-vue-calc/` (mortgage UI source for step 4)

## Orchestrator responsibilities

Manage context between agents. Before launching each step:

1. Read the files listed under "Context sources" and inline relevant sections into the agent's "Context" field.
2. Read the most recent handoff(s) and pass key facts to the next agent (paths, contracts, decisions).
3. Run gate commands after each step. Do not proceed past a failing gate — report and stop.
4. Each step is one agent invocation, run sequentially. One plan = one agent. No splitting or combining.

## Execution plan (serial)

```
Step 4: Mortgage Payoff end-to-end                (plan 04 — completes calculator port)
   ↓
Step 5: Accounts foundation                       (plan 05 — starts balance snapshots)
   ↓
Step 6: Balance snapshot entry                    (plan 06)
   ↓
Step 7: Net worth chart                           (plan 07)
```

All four steps are AFK. No HITL checkpoints. Strict serial: step 6 imports step 5's `Account` model; step 7 aggregates over step 6's `BalanceSnapshot`. Step 4 is independent of steps 5–7 but runs first to close the calculator port cleanly.

---

## Step 4 — Mortgage Payoff end-to-end

**Plan**: `docs/plans/2026-05-06-04-mortgage-end-to-end.md`

**Agent briefing**:

- **Context sources** (orchestrator reads these):
  - `docs/handoff/step-3-coast-fire.md` (canonical pattern — most important)
  - `docs/handoff/step-1-frontend-shell.md`, `docs/handoff/step-2-shared-infra.md`
  - `docs/specs/2026-05-06-01-calculator-port.md` §"Calculators → Mortgage Payoff", §"Persistence" (entire)
  - `../legacy-vue-calc/src/views/MortgagePayoffCalculator.vue`
  - `../legacy-vue-calc/src/stores/mortgagePayoff.ts` (default values, computed shapes, `tooltipData`)
  - The actual files step 3 produced — these are the canonical templates: `backend/app/models/coast_fire_scenario.py`, `backend/app/schemas/coast_fire_scenario.py`, `backend/app/routers/coast_fire_router.py`, `backend/app/services/coast_fire_service.py`, the coast fire migration under `backend/alembic/versions/`, `backend/tests/test_coast_fire_router.py`, `frontend/src/api/coastFire.ts`, `frontend/src/hooks/useCoastFireScenario.ts`, `frontend/src/pages/CoastFire.tsx`, `frontend/src/components/calculators/CoastFireForm.tsx`, `frontend/src/components/calculators/CoastFireResults.tsx`
- **Read first**: `docs/plans/2026-05-06-04-mortgage-end-to-end.md`
- **Context**: <orchestrator pastes step-3 handoff in full + MortgagePayoffCalculator.vue tile content + mortgagePayoff.ts defaults + a 30-line excerpt from the coast fire model/router/test as the canonical templates>

- **Owns**:
  - Backend: `backend/app/models/mortgage_scenario.py`, `backend/app/schemas/mortgage_scenario.py`, `backend/app/routers/mortgage_router.py`, `backend/app/services/mortgage_scenario_service.py` (extract — matches coast-fire pattern), new `backend/alembic/versions/<rev>_add_mortgage_scenarios.py`, `backend/tests/test_mortgage_router.py`. **Single-line additions**: `backend/app/main.py` (router include) and `backend/app/models/__init__.py` (export).
  - Frontend: `frontend/src/api/mortgage.ts`, `frontend/src/hooks/useMortgageScenario.ts`, `frontend/src/pages/Mortgage.tsx` (replaces step 1 placeholder), `frontend/src/components/calculators/MortgageForm.tsx`, `frontend/src/components/calculators/MortgageResults.tsx`, plus matching test files under `frontend/src/pages/__tests__/Mortgage.test.tsx` and `frontend/src/hooks/__tests__/useMortgageScenario.test.ts`.

- **Heads-up — formatter situation**:
  The spec's plan listed four "PLANNED" mortgage-tooltip formatters as net-new code for this step (`formatAmortizationSteps`, `formatInvestmentCompoundingSteps`, `formatTaxCalculationSteps`, `formatPayoffComparisonSteps`). **Reality check**: the source file `legacy-vue-calc/src/utils/mathFormatters.ts` already contains all four. Step 2 ported them verbatim into `frontend/src/lib/math/mathFormatters.ts` and they're already exported from `@/lib/math`. Step 4's job is therefore to **consume** them, not to write them. Confirm by running `grep -n "formatAmortizationSteps\|formatInvestmentCompoundingSteps\|formatTaxCalculationSteps\|formatPayoffComparisonSteps" frontend/src/lib/math/mathFormatters.ts` and verifying you get four hits before assuming. If for some reason a formatter IS missing (it shouldn't be), append it — but the default expectation is no new formatters.

- **Must not touch**:
  - All step 3 files (coast fire model/router/schema/migration/tests, `api/coastFire.ts`, `useCoastFireScenario.ts`, `pages/CoastFire.tsx`, `CoastFire*.tsx` components).
  - All step 2 owned code: `frontend/src/lib/math/`, `MathTooltip.tsx`, `ScenarioPicker.tsx`, `charts/ProjectionLineChart.tsx`, `charts/ComparisonLineChart.tsx`, `useMediaQuery.ts`. Consume only.
  - `frontend/src/components/AppSidebar.tsx`, `Layout.tsx`, `TopBar.tsx`, `NavLink.tsx` — owned by step 1.
  - Anything outside the calculator vertical (transactions, budget, forecast, payments, subscriptions, classification, imports, accounts, snapshots).
  - `mockup/`.

- **MUST follow the pattern in** (highest priority — these are the actual canonical files step 3 produced):
  - `backend/app/models/coast_fire_scenario.py`
  - `backend/app/schemas/coast_fire_scenario.py`
  - `backend/app/routers/coast_fire_router.py`
  - `backend/app/services/coast_fire_service.py`
  - `backend/tests/test_coast_fire_router.py`
  - `backend/alembic/versions/<the-coast-fire-migration>.py` (for the partial-index DDL approach via `op.execute(...)`)
  - `frontend/src/api/coastFire.ts`
  - `frontend/src/hooks/useCoastFireScenario.ts`
  - `frontend/src/pages/CoastFire.tsx` and `CoastFireForm.tsx` / `CoastFireResults.tsx`

- **Follow the pattern in**: `../legacy-vue-calc/src/views/MortgagePayoffCalculator.vue` — page layout, tile sequencing, copy. Translate Vue → React; preserve UX. **Copy formula text and educational copy verbatim into React tile components — do not paraphrase.** Same `tooltipData` pattern as step 3 used for coast fire.

- **Implementation notes**:
  - **Tax-rate input**: percent at the form boundary (e.g. `20`), decimal in math (`0.20`). Convert at the form ↔ state edge, matching calculator-project convention.
  - **Crossover annotation** on equity-vs-investment chart: consume `crossoverMonth` from `investmentComparisonToRecharts(...)` (returns `{ rows, crossoverMonth }`). Pass to `<ComparisonLineChart crossoverMonth={...} crossoverSeriesKey="investmentValue" />`. Do not reimplement detection.
  - **Amortization formatter**: don't dump the full schedule — the formatter shows the first ~3 months as illustrative steps then `...` then final result. Mirror existing FV formatter's illustrative style (already implemented in source).
  - **Strategy recommendation tile**: `interestSaved > investmentNetBenefit` → `'payoff'`, else `'invest'`. Show both numbers in tooltip.
  - **First-active auto-activation**: step 3 made the first scenario auto-activate so `GET /active` returns it on next refresh; subsequent creates default to inactive. Mirror this in `mortgage_scenario_service.create_scenario(...)`.
  - **Recharts row interfaces lack index signatures**: the `MortgageBalanceRow`, `InterestComparisonRow`, `InvestmentComparisonRow` types from `rechartsAdapters.ts` will hit the same friction step 3 documented (`as unknown as Record<string, unknown>[]` at chart call sites). Apply the same workaround.
  - **API client snake_case**: step 3's API client uses snake_case end-to-end with no camelCase translation layer; `validateMortgageInputs` errors are camelCase keys though, so the form maps between them. Mirror this.
  - **Schema fields** (per spec): `id`, `name` (unique), `is_active` (bool), `principal`, `years_left`, `interest_rate`, `monthly_payment`, `additional_monthly_payment`, `lump_sum_payment`, `investment_return_rate`, `investment_tax_rate`, `created_at`, `updated_at`.
  - **Partial unique index**: same approach as coast fire — `op.execute("CREATE UNIQUE INDEX ix_mortgage_scenarios_is_active ON mortgage_scenarios (is_active) WHERE is_active = 1")` plus matching DROP in `downgrade()`.
  - **Endpoints**: `APIRouter(prefix="/api/calculators/mortgage/scenarios", tags=["mortgage"])`. Same 7 routes as coast fire (list, create, active, get, update, activate, delete) with the same 404/409 conventions.
  - **Hook cache keys**: `['mortgage', 'scenarios']`, `['mortgage', 'scenarios', 'active']`, `['mortgage', 'scenarios', id]`. `useActiveScenario` swallows 404 as `null` (mirror coast fire).

- **Done when**:
  - Backend `make test` green with new mortgage tests; `make lint` clean.
  - Frontend `/mortgage` page loads active scenario (or seeded defaults on 404), all 10 result tiles render with tooltips, all 3 charts render (with crossover dot when applicable), scenario picker works.
  - All checkboxes in plan 04's Acceptance Criteria are marked complete in the plan file.
  - `cd frontend && npm run build && npm test -- --run` exits 0; test count does not regress below step 3's floor.

- **If unclear, stop**: any divergence between the canonical pattern from step 3 and what the spec says — surface it. Do not silently adapt.

- **Handoff**: write `docs/handoff/step-4-mortgage.md` recording:
  - Exact `MortgageScenarioResponse` Pydantic schema.
  - Full URL list of the 7 endpoints.
  - `useMortgageScenario` hook signature (cache keys, exported functions).
  - Default values used for first-run seeding.
  - Whether the formatters were already present (expected: yes) or whether any had to be appended.
  - Any edge cases discovered (e.g. when does crossover NOT happen, what does the strategy tile show in that case).
  - Service-vs-inline decision (expected: extracted, matching coast fire).
  - Backend + frontend test counts.

**Stay within your plan's scope. If you see an improvement that belongs to a later step, leave it.**

**Gate (run from repo root)**:

```
make test && make lint && (cd frontend && npm run build && npm test -- --run)
```

Pass when: backend tests green (incl. new mortgage tests), ruff clean, frontend build clean, all frontend tests pass.

**Interface gate** (orchestrator runs after step 4 before launching step 5):

- [ ] `backend/app/schemas/mortgage_scenario.py` exists with `MortgageScenarioResponse` covering all the schema fields above.
- [ ] `backend/app/routers/mortgage_router.py` mounts at prefix `/api/calculators/mortgage/scenarios` with all 7 endpoints.
- [ ] `backend/app/main.py` includes both `coast_fire_router` and `mortgage_router`.
- [ ] `backend/app/models/__init__.py` exports both `CoastFireScenario` and `MortgageScenario`.
- [ ] Calculator port closure: `make test && make lint && (cd frontend && npm run build && npm test -- --run)` from a clean working tree exits 0.

If any check fails, return to step 4 for fixes before launching step 5.

---

## Step 5 — Accounts foundation

**Plan**: `docs/plans/2026-05-06-05-accounts-foundation.md`

**Agent briefing**:

- **Context sources** (orchestrator reads these):
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
  - `frontend/src/App.tsx` and `frontend/src/components/AppSidebar.tsx` (current sidebar nav-item array shape — see step-1 handoff)
  - `docs/handoff/step-1-frontend-shell.md` (sidebar nav-item shape — load-bearing for matching the Net Worth + Accounts entries)
- **Read first**: `docs/plans/2026-05-06-05-accounts-foundation.md`
- **Context**: <orchestrator pastes the model/router/schema exemplars, the existing Transaction model, the existing import_service.py contents, the Alembic initial migration boilerplate, and the AppSidebar.tsx `navItems` array (8 entries from step 1's handoff)>

- **Owns**: see plan §"Owns" — `backend/app/models/account.py`, modifications to `backend/app/models/transaction.py`, `backend/app/models/__init__.py`, the new Alembic migration, `backend/app/schemas/account.py`, modifications to `backend/app/schemas/transaction.py`, `backend/app/routers/account_router.py`, modifications to `backend/app/routers/transaction_router.py`, modifications to `backend/app/services/import_service.py`, `backend/app/main.py`, all backend tests touching `Transaction.account`, plus the frontend Accounts page + modal + sidebar/route entries.

- **Must not touch**:
  - `backend/app/models/balance_snapshot.py`, `backend/app/routers/snapshots_router.py`, `backend/app/services/net_worth_service.py` — those belong to step 6/7.
  - `frontend/src/pages/NetWorth.tsx`, `frontend/src/components/SnapshotBatchModal.tsx`, `frontend/src/api/snapshots.ts` — step 6.
  - All calculator-port code: `frontend/src/pages/CoastFire.tsx`, `Mortgage.tsx`, `frontend/src/components/calculators/`, `frontend/src/lib/math/`, `frontend/src/hooks/use*Scenario.ts`, `frontend/src/api/coastFire.ts`, `frontend/src/api/mortgage.ts`. Backend: `coast_fire_*.py`, `mortgage_*.py` files.
  - `mockup/`, `docs/plans/backend.md`, `frontend.md`, `todo.md`, `spec-backport.md` (legacy).

- **MUST follow the pattern in**:
  - `backend/app/models/category.py` for SQLAlchemy model shape (Mapped columns, Index, table_args).
  - `backend/app/routers/category_router.py` for FastAPI router (list/create-201/patch/delete-204). Add the archive route as a sibling extension (`POST /{id}/archive`).
  - `backend/app/schemas/category.py` for Pydantic Create/Update/Response triple.
  - `backend/alembic/versions/b762a8a2c851_initial_schema.py` for Alembic migration style. Use a self-contained `sa.table(...)` for `bulk_insert` of the two seeded rows; do not import the SQLAlchemy model into the migration.
  - `backend/tests/test_transaction_api.py` for FastAPI TestClient + sqlite fixture flow.
  - The current `frontend/src/components/AppSidebar.tsx` `navItems` array (from step-1 handoff). Net Worth and Accounts get appended as new entries — match the existing `{ title, url, icon }` shape exactly. Net Worth goes near the top (below Overview); Accounts goes toward the bottom. Coast FIRE and Mortgage entries already exist at the bottom — leave them.

- **Do not — name the owning step**:
  - Do not add a `BalanceSnapshot` model, the `balance_snapshots` table, or any `/snapshots` route — that is step 6.
  - Do not add a `net_worth_service`, `/api/net-worth` route, or any chart UI — that is step 7.
  - Do not refactor `snapshots_router.py` (it will not exist yet — do not create it).

- **If unclear, stop**:
  - If the existing CSV transaction parsers (`ChaseCcParser`, `BecuCheckingParser`) already do something different than emit account strings, ask before changing parser internals — the plan assumes they emit `RawTransaction.account` strings.
  - If `tests/conftest.py` has an unexpected fixture pattern, ask rather than rewrite it.

- **Done when**:
  - All of plan 05's Acceptance Criteria checkboxes are marked complete in the plan file.
  - `make migrate` runs cleanly against a fresh DB and produces the two seeded accounts and the FK rewrite.
  - `make test` passes (full backend test suite, no calculator-port regression).
  - `make lint` passes.
  - `cd frontend && npm run build && npm test -- --run` succeeds, no test count regression.

- **Handoff**: Write `docs/handoff/step-5-accounts-foundation.md` recording:
  - Final `Account` model field names and types (especially the `type` enum values exactly as encoded — string with CHECK constraint vs SQLAlchemy `Enum`).
  - Alembic revision hash, filename, and the exact bulk_insert payload used.
  - The `AccountResponse` Pydantic shape (consumed by step 6's `/net-worth/latest` and frontend types).
  - The `account_id` query param convention added to `/api/transactions` (for the frontend client).
  - Any new fixtures added in `tests/conftest.py` (step 6 will reuse them).
  - The shape of the `_resolve_account_id` (or equivalent) helper in `import_service` — step 6 may follow a similar pattern for snapshot upserts.
  - The new sidebar nav-item array entry for Accounts (step 6 will add the Net Worth entry matching the same shape).

**Stay within your plan's scope. If you see an improvement that belongs to a later step, leave it.**

**Gate (run from repo root)**:

```
make test && make lint && (cd frontend && npm run build && npm test -- --run)
```

Pass = all four commands exit 0. Fail = stop and report. Do not auto-fix.

**Interface gate** (orchestrator runs after step 5 before launching step 6):

- [ ] `cd backend && uv run python -c "from app.models import Account; print([(c.name, str(c.type)) for c in Account.__table__.columns])"` lists at minimum: `id, name, type, institution, is_archived, created_at, updated_at`.
- [ ] `Account.__table__.c.type` accepts all six values: `checking, savings, credit_card, brokerage, retirement, asset` (via SQLAlchemy `Enum` or string with CHECK constraint).
- [ ] `Transaction.__table__.c.account_id` exists and `Transaction.__table__.c.account` does NOT.
- [ ] After `make dev-backend` running in background: `curl -s localhost:8000/api/accounts` returns a JSON array containing both seeded accounts.

If any check fails, return to step 5 for fixes.

---

## Step 6 — Balance snapshot entry

**Plan**: `docs/plans/2026-05-06-06-balance-snapshot-entry.md`

**Agent briefing**:

- **Context sources** (orchestrator reads these):
  - `docs/handoff/step-5-accounts-foundation.md` (load-bearing — defines the Account schema this step references)
  - `docs/specs/2026-05-06-02-balance-snapshots.md` §"Data Model — balance_snapshots", §"API — POST /snapshots/batch", §"API — GET /net-worth/latest", §"Frontend — Net Worth page", §"Frontend — Batch entry modal", §"Same-Day Duplicates"
  - `backend/app/models/account.py` (just created) and `backend/app/models/transaction.py` (FK + relationship pattern)
  - `backend/app/schemas/account.py` (just created — for `LatestBalanceResponse` to embed account fields)
  - `backend/app/routers/category_router.py` (router exemplar)
  - `backend/app/main.py` (where the new router is registered)
  - `backend/tests/conftest.py` (fixtures — including any Account fixtures step 5 added)
  - `backend/tests/test_transaction_api.py` (API test pattern)
  - `frontend/src/api/` (any client files step 5 added) and `frontend/src/pages/Accounts.tsx` (just created — for layout style)
  - `frontend/src/components/ui/dialog.tsx` (modal primitive — already cherry-picked in step 2)
  - `frontend/src/components/AppSidebar.tsx` (where the Net Worth entry slots in) and `frontend/src/App.tsx` (route registration)

- **Read first**: `docs/plans/2026-05-06-06-balance-snapshot-entry.md`
- **Context**: <orchestrator pastes the step 5 handoff in full, the new Account model + AccountResponse schema, the existing AppSidebar nav-item shape, and the FK pattern from `Transaction` for the agent to mirror>

- **Owns**: see plan §"Owns" — new `BalanceSnapshot` model, new Alembic migration for `balance_snapshots`, new `schemas/balance_snapshot.py`, new `services/snapshot_service.py`, new `routers/snapshots_router.py`, registration in `app/main.py`, new tests, plus the frontend Net Worth page (table only), batch entry modal, snapshots API client, and sidebar/route entries.

- **Must not touch**:
  - `backend/app/models/account.py`, `backend/app/models/transaction.py`, `backend/app/routers/account_router.py`, `backend/app/services/import_service.py` — owned by step 5.
  - `backend/app/services/net_worth_service.py` and the time-series route `GET /api/net-worth?start_date=&end_date=` — owned by step 7. The latest-balances endpoint mounts at `/api/net-worth/latest` IN THIS STEP; the time-series endpoint mounts at `/api/net-worth` in step 7, in the same router.
  - `frontend/src/pages/Accounts.tsx`, `frontend/src/components/AccountFormModal.tsx` — owned by step 5.
  - The chart on the Net Worth page — owned by step 7. THIS step renders only the latest-balance table on `NetWorth.tsx`. Step 7 will modify `NetWorth.tsx` to add the chart above the table — leave that area alone, do NOT pre-stub a chart placeholder.
  - All calculator-port code (coast fire, mortgage, math lib, calculator components).
  - `mockup/`, legacy plans.

- **Prior step context**: Step 5 added the `accounts` table, the `Account` SQLAlchemy model, `AccountResponse` Pydantic schema, the `transactions.account_id` FK, the `/api/accounts` CRUD router, an Accounts page, and an Accounts sidebar entry. Trust `docs/handoff/step-5-accounts-foundation.md` over this description for exact field names and shapes.

- **MUST follow the pattern in**:
  - `backend/app/models/transaction.py` — for `account_id` FK + `account` relationship pattern (apply the same to `BalanceSnapshot.account_id`).
  - `backend/app/routers/category_router.py` — for the FastAPI router shape.
  - `backend/app/schemas/category.py` — for Pydantic schema layout.
  - `backend/tests/test_transaction_api.py` — for FastAPI TestClient + sqlite fixture flow.
  - The step 5 frontend Accounts page (just created in `frontend/src/pages/Accounts.tsx`) — for shadcn `Table` + page layout conventions.
  - The step 5 sidebar nav-item entry — match its shape exactly when adding "Net Worth".

- **Follow the pattern in**:
  - SQLAlchemy 2.x SQLite `on_conflict_do_update` docs — use `from sqlalchemy.dialects.sqlite import insert as sqlite_insert` and `sqlite_insert(BalanceSnapshot).values(...).on_conflict_do_update(index_elements=['account_id', 'as_of_date'], set_=...)`.

- **Do not — name the owning step**:
  - Do not implement `net_worth_service`, the `/api/net-worth?start&end` time-series route, the `NetWorthChart` component, the `DateRangePicker` component, or any aggregation logic — that is step 7.
  - Do not pre-stub a chart placeholder on `NetWorth.tsx` — leave the chart area completely absent. Step 7 will insert it.

- **If unclear, stop**:
  - If the on-conflict upsert behaves oddly under SQLite (some SQLAlchemy versions vary), ask rather than fall back to a delete-then-insert pattern.
  - If step 5's handoff doesn't make clear what `AccountType` enum values are exactly named (string vs Python enum), ask before importing.

- **Done when**:
  - All of plan 06's Acceptance Criteria checkboxes are marked complete in the plan file.
  - `make migrate` applies the new migration cleanly on top of step 5's migration.
  - `make test` passes including the new `test_snapshot_batch_api`.
  - `make lint` passes.
  - `cd frontend && npm run build && npm test -- --run` succeeds.
  - Manual smoke (orchestrator may run): `make dev-backend` + `make dev-frontend` → create two accounts via Accounts page → navigate to Net Worth → click Snapshot today → enter balances → save → see them in the latest-balance table → re-enter for the same date → table updates.

- **Handoff**: Write `docs/handoff/step-6-snapshot-entry.md` recording:
  - Final `BalanceSnapshot` model field names and types (especially `source` column type — string with CHECK or SQLAlchemy Enum).
  - Alembic revision hash + filename for the snapshots migration.
  - The exact `LatestBalanceResponse` Pydantic shape and the `/api/net-worth/latest` route URL.
  - The `snapshots_router` file structure — where step 7 should insert the time-series route.
  - The `frontend/src/api/snapshots.ts` exports — step 7 will append `getNetWorthSeries` here.
  - The `NetWorth.tsx` page structure — exactly where step 7 should insert the chart (above the latest-balance table) and the existing layout markers (e.g., heading, "Snapshot today" button location).

**Stay within your plan's scope. If you see an improvement that belongs to a later step, leave it.**

**Gate (run from repo root)**:

```
make test && make lint && (cd frontend && npm run build && npm test -- --run)
```

**Interface gate** (orchestrator runs after step 6 before launching step 7):

- [ ] `BalanceSnapshot.__table__.c` includes: `id, account_id, as_of_date, balance, source, notes, created_at, updated_at`.
- [ ] A unique constraint on `(account_id, as_of_date)` exists (`grep` the migration file or reflect the table).
- [ ] After `make dev-backend`: `curl -s localhost:8000/api/net-worth/latest` returns a JSON array of `{account_id, account_name, account_type, balance, as_of_date}` rows.
- [ ] `routers/snapshots_router.py` exists and contains `POST /snapshots/batch` and `GET /net-worth/latest`.

If any check fails, return to step 6 for fixes.

---

## Step 7 — Net worth chart

**Plan**: `docs/plans/2026-05-06-07-net-worth-chart.md`

**Agent briefing**:

- **Context sources** (orchestrator reads these):
  - `docs/handoff/step-5-accounts-foundation.md` (Account schema)
  - `docs/handoff/step-6-snapshot-entry.md` (BalanceSnapshot + router structure — load-bearing)
  - `docs/specs/2026-05-06-02-balance-snapshots.md` §"Backend — Net worth aggregation", §"API — GET /net-worth?start_date=&end_date=", §"Frontend — Net Worth page" (chart portion)
  - `backend/app/services/stats_service.py` (aggregation service exemplar)
  - `backend/app/routers/stats_router.py` (read-only aggregation router exemplar)
  - `backend/app/routers/snapshots_router.py` (just created — the file step 7 appends to)
  - `backend/app/schemas/balance_snapshot.py` (just created — the file step 7 appends to)
  - `backend/tests/test_stats_api.py` and `backend/tests/test_forecast.py` (service-level test exemplars)
  - `frontend/src/api/snapshots.ts` (just created — the file step 7 appends to)
  - `frontend/src/pages/NetWorth.tsx` (just created — the file step 7 modifies)
  - Existing Recharts usage in `frontend/src/components/calculators/charts/ProjectionLineChart.tsx` and `frontend/src/pages/CoastFire.tsx` / `frontend/src/pages/Mortgage.tsx` (style/theme reference). NOTE: do NOT reuse `ProjectionLineChart` directly unless its props happen to fit; net worth has different needs (date-axis, currency tooltips, range picker integration) — write `NetWorthChart.tsx` as a new wrapper.

- **Read first**: `docs/plans/2026-05-06-07-net-worth-chart.md`
- **Context**: <orchestrator pastes the step 6 handoff in full, the existing `snapshots_router.py` structure, the existing `NetWorth.tsx` markup, and the calculator chart pattern as styling reference>

- **Owns**: see plan §"Owns" — new `services/net_worth_service.py`, append-only edits to `schemas/balance_snapshot.py`, `routers/snapshots_router.py`, `frontend/src/api/snapshots.ts`, modifications to `frontend/src/pages/NetWorth.tsx`, new `NetWorthChart.tsx` and `DateRangePicker.tsx` components, new `tests/test_net_worth_service.py`.

- **Must not touch**:
  - Any model file, any migration. Step 7 adds zero schema.
  - `backend/app/routers/account_router.py`, `backend/app/services/import_service.py` — owned by step 5.
  - `POST /api/snapshots/batch` and `GET /api/net-worth/latest` route handlers — owned by step 6. Step 7 must NOT alter their signatures or behavior.
  - The latest-balance table render in `NetWorth.tsx` — step 7 only adds the chart section above it; do not refactor the existing table.
  - All calculator-port code.
  - `mockup/`, legacy plans.

- **Prior step context**:
  - Step 5: `accounts` table + Account model + `/api/accounts` CRUD + Accounts page.
  - Step 6: `balance_snapshots` table + BalanceSnapshot model + `snapshots_router.py` (with `POST /snapshots/batch` and `GET /net-worth/latest`) + Net Worth page (table only) + batch entry modal + sidebar entry.
  - Trust `docs/handoff/step-6-snapshot-entry.md` over this description for exact router structure and frontend file shapes.

- **MUST follow the pattern in**:
  - `backend/app/services/stats_service.py` for read-only aggregation service style.
  - `backend/app/routers/stats_router.py` for date-range query-param endpoint style.
  - `backend/tests/test_stats_api.py` (or `test_forecast.py`) for service tests with synthetic fixtures.

- **Follow the pattern in**:
  - Calculator-port chart components (`frontend/src/components/calculators/charts/ProjectionLineChart.tsx`, `ComparisonLineChart.tsx`) — match stroke colors via `hsl(var(--chart-1))`, axis label styling, tooltip currency formatting, monospace tick labels via Tailwind `font-mono`. Theme tokens are in `frontend/src/index.css`.

- **Do not — name the owning step**:
  - Do not modify any model, migration, or `POST /snapshots/batch` / `GET /net-worth/latest` handler — those belong to steps 5/6.
  - Do not refactor `NetWorth.tsx`'s existing table render — only add a chart section above it.

- **If unclear, stop**:
  - If LVCF semantics are ambiguous for an account that becomes archived mid-history, ask. The plan says archived accounts are excluded entirely; verify before writing the test.
  - If the analyzer's chart theme tokens aren't obvious from `frontend/src/index.css`, ask rather than introduce new color tokens.

- **Done when**:
  - All of plan 07's Acceptance Criteria checkboxes are marked complete in the plan file.
  - `make test` passes including `test_net_worth_service` covering all listed scenarios.
  - `make lint` passes.
  - `cd frontend && npm run build && npm test -- --run` succeeds.
  - Manual smoke: with snapshots in the DB from step 6's smoke run, Net Worth page renders a single line chart, the line tracks correctly, the range picker quick-buttons (30d / 90d / 1y / all) work, hover tooltips show formatted currency, empty-DB case shows the empty-state message.

- **Handoff**: Write `docs/handoff/step-7-net-worth-chart.md` recording:
  - Final `net_worth_service.compute_time_series` signature.
  - The `NetWorthPoint` schema shape.
  - Confirmation that the existing latest-balance table render was untouched.
  - Any chart-styling choices that future plans should mirror (color tokens used, tick formatter conventions).

**Stay within your plan's scope. If you see an improvement that belongs to a later step, leave it.**

**Gate (run from repo root)**:

```
make test && make lint && (cd frontend && npm run build && npm test -- --run)
```

---

## Interface gates summary

- [ ] **After step 4**: calculator port closed — `make test && make lint && (cd frontend && npm run build && npm test -- --run)` passes; `MortgageScenarioResponse` exposed; both calc routers in `app/main.py`.
- [ ] **After step 5**: `Account` model + table in place; `Transaction.account_id` FK exists; `Transaction.account` string column gone; `/api/accounts` returns seeded rows.
- [ ] **After step 6**: `BalanceSnapshot` table + unique `(account_id, as_of_date)` constraint; `POST /api/snapshots/batch` and `GET /api/net-worth/latest` mounted in `snapshots_router.py`.

## HITL checkpoints

None — all four steps are AFK.

## Completion criteria

- All four plan files (04, 05, 06, 07) have every Acceptance Criterion checkbox marked complete.
- `make test && make lint && (cd frontend && npm run build && npm test -- --run)` passes from a clean working tree after step 7.
- Handoffs `step-4-mortgage.md`, `step-5-accounts-foundation.md`, `step-6-snapshot-entry.md`, `step-7-net-worth-chart.md` exist in `docs/handoff/`.
- Manual end-to-end smoke (orchestrator runs once after step 7):
  - `make dev-backend` + `make dev-frontend`. Open `localhost:5173`.
  - **Mortgage**: navigate to **Mortgage** in sidebar — edit inputs, see live computeds + tooltips, save scenario, refresh, scenario reloads. Verify crossover dot appears on equity-vs-investment chart with default-ish inputs.
  - **Accounts**: create two accounts via the Accounts page — verify they appear in the table and persist on refresh.
  - **Net Worth (table)**: navigate to **Net Worth** — click "Snapshot today", enter balances for both accounts, save. Latest-balance table shows both rows. Re-enter for the same date — table updates (replace semantics).
  - **Net Worth (chart)**: chart renders above the table with a single line. Range picker quick-buttons (30d / 90d / 1y / all) work. Hover tooltips show formatted currency. Archive an account — verify it disappears from both the table and chart aggregation.

## Notes for the orchestrator

- Strict serial. Each step's gate runs in the main working tree before the next launches. No worktree merge required.
- If a gate fails, stop and report. Recovery is the user's call: typically `git status` to see what was written, fix forward, or `git restore` / `git stash` if rolling back is cleaner.
- Each step appends a single-line include to `backend/app/main.py` and a single-line export to `backend/app/models/__init__.py`. Because steps run serial, there's no conflict — just verify both lines accumulate correctly.
- Sidebar nav-item array: step 1 of the calculator port set the canonical 8-entry shape (Overview, Transactions, Subscriptions, Budget, Forecast, Payments, Coast FIRE, Mortgage). Step 5 inserts **Accounts** near the bottom; step 6 inserts **Net Worth** near the top (just under Overview per spec). Final order ends up roughly: Overview, Net Worth, Transactions, Subscriptions, Budget, Forecast, Payments, Coast FIRE, Mortgage, Accounts. Don't worry about visual order matching exactly — match what each plan specifies.
- Legacy `docs/plans/frontend.md`, `backend.md`, `todo.md`, `spec-backport.md` are pre-pipeline plans for unrelated analyzer features. Do not touch. Not part of this orchestration.
- The four mortgage-tooltip formatters that the spec listed as "PLANNED" are already in source — step 2 ported them. Step 4 consumes only. Don't waste cycles trying to write them.
