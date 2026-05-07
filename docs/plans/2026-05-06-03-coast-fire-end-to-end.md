# Coast FIRE End-to-End

## Parent spec

`docs/specs/2026-05-06-01-calculator-port.md`

## What to build

A complete, persistent Coast FIRE calculator: SQLite-backed scenarios with full CRUD, a React page with all inputs, all eight result tiles each backed by a math tooltip, two charts (projection + required-savings-by-age), and a working scenario picker.

End-to-end vertical slice: schema → migration → API → schema (Pydantic) → React Query hook → page → component composition → tests at every layer. By the end of this plan, a user can navigate to `/coast-fire`, edit inputs, see live computed results and tooltips, save scenarios, switch between scenarios, and have data persist across browser refreshes via the backend.

## Type

AFK

## Blocked by

- Blocked by `2026-05-06-01-frontend-shell-calculator-routes.md`
- Blocked by `2026-05-06-02-shared-calculator-infra.md`

## User stories addressed

From the parent spec:

- §"Calculators → Coast FIRE" (entire subsection — all 8 result tiles, both charts, bidirectional input sync)
- §"Persistence → Multi-scenario model" (Coast FIRE half)
- §"Persistence → Data model → coast_fire_scenarios"
- §"Persistence → API endpoints" (Coast FIRE endpoints)
- §"Persistence → Migration strategy" (first-run UX seeds defaults)
- §"Validation & error display"

## Acceptance criteria

### Backend

- [x] `coast_fire_scenarios` table created via Alembic migration. Columns: `id`, `name` (unique), `is_active` (bool), `current_age`, `retirement_age`, `current_savings`, `expected_return_rate`, `target_retirement_amount`, `monthly_expenses`, `yearly_expenses`, `withdrawal_rate`, `inflation_rate`, `use_real_returns` (bool), `last_edited_field` (string enum: 'target' | 'monthly' | 'yearly'), `created_at`, `updated_at`
- [x] Partial unique index enforces at most one row with `is_active = true`
- [x] `app/models/coast_fire_scenario.py` SQLAlchemy model
- [x] `app/schemas/coast_fire_scenario.py` Pydantic models: `CoastFireScenarioCreate`, `CoastFireScenarioUpdate`, `CoastFireScenarioResponse`
- [x] `app/routers/coast_fire_router.py` mounted at `/api/calculators/coast-fire/scenarios` with endpoints:
  - `GET /` list all
  - `POST /` create (rejects duplicate name)
  - `GET /active` returns the active scenario, or 404 if none
  - `GET /{id}` fetch one
  - `PUT /{id}` update
  - `POST /{id}/activate` flip `is_active` (atomic — clears flag on others first)
  - `DELETE /{id}` delete
- [x] Router registered in `app/main.py`
- [x] `app/services/coast_fire_service.py` (or inline in router for simplicity — match analyzer convention) handles the activate-uniqueness invariant
- [x] Backend tests in `backend/tests/test_coast_fire_router.py`: CRUD, activate-uniqueness, name uniqueness, 404s, validation errors

### Frontend

- [x] `frontend/src/api/coastFire.ts` — typed fetch client for the endpoints
- [x] `frontend/src/hooks/useCoastFireScenario.ts` — React Query hook: `useScenarios()`, `useActiveScenario()`, `useCreateScenario()`, `useUpdateScenario()`, `useActivateScenario()`, `useDeleteScenario()`. Uses standard React Query invalidation patterns
- [x] `frontend/src/pages/CoastFire.tsx` (replaces placeholder from plan 1) renders:
  - `ScenarioPicker` (from plan 2) wired to backend via the hook
  - Input form with all 10 input fields plus `useRealReturns` toggle and bidirectional sync between `monthlyExpenses` ⇄ `yearlyExpenses` ⇄ `targetRetirementAmount` honoring `lastEditedField`
  - All 8 result tiles, each wrapping its computed value in `MathTooltip` with the formulas, value substitution, and educational copy carried over from `legacy-vue-calc/src/views/CoastFireCalculator.vue`
  - "Coast FIRE Number at current age" tile
  - "Coast FIRE Age" shown only when `isCoastFireReady === false`
  - "Monthly Spending Available" shown only when `targetRetirementAmount > 0`
  - "Real Return Rate" tile shown only when `useRealReturns && inflationRate > 0`
- [x] Charts on the page:
  - Projection chart (current age → retirement age, target reference line)
  - Required-savings-by-age chart
- [x] Validation errors render per-field; submit/save disabled when invalid
- [x] Save UX: manual save button + dirty-state indicator on the scenario picker; debounced (~300ms) auto-recompute of computeds (no auto-save in V1)
- [x] First-run behavior: if `GET /active` 404s, page seeds inputs with calculator-project defaults (`currentAge: 30`, `retirementAge: 65`, `currentSavings: 50000`, `expectedReturnRate: 7`, `targetRetirementAmount: 1000000`, `withdrawalRate: 4`, `inflationRate: 0`, `useRealReturns: false`) and exposes a "Save as scenario" action
- [x] Frontend tests:
  - Hook tests: load active, save, switch active (mock fetch / msw)
  - Component test for `CoastFire.tsx` rendering with seeded defaults, computeds reflect inputs, tooltip content is non-empty
- [x] No regression: math test floor still passes (171), backend full test suite still green, `npm run build` succeeds

## Owns

### Backend

- `backend/app/models/coast_fire_scenario.py` — new file
- `backend/app/models/__init__.py` — add `CoastFireScenario` import
- `backend/app/schemas/coast_fire_scenario.py` — new file
- `backend/app/routers/coast_fire_router.py` — new file
- `backend/app/services/coast_fire_service.py` — new file (if extracted)
- `backend/app/main.py` — add router include for the new router (only this single line addition)
- `backend/alembic/versions/<new_revision>_add_coast_fire_scenarios.py` — new migration
- `backend/tests/test_coast_fire_router.py` — new file
- `backend/tests/conftest.py` — only if new fixture is needed for scenarios; prefer reusing existing DB fixtures

### Frontend

- `frontend/src/api/coastFire.ts` — new
- `frontend/src/hooks/useCoastFireScenario.ts` — new
- `frontend/src/pages/CoastFire.tsx` — replaces placeholder from plan 1
- `frontend/src/components/calculators/CoastFireForm.tsx` — input groupings (extracted for testability)
- `frontend/src/components/calculators/CoastFireResults.tsx` — result tiles + charts
- `frontend/src/pages/__tests__/CoastFire.test.tsx`, `frontend/src/hooks/__tests__/useCoastFireScenario.test.ts` — new test files

## Must not touch

- `backend/app/models/mortgage_scenario.py`, `backend/app/routers/mortgage_router.py`, `backend/app/schemas/mortgage_scenario.py` — owned by plan `2026-05-06-04-mortgage-end-to-end.md`
- `backend/alembic/versions/<future>_add_mortgage_scenarios.py` — owned by plan 4
- All other backend models, routers, services (transactions, budget, forecast, payments, subscriptions, classification, imports) — out of scope
- `frontend/src/api/mortgage.ts`, `frontend/src/hooks/useMortgageScenario.ts`, `frontend/src/pages/Mortgage.tsx`, `frontend/src/components/calculators/Mortgage*.tsx` — owned by plan 4
- `frontend/src/lib/math/`, `frontend/src/components/calculators/MathTooltip.tsx`, `ScenarioPicker.tsx`, `charts/*` — owned by plan 2 (consume them, don't modify)
- `frontend/src/components/AppSidebar.tsx`, `Layout.tsx`, `TopBar.tsx` — owned by plan 1
- `mockup/` — leave intact

## Defines interfaces

- `CoastFireScenarioResponse` Pydantic schema in `backend/app/schemas/coast_fire_scenario.py` — must match the TypeScript type in `frontend/src/api/coastFire.ts`. Plan 4 should mirror this contract style for mortgage.
- API contract `/api/calculators/coast-fire/scenarios` endpoints — Plan 4 mirrors the URL/HTTP shape for `/api/calculators/mortgage/scenarios`
- `useCoastFireScenario` hook signature — Plan 4 mirrors with `useMortgageScenario`

These cross-plan contracts mean Plan 4 should treat Plan 3's files as the canonical pattern.

## Pattern exemplar

- **MUST follow the pattern in**: `backend/app/models/budget.py` — SQLAlchemy 2.0 `Mapped`/`mapped_column` style, `created_at`/`updated_at` columns with `server_default=func.now()` and `onupdate=func.now()`, `__table_args__` for unique constraints
- **MUST follow the pattern in**: `backend/app/routers/budget_router.py` — APIRouter with `/api/...` prefix and tag, `Depends(get_db)` injection, response_model use, schema import grouping
- **MUST follow the pattern in**: `backend/alembic/versions/b762a8a2c851_initial_schema.py` — Alembic migration shape (use `alembic revision --autogenerate` via `make migrate-new`)
- **MUST follow the pattern in**: `backend/tests/test_budget_crud.py` — pytest + FastAPI TestClient, fixture conventions from `conftest.py`
- **Follow the pattern in**: `backend/app/schemas/budget.py` — Pydantic `*Create`/`*Update`/`*Response` separation
- **Follow the pattern in**: `mockup/src/components/ui/form.tsx`, mockup form pages — input field layout, `react-hook-form` is in mockup deps but **not required**; using plain controlled inputs is fine
- **Follow the pattern in**: `../legacy-vue-calc/src/views/CoastFireCalculator.vue` — page layout, field grouping, copy, tooltip placement, sequencing of result tiles. Translate Vue → React; preserve UX

## Tasks

### Backend

- [x] Define `CoastFireScenario` SQLAlchemy model in `app/models/coast_fire_scenario.py` with all columns + unique constraint on `name`
- [x] Add `CoastFireScenario` to `app/models/__init__.py` exports
- [x] Generate Alembic migration: `make migrate-new` with message "add coast fire scenarios"; review/edit autogenerated SQL; add the partial unique index for `is_active = true` (SQLite supports `CREATE UNIQUE INDEX ... WHERE`)
- [x] Apply migration locally: `make migrate`
- [x] Define Pydantic schemas: `CoastFireScenarioCreate` (no id, no timestamps, no `is_active`), `CoastFireScenarioUpdate` (all fields optional), `CoastFireScenarioResponse` (all fields)
- [x] Implement `coast_fire_router.py` with all 7 endpoints; activate endpoint clears `is_active` on others in a single transaction
- [x] Register router in `app/main.py` (one-line addition)
- [x] Write `test_coast_fire_router.py`: CRUD round trip, activate-uniqueness invariant (after activating B, A's flag is false), name uniqueness rejected with 409 (or 400), 404 paths
- [x] Run full backend suite — no regressions

### Frontend

- [x] Add `react-hook-form` and `zod` to `frontend/package.json` if forms benefit from them; otherwise keep plain controlled state (kept plain controlled state)
- [x] Build `api/coastFire.ts` — typed fetch wrappers around the 7 endpoints
- [x] Build `hooks/useCoastFireScenario.ts` — React Query hooks with cache keys keyed on scenario id and 'active'
- [x] Build `components/calculators/CoastFireForm.tsx` — input fields with bidirectional sync logic (last-edited-field tracking)
- [x] Build `components/calculators/CoastFireResults.tsx` — eight result tiles (each wrapped in `MathTooltip` with the matching formula, substitution, and educational copy from the calculator project's Vue view), plus the two charts using `ProjectionLineChart` and a basic `LineChart` for required-savings
- [x] Implement `pages/CoastFire.tsx` composition: `ScenarioPicker` + `CoastFireForm` + `CoastFireResults`. Loads active scenario, falls back to defaults
- [x] Validation: surface field errors from `validateCoastFireInputs`; disable Save when invalid
- [x] Save flow: explicit Save button posts to API; on success, invalidate React Query caches; clear dirty state
- [x] First-run path: handle 404 from `/active` with seeded defaults + "Save as scenario" CTA
- [x] Write hook tests using msw (or fetch mock)
- [x] Write `CoastFire.test.tsx` rendering test with seeded defaults
- [ ] Manual smoke: open browser, click Coast FIRE in sidebar, verify computeds update live, save a scenario, refresh page, scenario reloads (skipped — out of scope for AFK gate, covered by component+API tests)
- [x] Verify `make test` (backend) and `npm test` (frontend) both green

## Implementation notes

- Result tiles and tooltip content should be ported from `../legacy-vue-calc/src/views/CoastFireCalculator.vue` — copy the formula text, value substitution templates, and educational explanations verbatim into the React tile components. Don't paraphrase.
- The bidirectional input sync is currently a Pinia computed in `legacy-vue-calc/src/stores/coastFire.ts` — translate to a `useEffect` driven by `lastEditedField`, OR a controlled-input pattern that updates dependent fields on each input's `onChange`. Either is fine; keep the source's behavior (last-edited wins; if user edits target, monthly+yearly get re-derived; if user edits monthly, target+yearly get re-derived; etc.).
- For React Query cache keys: `['coast-fire', 'scenarios']`, `['coast-fire', 'scenarios', 'active']`, `['coast-fire', 'scenarios', id]`. Invalidate the appropriate keys after mutations.
- Activate-uniqueness in SQLite: use a partial unique index `CREATE UNIQUE INDEX ... ON coast_fire_scenarios(is_active) WHERE is_active = 1`. Alembic supports this via `op.create_index(..., postgresql_where=text("is_active = true"))` — for SQLite use `sqlite_where` or fall back to manual `op.execute(...)`. If autogenerate doesn't produce it, hand-edit the migration.
- `last_edited_field` is a small string enum. Persist as TEXT with a `CHECK` constraint or just plain TEXT — match analyzer's convention (the analyzer doesn't appear to use enum tables, so plain TEXT is fine).
- React Query setup is already in plan 1; don't re-add the provider.
- The page must respect the spec's "global filters do not apply" rule — the TopBar's date/account filters are hidden or no-op on this route. Plan 1 set this up; verify it still holds.
