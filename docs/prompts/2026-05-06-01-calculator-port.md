# Orchestration Prompt: Calculator Port (Coast FIRE + Mortgage Payoff)

## Project context

- Working directory: `.`
- Spec: `docs/specs/2026-05-06-01-calculator-port.md`
- Sibling source project (read-only reference): `../legacy-vue-calc/`
- Backend test: `make test`
- Backend lint: `make lint`
- Frontend build (after step 1): `cd frontend && npm run build`
- Frontend test (after step 1): `cd frontend && npm test -- --run`
- Migration apply: `make migrate`
- New migration: `make migrate-new`
- Handoff directory: `docs/handoff/` (create if needed)
- Plans directory: `docs/plans/`

## Orchestrator responsibilities

You are actively managing context between agents. Before launching each step:

1. Read the files listed under "Context sources" and include relevant sections in the agent's "Context" field.
2. If a previous step completed, read `docs/handoff/step-{N-1}-<step name>.md` and use it to fill in what changed (file paths created, key decisions, exact patterns set).
3. Run the gate commands in the working directory after each step. Do not proceed past a failing gate — report and stop.
4. Each step is one agent invocation, run sequentially. Agents write directly to the working tree.

Each plan is one agent. Do not split or combine plans.

## Execution plan (serial)

```
Step 1: Frontend shell + calculator routes        (no blockers)
   ↓
Step 2: Shared calculator infrastructure          (math lib, MathTooltip, charts, scenario picker)
   ↓
Step 3: Coast FIRE end-to-end                     (sets canonical pattern for step 4)
   ↓
Step 4: Mortgage Payoff end-to-end                (mirrors step 3)
```

All four steps are AFK. No HITL checkpoints.

---

### Step 1 — Frontend shell + calculator routes

**Plan**: `docs/plans/2026-05-06-01-frontend-shell-calculator-routes.md`

**Agent briefing**:

- **Context sources** (orchestrator reads these):
  - `docs/specs/2026-05-06-01-calculator-port.md` §"Frontend Architecture", §"Theming", §"Navigation & Routing"
  - `mockup/package.json` (to identify exactly which deps to cherry-pick)
  - `mockup/src/components/AppSidebar.tsx`, `Layout.tsx`, `TopBar.tsx`
  - `mockup/src/index.css` (theme tokens — dark teal)
  - `mockup/src/lib/utils.ts` (the `cn()` helper)
  - `mockup/vite.config.ts`, `mockup/tsconfig*.json` (config conventions)
  - `Makefile` (existing `dev-frontend` target)
- **Read first**: `docs/plans/2026-05-06-01-frontend-shell-calculator-routes.md`
- **Context**: <orchestrator pastes the cherry-pick targets, theme variables, and existing Makefile target before launch>
- **Owns**: `frontend/` (entire new directory) and a single-line check of `Makefile` if dev-frontend needs adjustment.
- **Must not touch**:
  - `mockup/` — leave intact for later plans to keep cherry-picking
  - `backend/`
  - `frontend/src/lib/math/`, `frontend/src/components/calculators/`, `frontend/src/api/`, `frontend/src/hooks/use*Scenario.ts`, `frontend/src/pages/CoastFire.tsx`/`Mortgage.tsx` beyond placeholder content — those are owned by steps 2/3/4
  - `docs/plans/frontend.md`, `docs/plans/backend.md`, `docs/plans/todo.md` (legacy)
- **Follow the pattern in**: `mockup/src/components/AppSidebar.tsx` (sidebar structure + collapse behavior + lucide icons), `mockup/src/index.css` (Tailwind + dark teal tokens), `mockup/vite.config.ts` (Vite proxy convention).
- **Do not** add: math library, MathTooltip, charts, scenario picker, calculator pages with real content, backend changes — those belong to steps 2/3/4.
- **Done when**:
  - `frontend/` exists with React 18 + Vite + TS scaffold; `make dev-frontend` starts Vite on `:5173`; proxy reaches `/api/health`.
  - Sidebar shows **Coast FIRE** (`TrendingUp` icon) and **Mortgage** (`Home` icon) at the bottom of the nav array; both routes render placeholder pages.
  - React Query provider wraps the app.
  - Dark teal theme applied globally; collapse/expand + collapsed-tooltips work.
  - `npm run build` succeeds with no TS errors.
  - All checkboxes in plan 01's Acceptance Criteria are marked complete in the plan file.
- **If unclear, stop**: ambiguity over which mockup deps to bring in — default to the minimum list in plan 01's Tasks. Do not pull in `embla-carousel`, `vaul`, `cmdk`, `react-hook-form`, `zod`, `react-day-picker`, etc.
- **Handoff**: write `docs/handoff/step-1-frontend-shell.md` recording: which Vite plugin chosen (`@vitejs/plugin-react` vs SWC), exact deps in final `frontend/package.json`, sidebar nav-item array shape (so step 3/4 can extend cleanly), proxy config, list of cherry-picked files from `mockup/`.

**Stay within your plan's scope. If you see an improvement that belongs to a later step, leave it.**

**Gate (run from repo root)**:

```bash
cd frontend && npm run build && npm test -- --run --passWithNoTests
cd . && make test
```

Passes when: frontend build is clean, frontend test runner exits 0 (no tests yet is fine), backend tests stay green. Stop and report on failure.

---

### Step 2 — Shared calculator infrastructure

**Plan**: `docs/plans/2026-05-06-02-shared-calculator-infra.md`

**Agent briefing**:

- **Context sources** (orchestrator reads these):
  - `docs/handoff/step-1-frontend-shell.md`
  - `docs/specs/2026-05-06-01-calculator-port.md` §"Source Project Inventory", §"MathTooltip port", §"Charts", §"Validation & error display"
  - `../legacy-vue-calc/src/utils/math/` (the entire directory tree)
  - `../legacy-vue-calc/src/utils/mathFormatters.ts`
  - `../legacy-vue-calc/tests/math/` and `tests/mathFormatters.test.ts`
  - `../legacy-vue-calc/src/components/MathTooltip.vue`
  - `../legacy-vue-calc/src/types/chart.ts`
  - `mockup/src/components/ui/` (for `hover-card.tsx`, `dialog.tsx`, `sheet.tsx`, `dropdown-menu.tsx` cherry-picks)
- **Read first**: `docs/plans/2026-05-06-02-shared-calculator-infra.md`
- **Context**: <orchestrator pastes step-1 handoff (frontend dep list, sidebar shape) + the math library file index + MathTooltip.vue source>
- **Owns**:
  - `frontend/src/lib/math/` (entire directory: `coastFire.ts`, `mortgage.ts`, `compound.ts`, `validation.ts`, `charts.ts`, `formatters.ts` (or `mathFormatters.ts` to match source — pick and document), `index.ts`, plus `charts/rechartsAdapters.ts`)
  - `frontend/src/components/calculators/MathTooltip.tsx`, `ScenarioPicker.tsx`, `charts/ProjectionLineChart.tsx`, `charts/ComparisonLineChart.tsx`
  - `frontend/src/lib/math/__tests__/` (or co-located `.test.ts` files)
  - `frontend/src/hooks/useMediaQuery.ts` (small helper for mobile detection)
  - `frontend/vitest.config.ts` (Vitest jsdom environment)
  - Cherry-picked shadcn primitives in `frontend/src/components/ui/`: `hover-card.tsx`, `dialog.tsx`, `sheet.tsx`, `dropdown-menu.tsx`
  - `frontend/package.json` — add deps `@radix-ui/react-hover-card`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu` (sheet uses `@radix-ui/react-dialog`)
- **Must not touch**:
  - `frontend/src/pages/CoastFire.tsx`, `Mortgage.tsx` (still placeholders from step 1; full implementation owned by steps 3/4)
  - `frontend/src/api/`, `frontend/src/hooks/use*Scenario.ts`, `components/calculators/CoastFire*.tsx`, `Mortgage*.tsx` — owned by steps 3/4
  - `frontend/src/components/AppSidebar.tsx`, `Layout.tsx`, `TopBar.tsx` — owned by step 1
  - `backend/`
  - `mockup/`
- **MUST follow the pattern in**:
  - `../legacy-vue-calc/src/utils/math/` — port file structure, function signatures, JSDoc, and tests verbatim. Only adapt imports.
  - `../legacy-vue-calc/src/utils/mathFormatters.ts` — port verbatim.
  - `../legacy-vue-calc/src/components/MathTooltip.vue` — match behavior (hover desktop, modal mobile, template `{fieldName}` substitution, help-cursor) but reimplement in React using Radix `HoverCard` (desktop) and `Dialog`/`Sheet` (mobile).
- **Do not** add: the four mortgage-specific tooltip formatters (`formatAmortizationSteps`, `formatInvestmentCompoundingSteps`, `formatTaxCalculationSteps`, `formatPayoffComparisonSteps`) — those are step 4's responsibility. Port only what already exists in source.
- **Do not** wire scenario picker to any backend — it's prop-driven only in this step. Backend wiring is step 3/4's responsibility.
- **Done when**:
  - All math library files ported; `npm test` from `frontend/` passes with the 171-test floor (test count from source project).
  - MathTooltip renders on desktop hover and mobile modal in the optional dev fixture.
  - Recharts adapter functions implemented and unit-tested for the five chart shapes named in plan 02.
  - `ProjectionLineChart` and `ComparisonLineChart` render sample data without errors; crossover-month annotation works.
  - `ScenarioPicker` renders from props (scenarios, activeId, callbacks) and fires expected callbacks; component test passes.
  - All checkboxes in plan 02's Acceptance Criteria are marked complete in the plan file.
- **If unclear, stop**: ambiguity over `formatters.ts` vs `mathFormatters.ts` filename — pick one, document at top of the file with a brief comment. Either is acceptable; consistency matters more than which.
- **Handoff**: write `docs/handoff/step-2-shared-infra.md` recording: final filename for formatters, exact exports from `lib/math/index.ts`, MathTooltip's prop signature, ScenarioPicker's prop signature, the adapter functions' input/output shapes, the test count actually achieved.

**Stay within your plan's scope. If you see an improvement that belongs to a later step, leave it.**

**Gate (run from repo root)**:

```bash
cd frontend && npm run build && npm test -- --run
```

Passes when: frontend build is clean, all tests pass, test count ≥ 171. Stop and report on failure.

---

### Step 3 — Coast FIRE end-to-end

**Plan**: `docs/plans/2026-05-06-03-coast-fire-end-to-end.md`

**Agent briefing**:

- **Context sources** (orchestrator reads these):
  - `docs/handoff/step-1-frontend-shell.md`, `docs/handoff/step-2-shared-infra.md`
  - `docs/specs/2026-05-06-01-calculator-port.md` §"Calculators → Coast FIRE", §"Persistence" (entire)
  - `../legacy-vue-calc/src/views/CoastFireCalculator.vue` (UI, copy, tooltip placement, sequencing — port verbatim into React)
  - `../legacy-vue-calc/src/stores/coastFire.ts` (default values, bidirectional sync logic)
  - `backend/app/models/budget.py` (model pattern: SQLAlchemy 2.0 `Mapped`/`mapped_column`, timestamps, unique constraints)
  - `backend/app/routers/budget_router.py` (router pattern: prefix, tags, `Depends(get_db)`, response_model)
  - `backend/app/schemas/budget.py` (Create/Update/Response schema separation)
  - `backend/tests/test_budget_crud.py` (test conventions: fixtures, TestClient)
  - `backend/alembic/versions/b762a8a2c851_initial_schema.py` (migration shape)
  - `backend/app/main.py` (where to register the new router)
  - `backend/app/models/__init__.py` (where to add the model export)
- **Read first**: `docs/plans/2026-05-06-03-coast-fire-end-to-end.md`
- **Context**: <orchestrator pastes step-1+2 handoffs, exemplar code excerpts (budget model/router/schema/test), and CoastFireCalculator.vue tooltip content + bidirectional sync logic>
- **Owns**:
  - Backend: `backend/app/models/coast_fire_scenario.py`, `backend/app/schemas/coast_fire_scenario.py`, `backend/app/routers/coast_fire_router.py`, optionally `backend/app/services/coast_fire_service.py`, new `backend/alembic/versions/<rev>_add_coast_fire_scenarios.py`, `backend/tests/test_coast_fire_router.py`. **Single-line additions**: `backend/app/main.py` (router include) and `backend/app/models/__init__.py` (export).
  - Frontend: `frontend/src/api/coastFire.ts`, `frontend/src/hooks/useCoastFireScenario.ts`, `frontend/src/pages/CoastFire.tsx` (replaces step 1 placeholder), `frontend/src/components/calculators/CoastFireForm.tsx`, `frontend/src/components/calculators/CoastFireResults.tsx`, plus matching test files.
- **Must not touch**:
  - All step 4 files: `backend/app/models/mortgage_scenario.py`, `backend/app/routers/mortgage_router.py`, `backend/app/schemas/mortgage_scenario.py`, the mortgage migration, `backend/tests/test_mortgage_router.py`, `frontend/src/api/mortgage.ts`, `frontend/src/hooks/useMortgageScenario.ts`, `frontend/src/pages/Mortgage.tsx`, `Mortgage*.tsx` components.
  - Step 2's owned code: `frontend/src/lib/math/`, `MathTooltip.tsx`, `ScenarioPicker.tsx`, charts. Consume them, don't modify.
  - All other backend code (transactions, budget, forecast, payments, subscriptions, classification, imports).
  - `frontend/src/components/AppSidebar.tsx`, `Layout.tsx`, `TopBar.tsx` — owned by step 1.
  - `mockup/`.
- **MUST follow the pattern in**:
  - `backend/app/models/budget.py` — SQLAlchemy 2.0 model style, timestamps, unique constraints.
  - `backend/app/routers/budget_router.py` — router shape (`/api/...` prefix, tags, dependency injection, response_model).
  - `backend/app/schemas/budget.py` — Create/Update/Response separation.
  - `backend/tests/test_budget_crud.py` — pytest + TestClient conventions; reuse fixtures from `backend/tests/conftest.py`.
  - `backend/alembic/versions/b762a8a2c851_initial_schema.py` — migration shape via `make migrate-new`.
- **Follow the pattern in**: `../legacy-vue-calc/src/views/CoastFireCalculator.vue` — page layout, field grouping, tooltip placement, copy. Translate Vue → React; preserve UX. Copy formula text and educational copy verbatim into React tile components — do not paraphrase.
- **Do not** implement Mortgage anything — that's step 4. Do not modify any code from step 2. Do not auto-save (V1 is manual save with dirty indicator).
- **Implementation note** — partial unique index for `is_active = true`: SQLite supports `CREATE UNIQUE INDEX ... WHERE is_active = 1`. Alembic autogenerate may not emit this; hand-edit the migration to add `op.execute("CREATE UNIQUE INDEX ix_coast_fire_scenarios_is_active ON coast_fire_scenarios (is_active) WHERE is_active = 1")` (and a matching drop in `downgrade`).
- **Done when**:
  - Migration applied via `make migrate`; backend `make test` green with new tests covering CRUD, activate-uniqueness invariant, name uniqueness, 404s.
  - Frontend page at `/coast-fire` loads active scenario (or seeded defaults on 404), all 8 result tiles render with tooltips, both charts render, scenario picker works (create/select/rename/duplicate/delete).
  - Bidirectional sync between `monthlyExpenses` ⇄ `yearlyExpenses` ⇄ `targetRetirementAmount` honors `lastEditedField`.
  - Validation errors render per-field; Save disabled when invalid; Save button persists via API and clears dirty state.
  - Manual smoke: refresh browser, scenario reloads.
  - All checkboxes in plan 03's Acceptance Criteria are marked complete in the plan file.
- **If unclear, stop**: deciding between inline service code vs `coast_fire_service.py` extraction — match whatever the analyzer's existing routers do (look at `budget_router.py` and `budget_service.py`). Don't invent a new pattern.
- **Handoff**: write `docs/handoff/step-3-coast-fire.md` recording: exact `CoastFireScenarioResponse` Pydantic schema (field names + types), full URL list of the 7 endpoints, `useCoastFireScenario` hook signature (cache keys, exported functions), partial-index DDL used in the migration, default values used for first-run seeding, whether services are extracted or inline. **This handoff is the canonical pattern step 4 mirrors.**

**Stay within your plan's scope. If you see an improvement that belongs to a later step, leave it.**

**Gate (run from repo root)**:

```bash
make test && cd frontend && npm run build && npm test -- --run
```

Passes when: backend tests green (including new Coast FIRE tests), frontend build clean, all frontend tests pass.

**Interface gate** (orchestrator runs after step 3 gate):

- [ ] Open `backend/app/schemas/coast_fire_scenario.py` and confirm `CoastFireScenarioResponse` exists with at least: `id`, `name`, `is_active`, `current_age`, `retirement_age`, `current_savings`, `expected_return_rate`, `target_retirement_amount`, `monthly_expenses`, `yearly_expenses`, `withdrawal_rate`, `inflation_rate`, `use_real_returns`, `last_edited_field`, `created_at`, `updated_at`.
- [ ] Open `backend/app/routers/coast_fire_router.py` and confirm the prefix is `/api/calculators/coast-fire/scenarios` and all 7 endpoints exist (list, create, active, get, update, activate, delete).
- [ ] Open `frontend/src/hooks/useCoastFireScenario.ts` and note the React Query cache-key shape — step 4's `useMortgageScenario` must mirror it.

If any of these don't match the spec, stop and have step 3 fix before launching step 4.

---

### Step 4 — Mortgage Payoff end-to-end

**Plan**: `docs/plans/2026-05-06-04-mortgage-end-to-end.md`

**Agent briefing**:

- **Context sources** (orchestrator reads these):
  - `docs/handoff/step-3-coast-fire.md` (canonical pattern — most important)
  - `docs/handoff/step-1-frontend-shell.md`, `docs/handoff/step-2-shared-infra.md`
  - `docs/specs/2026-05-06-01-calculator-port.md` §"Calculators → Mortgage Payoff", §"Persistence"
  - `../legacy-vue-calc/src/views/MortgagePayoffCalculator.vue`
  - `../legacy-vue-calc/src/stores/mortgagePayoff.ts` (default values)
  - `../legacy-vue-calc/docs/MATH.md` (formula reference for the 4 new formatters)
  - `../legacy-vue-calc/src/utils/mathFormatters.ts` (style for the 4 new formatters)
  - The actual files step 3 produced — these are the canonical templates: `backend/app/models/coast_fire_scenario.py`, `backend/app/schemas/coast_fire_scenario.py`, `backend/app/routers/coast_fire_router.py`, the coast fire migration, `backend/tests/test_coast_fire_router.py`, `frontend/src/api/coastFire.ts`, `frontend/src/hooks/useCoastFireScenario.ts`, `frontend/src/pages/CoastFire.tsx`, `frontend/src/components/calculators/CoastFireForm.tsx` and `CoastFireResults.tsx`
- **Read first**: `docs/plans/2026-05-06-04-mortgage-end-to-end.md`
- **Context**: <orchestrator pastes step-3 handoff (full canonical pattern) + MortgagePayoffCalculator.vue tile content + mortgagePayoff.ts defaults + sample formatter from mathFormatters.ts to anchor the style of the 4 new formatters>
- **Owns**:
  - Backend: `backend/app/models/mortgage_scenario.py`, `backend/app/schemas/mortgage_scenario.py`, `backend/app/routers/mortgage_router.py`, optionally `backend/app/services/mortgage_scenario_service.py`, new `backend/alembic/versions/<rev>_add_mortgage_scenarios.py`, `backend/tests/test_mortgage_router.py`. **Single-line additions**: `backend/app/main.py` (router include) and `backend/app/models/__init__.py` (export).
  - Frontend: `frontend/src/api/mortgage.ts`, `frontend/src/hooks/useMortgageScenario.ts`, `frontend/src/pages/Mortgage.tsx` (replaces step 1 placeholder), `frontend/src/components/calculators/MortgageForm.tsx`, `frontend/src/components/calculators/MortgageResults.tsx`, plus matching test files.
  - **Net-new code in a step-2-owned file**: append the 4 new mortgage tooltip formatters (`formatAmortizationSteps`, `formatInvestmentCompoundingSteps`, `formatTaxCalculationSteps`, `formatPayoffComparisonSteps`) to `frontend/src/lib/math/formatters.ts` (or `mathFormatters.ts`, whichever step 2 chose). Add corresponding tests. Do not modify any existing functions in that file.
- **Must not touch**:
  - All step 3 files (coast_fire_scenario model/router/schema/migration/tests, `api/coastFire.ts`, `useCoastFireScenario.ts`, `pages/CoastFire.tsx`, `CoastFire*.tsx` components).
  - All other step 2 owned code except the additive append to `formatters.ts`. In particular: do not modify `lib/math/coastFire.ts`, `mortgage.ts`, `compound.ts`, `validation.ts`, `charts.ts`, the chart adapters, `MathTooltip.tsx`, `ScenarioPicker.tsx`, or chart wrappers.
  - All other backend code (transactions, budget, forecast, payments, subscriptions, classification, imports).
  - `frontend/src/components/AppSidebar.tsx`, `Layout.tsx`, `TopBar.tsx` — owned by step 1.
  - `mockup/`.
- **MUST follow the pattern in** (highest priority — these are the actual canonical files step 3 produced):
  - `backend/app/models/coast_fire_scenario.py`
  - `backend/app/schemas/coast_fire_scenario.py`
  - `backend/app/routers/coast_fire_router.py`
  - `backend/tests/test_coast_fire_router.py`
  - `frontend/src/api/coastFire.ts`
  - `frontend/src/hooks/useCoastFireScenario.ts`
  - `frontend/src/pages/CoastFire.tsx` and the `CoastFire*.tsx` components
  - The Coast FIRE Alembic migration (for partial-index DDL approach)
- **Follow the pattern in**: `../legacy-vue-calc/src/views/MortgagePayoffCalculator.vue` — page layout, tile sequencing, copy. Translate Vue → React; preserve UX. Copy formula text and educational copy verbatim.
- **Follow the pattern in**: existing exports in `frontend/src/lib/math/formatters.ts` (e.g. `formatFutureValueSteps`) — match return-type style and step-string format for the 4 new formatters.
- **Do not** modify any Coast FIRE code. Do not modify the existing math functions in `lib/math/mortgage.ts` (already ported in step 2) — just consume them. Do not extend `MathTooltip.tsx` or `ScenarioPicker.tsx` or chart wrappers; the Coast FIRE work proved they're sufficient.
- **Implementation notes**:
  - Tax-rate input: percent at the form boundary (e.g. `20`), decimal in math (`0.20`). Convert at the form → state edge, matching calculator-project convention.
  - Crossover annotation on equity-vs-investment chart: consume `crossoverMonth` from the adapter built in step 2 (`investmentComparisonToRecharts`). Pass to `<ReferenceDot>`. Do not reimplement detection.
  - Amortization formatter: don't dump the full schedule — show first ~3 months as illustrative steps then `...` and final result. Mirror existing FV formatter's illustrative style.
  - Strategy recommendation tile: `interestSaved > investmentNetBenefit` → `'payoff'`, else `'invest'`. Show both numbers in tooltip.
- **Done when**:
  - Migration applied; backend `make test` green with new mortgage tests.
  - Frontend page at `/mortgage` loads active scenario (or seeded defaults on 404), all 10 result tiles render with tooltips, all 3 charts render (with crossover dot when applicable), scenario picker works.
  - The 4 new formatters have unit tests.
  - All checkboxes in plan 04's Acceptance Criteria are marked complete in the plan file.
- **If unclear, stop**: any divergence between the canonical pattern from step 3 and what the spec says — surface it. Do not silently adapt.
- **Handoff**: write `docs/handoff/step-4-mortgage.md` recording: list of 4 new formatters and their signatures, exact `MortgageScenarioResponse` schema, default values used for first-run, any edge cases discovered (e.g. when does crossover NOT happen).

**Stay within your plan's scope. If you see an improvement that belongs to a later step, leave it.**

**Gate (run from repo root)**:

```bash
make test && make lint && cd frontend && npm run build && npm test -- --run
```

Passes when: backend tests green, ruff clean, frontend build clean, all frontend tests pass.

---

## Interface gates summary

- [ ] **After step 2**: `frontend/src/lib/math/index.ts` re-exports the math + adapters + formatters; test count ≥ 171; `MathTooltipProps` and `ScenarioPickerProps<T>` types exported and consumable.
- [ ] **After step 3**: `CoastFireScenarioResponse` schema and `/api/calculators/coast-fire/scenarios` endpoints match spec §"API endpoints". Step 4 mirrors this contract.

## HITL checkpoints

None — all four plans are AFK.

## Completion criteria

- All 4 plans' Acceptance Criteria are checked complete in their plan files.
- `make test && make lint` pass at repo root.
- `cd frontend && npm run build && npm test -- --run` pass.
- Manual smoke (orchestrator does this once after step 4):
  - Start backend (`make dev-backend`) and frontend (`make dev-frontend`).
  - Open `localhost:5173`, navigate to **Coast FIRE** sidebar entry: edit inputs, see live computeds + tooltips, save scenario, refresh, scenario reloads.
  - Navigate to **Mortgage**: same end-to-end check.
  - Confirm crossover dot appears on equity-vs-investment chart with default-ish inputs.
- Each step's handoff file exists in `docs/handoff/`.

## Notes for the orchestrator

- Steps run serially in the main working tree. After a step's gate passes, the next agent picks up the working tree as-is — no worktree merge required.
- If a gate fails, stop and report. Recovery is the user's call: typically `git status` to see what was written, fix forward, or `git restore` / `git stash` if rolling back is cleaner.
- Plans 03 and 04 each add a single-line include to `backend/app/main.py` and a single-line export to `backend/app/models/__init__.py`. Because steps run serial, there's no conflict — just verify both lines are present after step 4 completes.
- The legacy `docs/plans/frontend.md`, `docs/plans/backend.md`, `docs/plans/todo.md` are pre-pipeline plans for unrelated analyzer features. Do not touch them. They are not part of this orchestration.
