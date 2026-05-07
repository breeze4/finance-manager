# Mortgage Payoff End-to-End

## Parent spec

`docs/specs/2026-05-06-01-calculator-port.md`

## What to build

A complete, persistent Mortgage Payoff calculator: SQLite-backed scenarios with full CRUD mirroring the Coast FIRE pattern from plan 3, a React page with all inputs, all ten result tiles each backed by a math tooltip, three charts (balance over time, cumulative interest comparison, mortgage equity vs investment value with crossover annotation), and a working scenario picker.

This plan also adds the four mortgage-specific tooltip formatters that are listed as "PLANNED" in the calculator project but don't yet exist: `formatAmortizationSteps`, `formatInvestmentCompoundingSteps`, `formatTaxCalculationSteps`, `formatPayoffComparisonSteps`. These are net-new code, not ports.

End-to-end vertical slice: schema → migration → API → Pydantic schema → React Query hook → page → component composition → tests at every layer. By the end of this plan, a user can navigate to `/mortgage`, edit inputs, see live computed results and tooltips, save scenarios, switch between scenarios, and have data persist via the backend.

## Type

AFK

## Blocked by

- Blocked by `2026-05-06-01-frontend-shell-calculator-routes.md`
- Blocked by `2026-05-06-02-shared-calculator-infra.md`

Soft dependency on `2026-05-06-03-coast-fire-end-to-end.md` — Plan 3 establishes the canonical CRUD/scenario pattern this plan mirrors. Plan 4 can technically start in parallel, but reviewing Plan 3's merged code first will save churn.

## User stories addressed

From the parent spec:

- §"Calculators → Mortgage Payoff" (entire subsection — all 10 result tiles, three charts)
- §"Persistence → Multi-scenario model" (Mortgage half)
- §"Persistence → Data model → mortgage_scenarios"
- §"Persistence → API endpoints" (Mortgage endpoints)
- Mortgage tooltip system (called out in spec; net-new formatter functions)

## Acceptance criteria

### Backend

- [x] `mortgage_scenarios` table created via Alembic migration. Columns: `id`, `name` (unique), `is_active` (bool), `principal`, `years_left`, `interest_rate`, `monthly_payment`, `additional_monthly_payment`, `lump_sum_payment`, `investment_return_rate`, `investment_tax_rate`, `created_at`, `updated_at`
- [x] Partial unique index enforces at most one row with `is_active = true` (matching Coast FIRE pattern)
- [x] `app/models/mortgage_scenario.py` SQLAlchemy model
- [x] `app/schemas/mortgage_scenario.py` Pydantic models: `MortgageScenarioCreate`, `MortgageScenarioUpdate`, `MortgageScenarioResponse`
- [x] `app/routers/mortgage_router.py` mounted at `/api/calculators/mortgage/scenarios` with the same 7 endpoints as Coast FIRE (list, create, active, get, update, activate, delete)
- [x] Router registered in `app/main.py`
- [x] Backend tests in `backend/tests/test_mortgage_router.py`: CRUD, activate-uniqueness, name uniqueness, 404s, validation errors

### Frontend

- [x] `frontend/src/api/mortgage.ts` — typed fetch client for the endpoints
- [x] `frontend/src/hooks/useMortgageScenario.ts` — React Query hook (mirrors `useCoastFireScenario`)
- [x] `frontend/src/pages/Mortgage.tsx` (replaces placeholder from plan 1) renders:
  - `ScenarioPicker` wired to backend via the hook
  - Input form with all 8 input fields (principal, yearsLeft, interestRate, monthlyPayment, additionalMonthlyPayment, lumpSumPayment, investmentReturnRate, investmentTaxRate)
  - All 10 result tiles, each wrapping its computed value in `MathTooltip` with formulas, value substitution, and educational copy
- [x] **New tooltip formatters** added to `frontend/src/lib/math/formatters.ts` (or `mathFormatters.ts`):
  - `formatAmortizationSteps(principal, monthlyPayment, monthlyRate, sampleMonths)` — shows the iterative payment breakdown for the first N months
  - `formatInvestmentCompoundingSteps(lumpSum, monthlyAmount, monthlyRate, months)` — compound growth with monthly contributions
  - `formatTaxCalculationSteps(grossReturn, totalInvested, taxRate)` — net-after-tax computation
  - `formatPayoffComparisonSteps(baseInterest, acceleratedInterest, investmentNetBenefit)` — side-by-side strategy comparison
- [x] Charts on the page:
  - Balance-over-time chart (standard vs accelerated lines) using `ComparisonLineChart`
  - Cumulative interest comparison chart using `ComparisonLineChart`
  - Equity-vs-investment chart using `ComparisonLineChart` with `<ReferenceDot>` at crossover month
- [x] Validation errors render per-field; Save disabled when invalid
- [x] Manual save button + dirty-state indicator on scenario picker
- [x] First-run behavior: if `GET /active` 404s, page seeds inputs with sensible defaults (e.g. `principal: 300000`, `yearsLeft: 30`, `interestRate: 6.5`, `monthlyPayment: 1896`, `additionalMonthlyPayment: 0`, `lumpSumPayment: 0`, `investmentReturnRate: 7`, `investmentTaxRate: 20`) and exposes a "Save as scenario" action. Source defaults can be reviewed in `legacy-vue-calc/src/stores/mortgagePayoff.ts`
- [x] Frontend tests:
  - Hook tests
  - Component test for `Mortgage.tsx` rendering with seeded defaults
  - Tests for the 4 new tooltip formatters (input → expected output strings)
- [x] No regression: math test floor still passes (171 + new formatter tests), backend full test suite still green, `npm run build` succeeds

## Owns

### Backend

- `backend/app/models/mortgage_scenario.py` — new file
- `backend/app/models/__init__.py` — add `MortgageScenario` import
- `backend/app/schemas/mortgage_scenario.py` — new file
- `backend/app/routers/mortgage_router.py` — new file
- `backend/app/services/mortgage_scenario_service.py` — new file (if extracted; match pattern set in plan 3)
- `backend/app/main.py` — single-line addition: include the mortgage router (the only line this plan adds — do not modify other lines)
- `backend/alembic/versions/<new_revision>_add_mortgage_scenarios.py` — new migration
- `backend/tests/test_mortgage_router.py` — new file

### Frontend

- `frontend/src/api/mortgage.ts` — new
- `frontend/src/hooks/useMortgageScenario.ts` — new
- `frontend/src/pages/Mortgage.tsx` — replaces placeholder from plan 1
- `frontend/src/components/calculators/MortgageForm.tsx` — input groupings
- `frontend/src/components/calculators/MortgageResults.tsx` — result tiles + charts
- `frontend/src/lib/math/formatters.ts` — **adds** the four new mortgage formatter functions to the file owned by plan 2. This is the only file from plan 2's scope this plan modifies, and only by adding new exports; existing functions stay untouched
- `frontend/src/lib/math/__tests__/formatters.test.ts` (or matching file) — add tests for the 4 new formatters

## Must not touch

- Plan 3's coast-fire backend files (`coast_fire_scenario.py`, `coast_fire_router.py`, `coast_fire_service.py`, schemas, migration, tests) — owned by plan 3
- Plan 3's frontend files (`api/coastFire.ts`, `hooks/useCoastFireScenario.ts`, `pages/CoastFire.tsx`, `components/calculators/CoastFire*.tsx`) — owned by plan 3
- All non-calculator analyzer code (transactions, budget, forecast, etc.) — out of scope
- `frontend/src/lib/math/` other than `formatters.ts` — owned by plan 2; consume don't modify
- `frontend/src/components/calculators/MathTooltip.tsx`, `ScenarioPicker.tsx`, `charts/*` — owned by plan 2
- `frontend/src/components/AppSidebar.tsx`, `Layout.tsx`, `TopBar.tsx` — owned by plan 1
- `mockup/` — leave intact
- Existing math functions in `lib/math/mortgage.ts` (already ported in plan 2) — consume don't modify

## Defines interfaces

- `MortgageScenarioResponse` Pydantic schema in `backend/app/schemas/mortgage_scenario.py` — first consumer is `frontend/src/api/mortgage.ts` in this plan
- API contract `/api/calculators/mortgage/scenarios` endpoints
- The 4 new formatter functions added to `frontend/src/lib/math/formatters.ts` — consumed only by `pages/Mortgage.tsx` in this plan, but available for future calculator additions

## Pattern exemplar

- **MUST follow the pattern in**: `backend/app/models/coast_fire_scenario.py` (created by plan 3) — model layout, column types, unique constraints, partial-index strategy
- **MUST follow the pattern in**: `backend/app/routers/coast_fire_router.py` (created by plan 3) — router URL prefix style, endpoint shape, activate-uniqueness handling, error responses
- **MUST follow the pattern in**: `backend/app/schemas/coast_fire_scenario.py` (created by plan 3) — Create/Update/Response separation
- **MUST follow the pattern in**: `backend/tests/test_coast_fire_router.py` (created by plan 3) — test layout
- **MUST follow the pattern in**: `frontend/src/api/coastFire.ts`, `frontend/src/hooks/useCoastFireScenario.ts`, `frontend/src/pages/CoastFire.tsx` (created by plan 3) — frontend conventions for API client, React Query hook, page composition
- **Follow the pattern in**: `../legacy-vue-calc/src/views/MortgagePayoffCalculator.vue` — page layout, field grouping, copy, sequence of result tiles. Translate Vue → React; preserve UX
- **Follow the pattern in**: `../legacy-vue-calc/src/utils/mathFormatters.ts` — formatter style and signature for the 4 new mortgage formatters (return type, currency/percent/multiplier formatting, intermediate-step strings)

If anything in plan 3's chosen patterns conflicts with the spec, raise it before mirroring.

## Tasks

### Backend

- [x] Define `MortgageScenario` SQLAlchemy model
- [x] Add to `app/models/__init__.py`
- [x] Generate Alembic migration: `make migrate-new` "add mortgage scenarios"; ensure partial unique index on `is_active`
- [x] Apply migration: `make migrate`
- [x] Define Pydantic schemas (Create / Update / Response)
- [x] Implement `mortgage_router.py` mirroring the Coast FIRE router endpoints
- [x] Register router in `app/main.py`
- [x] Write `test_mortgage_router.py` mirroring Coast FIRE tests
- [x] Run full backend suite — no regressions

### Frontend

- [x] Implement the 4 new tooltip formatters in `lib/math/formatters.ts`. Each returns a multi-line string showing inputs → intermediate steps → result, in the same style as the existing FV / present-value / Fisher-equation formatters
- [x] Write tests for the 4 new formatters: representative input cases producing expected step strings (use snapshot tests OR explicit string assertions — match the existing formatters test file)
- [x] Build `api/mortgage.ts` — typed fetch wrappers
- [x] Build `hooks/useMortgageScenario.ts` — React Query hooks
- [x] Build `components/calculators/MortgageForm.tsx` — input fields with validation surfacing
- [x] Build `components/calculators/MortgageResults.tsx` — 10 result tiles (each wrapped in `MathTooltip`), 3 charts (balance, cumulative interest, equity-vs-investment)
- [x] Implement `pages/Mortgage.tsx` composition: `ScenarioPicker` + `MortgageForm` + `MortgageResults`. Loads active scenario, falls back to defaults
- [x] Validation + Save flow + first-run path mirroring Coast FIRE
- [x] Hook tests + page rendering test
- [x] Manual smoke: open browser, click Mortgage in sidebar, verify computeds update live, save a scenario, refresh page, scenario reloads, crossover dot appears on equity-vs-investment chart when applicable
- [x] Verify `make test` (backend) and `npm test` (frontend) both green

## Implementation notes

- Source for tile copy and field grouping: `../legacy-vue-calc/src/views/MortgagePayoffCalculator.vue` (643 lines) and the calculator's MATH.md. Translate verbatim, don't paraphrase.
- Source for default input values: `../legacy-vue-calc/src/stores/mortgagePayoff.ts` (the `ref()` initializers in the Pinia store).
- The "Strategy Recommendation" tile uses a comparison: if `interestSaved > investmentNetBenefit` → recommend `'payoff'`, else `'invest'`. Show the comparison numbers in the tooltip.
- The crossover detection on the equity-vs-investment chart already lives in the adapter built in plan 2 (`investmentComparisonToRecharts`). This plan consumes the `crossoverMonth` value to render `<ReferenceDot>` — do not reimplement detection here.
- For the new amortization formatter: don't dump the full payment schedule — show the formula and the first ~3 months as illustrative steps, then "..." and the final result. Mirrors how the existing FV formatter shows an illustrative single-step calculation.
- Tax-rate input is a percent (e.g. `20` for 20%). The math library expects a decimal (e.g. `0.20`). Confirm the conversion happens at the input boundary (form → store/state), not deep in the math; this is the calculator-project's existing convention.
- Once both calculator pages exist, manually verify the sidebar navigation and that returning to a calculator page still loads the active scenario (React Query cache hit on mount).
