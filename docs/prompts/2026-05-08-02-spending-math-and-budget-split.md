# Orchestration Prompt: Spending-Math Primitives + Budget Page Split

## Project context

- **Working directory**: `/home/breeze/dev/finance-analyzer`
- **Specs**:
  - `docs/specs/2026-05-08-02-spending-math-primitives.md` (bundle 1, backend)
  - `docs/specs/2026-05-08-03-budget-page-split.md` (bundle 2, frontend)
- **Plans**: `docs/plans/2026-05-08-{06..14}-*.md`
- **Backend test**: `cd backend && uv run pytest`
- **Backend lint**: `cd backend && uv run ruff check . && uv run ruff format --check .`
- **Frontend build (also typechecks)**: `cd frontend && npm run build`
- **Frontend test**: `cd frontend && npm run test -- --run`
- **Handoff directory**: `docs/handoff/` (already exists; new files use the
  `step-N-<slug>.md` convention)

All judgment calls in both specs are resolved. No HITL pauses are
required — every plan is AFK with strong existing test coverage as the
regression contract.

## Orchestrator responsibilities

You are actively managing context between agents. Before launching each
step:

1. Read the plan file for this step.
2. If a previous step completed, read its handoff
   (`docs/handoff/step-{N-1}-<slug>.md`) and inline the relevant findings
   into the agent's **Context** field.
3. Read the listed **Context sources** and inline only the sections the
   agent needs (not whole files).
4. Run the gate before launching the next step. If the gate fails, stop
   and report — do not auto-fix.

Pass the agent the **Read first** plan file path — the agent reads it in
full once. Do not paste the plan into the prompt.

## Execution plan

Nine sequential steps, two stages.

- **Stage 1 — Spending-math primitives (backend)**: steps 1–5, plans
  06–10.
- **Stage gate** (review pause before stage 2).
- **Stage 2 — Budget page split (frontend)**: steps 6–9, plans 11–14.

Bundles touch disjoint files (backend `app/services/*` vs frontend
`pages/Budget.tsx` + `components/budget/*`); a separate session could run
stage 2 in parallel with stage 1 if you prefer, but this prompt assumes
one session and serial execution.

---

### Step 1 — `Period` value type + months_overlapping migration

**Plan**: `docs/plans/2026-05-08-06-spending-period.md`

**Agent briefing**:
- **Context sources**: `docs/specs/2026-05-08-02-spending-math-primitives.md`
  (Solution + Behavior sections), `backend/app/services/category_filters.py`
  (style exemplar), `backend/tests/conftest.py` (fixture conventions).
- **Read first**: `docs/plans/2026-05-08-06-spending-period.md`.
- **Owns**: `backend/app/services/spending.py` (new); modifies
  `pace_service.py` and `stats_service.py` only at the call sites listed
  in the plan; new `backend/tests/test_spending_period.py`.
- **Must not touch**: `budget_service.py`, `csp_rollup_service.py`,
  `_effective_*` helpers, `_actuals_by_category`. These belong to later
  steps.
- **MUST follow the pattern in**: `backend/app/services/category_filters.py`
  (lightweight focused-purpose service-module style).
- **Follow the pattern in**: `backend/tests/test_pace_service.py`
  (test-file conventions).
- **Do not**: introduce `BudgetTarget` or any `spending.*` query
  function in this step — Step 2 owns `BudgetTarget`; Step 3 owns the
  spending functions.
- **If unclear, stop**: if `pace_service`'s pace-mode call site
  (`_compute_pace_mode`) appears to gain or lose behavior when migrating
  the inline pace-factor math to `Period.pace_factor`, STOP and report.
  The plan permits leaving pace-mode's local pace-factor computation
  in place if the diff would be non-mechanical; record the choice in the
  handoff.
- **Stay within your plan's scope. If you see an improvement that
  belongs to a later step, leave it.**
- **Handoff**: write `docs/handoff/step-1-spending-period.md` listing:
  the new public `Period` API surface (constructors + methods), the
  exact lines deleted in `pace_service.py` and `stats_service.py`,
  whether pace-mode's local pace-factor computation was migrated or
  left in place, and the test file's case count.

**Gate**: `cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check .`

**Interface gate** (after step 1 passes):

- `Period` exports `range`, `month`, `year`, `yyyymm` classmethods and
  `months_overlapping`, `is_in_progress`, `pace_factor`,
  `days_remaining` instance methods.
- `pace_service._months_overlapping` no longer exists.
  Verify with `grep -n "_months_overlapping" backend/app/services/`.

---

### Step 2 — `BudgetTarget` (baseline + with_overrides) + planning rollup migration

**Plan**: `docs/plans/2026-05-08-07-spending-budget-target.md`

**Agent briefing**:
- **Context sources**: `docs/handoff/step-1-spending-period.md`,
  `backend/app/services/spending.py` (current state, post-step-1),
  `backend/tests/test_pace_service.py` (test conventions).
- **Read first**: `docs/plans/2026-05-08-07-spending-budget-target.md`.
- **Prior step context**: Step 1 added `Period` to
  `app/services/spending.py`. Trust the handoff over this description.
- **Owns**: extends `app/services/spending.py` with `BudgetTarget`
  (baseline + with_overrides only); modifies the call sites listed in
  the plan in `pace_service.py`, `stats_service.py`,
  `csp_rollup_service.py`; new
  `backend/tests/test_spending_budget_target.py`.
- **Must not touch**: `Period` (already complete); `BudgetTarget.with_rollover`
  (Step 5); the inline rollover walk inside
  `budget_service.get_actual_vs_budget` (Step 5);
  `pace_service._actuals_by_category` (Step 3); `stats_service.get_summary`
  / `get_monthly_stats` (Step 3 + Step 4); `csp_rollup_service.get_actuals_rollup`
  bucket-numerator loop (Step 3).
- **MUST follow the pattern in**: the `Period` class added in Step 1
  (lives in the same file).
- **Follow the pattern in**: `backend/tests/test_pace_service.py` for
  test conventions (note: `BudgetTarget` tests do NOT need a `db` —
  pass `Budget` model instances constructed in-memory).
- **Do not**: add `with_rollover`. Do not migrate
  `budget_service.get_actual_vs_budget`. Do not touch the
  `csp_rollup_service.get_actuals_rollup` actuals fetch (only its
  pre-tax-total loop call to `_baseline`).
- **Stay within your plan's scope.**
- **Handoff**: write `docs/handoff/step-2-spending-budget-target.md`
  listing: new public surface for `BudgetTarget`, exact lines deleted
  per file, test-case count.

**Gate**: `cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check .`

**Interface gate** (after step 2 passes):

- `BudgetTarget.baseline(budget)` and `BudgetTarget.with_overrides(budget)`
  classmethods exist.
- Instance methods `effective(year, month)` and `effective_over(period)`
  exist and accept the listed types.
- The three deleted helpers (`_effective_budget`, `_effective_monthly_budget`,
  `_baseline`) no longer exist:
  `grep -n "_effective_budget\b\|_effective_monthly_budget\b\|def _baseline\b" backend/app/services/`
  returns no hits.

---

### Step 3 — `spending.*` outflow functions + first-wave migrations

**Plan**: `docs/plans/2026-05-08-08-spending-outflow-functions.md`

**Agent briefing**:
- **Context sources**: `docs/handoff/step-1-spending-period.md`,
  `docs/handoff/step-2-spending-budget-target.md`,
  `backend/app/services/spending.py` (current state),
  `backend/app/services/stats_service.py` (current `get_spending_trend`
  for SQL filter style),
  `backend/tests/test_stats_service.py` (test fixtures).
- **Read first**: `docs/plans/2026-05-08-08-spending-outflow-functions.md`.
- **Prior step context**: Step 1 added `Period`; Step 2 added
  `BudgetTarget.baseline` and `BudgetTarget.with_overrides`. The
  csp-actuals migration in this step's plan REQUIRES
  `BudgetTarget.with_overrides` — verify it exists before starting.
- **Owns**: extends `app/services/spending.py` with `range_total`,
  `by_category`, `by_year_month`, `by_category_and_month` (and a
  private `_apply_structural_filter` helper); migrates
  `pace_service._actuals_by_category` call sites and deletes the helper;
  rewrites `stats_service.get_monthly_stats` body; rewrites
  `csp_rollup_service.get_actuals_rollup` bucket-numerator loop; new
  `backend/tests/test_spending_queries.py`.
- **Must not touch**: `stats_service.get_summary` (Step 4);
  `stats_service.get_spending_trend` (Step 4 — only its actuals fetch);
  `budget_service.get_actual_vs_budget` (Step 5);
  `BudgetTarget.with_rollover` (Step 5); ORM models.
- **MUST follow the pattern in**: the existing
  `stats_service.get_spending_trend` SQL filter chain (`is_transfer.is_(False)`
  + `not_excluded_from_budget()` + the optional outer-join-on-Category
  for pre-tax exclusion).
- **Follow the pattern in**: `backend/tests/test_stats_service.py`
  (`_seed_categories` helper, `_make_txn` helper, `db: Session`
  fixture).
- **Do not**: add `income_total` (Step 4 owns it). Do not migrate
  `get_summary` or `get_spending_trend`. Do not migrate
  `budget_service.get_actual_vs_budget`.
- **Stay within your plan's scope.**
- **Handoff**: write `docs/handoff/step-3-spending-outflow-functions.md`
  listing: new public surface, deleted helpers, exact migration sites,
  any SQL deviation from today's queries (there shouldn't be any), and
  the second-loop pre-tax substitution added in
  `csp_rollup_service.get_actuals_rollup` (per the plan's
  Implementation Notes).

**Gate**: `cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check .`

**Interface gate** (after step 3 passes):

- `spending.range_total`, `by_category`, `by_year_month`,
  `by_category_and_month` all exist with the documented signatures.
- All four apply the structural filter unconditionally
  (`grep -n "is_transfer.is_(False)\|not_excluded_from_budget" backend/app/services/spending.py`
  shows occurrences only inside private helpers; no caller-controllable
  bypass).
- `pace_service._actuals_by_category` no longer exists.
- `csp_rollup_service` no longer imports `budget_service` (verify with
  `grep "from app.services import budget_service" backend/app/services/csp_rollup_service.py`
  returning empty).

---

### Step 4 — `spending.income_total` + finish stats_service migration

**Plan**: `docs/plans/2026-05-08-09-spending-income-and-trend.md`

**Agent briefing**:
- **Context sources**: handoffs `step-1`, `step-2`, `step-3`;
  `backend/app/services/spending.py`,
  `backend/app/services/stats_service.py` current state.
- **Read first**: `docs/plans/2026-05-08-09-spending-income-and-trend.md`.
- **Prior step context**: All five `spending.*` outflow primitives from
  Step 3 plus `BudgetTarget.with_overrides` from Step 2 are available.
- **Owns**: adds `income_total` to `spending.py`; rewrites
  `stats_service.get_summary` body and the actuals-fetch portion of
  `stats_service.get_spending_trend`; extends
  `tests/test_spending_queries.py` with `income_total` cases.
- **Must not touch**: `pace_service` (already migrated); `csp_rollup_service`
  (already migrated); `budget_service` (Step 5);
  `BudgetTarget.with_rollover` (Step 5).
- **Follow the pattern in**: existing `spending.range_total` shape from
  Step 3 — `income_total` is its inflow-side mirror.
- **Do not**: add a `spending.count` function (the plan explicitly
  leaves `transaction_count` as an inline COUNT query). Do not migrate
  the `expected_by_month` loop in `get_spending_trend` (already
  migrated to `BudgetTarget` in Step 2).
- **Stay within your plan's scope.**
- **Handoff**: write `docs/handoff/step-4-spending-income-and-trend.md`
  listing: new `income_total` signature, exact rewrite of
  `get_summary` body, the one inline COUNT query that remains and why.

**Gate**: `cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check .`

---

### Step 5 — `BudgetTarget.with_rollover` + actual_vs_budget migration

**Plan**: `docs/plans/2026-05-08-10-spending-rollover-and-actual-vs-budget.md`

**Agent briefing**:
- **Context sources**: handoffs `step-1`, `step-2`, `step-3`, `step-4`;
  `backend/app/services/budget_service.py` (current
  `get_actual_vs_budget` implementation, lines ~337–449);
  `backend/tests/test_rollover_budgets.py` (regression contract).
- **Read first**: `docs/plans/2026-05-08-10-spending-rollover-and-actual-vs-budget.md`.
- **Prior step context**: `Period`, `BudgetTarget.baseline`,
  `BudgetTarget.with_overrides`, and all four outflow `spending.*`
  functions are available. `test_rollover_budgets` defines the
  regression contract — your migration must produce identical output.
- **Owns**: extends `BudgetTarget` with `with_rollover`; rewrites
  `budget_service.get_actual_vs_budget`; extends
  `tests/test_spending_budget_target.py` with `with_rollover` cases.
- **Must not touch**: `pace_service`, `stats_service`,
  `csp_rollup_service` (all already migrated); the
  historical-analysis half of `budget_service.py`
  (`get_historical_analysis`, `_compute_trend`, `_detect_seasonal_months`,
  `get_budget_suggestions`); `budget_service` CRUD functions
  (`list_budgets`, `set_budget`, `set_monthly_override`,
  `delete_monthly_override`).
- **MUST follow the pattern in**: the existing `BudgetTarget` shape
  from Step 2 (classmethod conventions, `effective` / `effective_over`
  signatures).
- **Follow the pattern in**: today's inline rollover walk in
  `budget_service.get_actual_vs_budget` (lines ~386–430) — produce the
  same numbers for the same inputs.
- **Do not**: change the `ActualVsBudgetEntry` or `MonthlyRollup`
  dataclasses. Do not change rounding or float coercion at the response
  boundary. Do not change the year-boundary behavior — the plan resolves
  it as "drop carry at year boundary," matching today.
- **Stay within your plan's scope.**
- **Handoff**: write `docs/handoff/step-5-spending-rollover.md` listing:
  new `with_rollover` signature, the rewritten `get_actual_vs_budget`
  shape, results of the final-sweep grep checks listed in the plan's
  acceptance criteria, and any test additions.

**Gate**: `cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check .`

---

### Stage gate — review bundle 1

After step 5 passes, **STOP** before launching step 6. Run a manual
review pass:

- Confirm `git diff main...HEAD --stat` shows changes only in
  `backend/app/services/{spending,pace_service,stats_service,csp_rollup_service,budget_service}.py`
  and `backend/tests/test_spending_*.py`.
- Spot-check `backend/app/services/spending.py` against the spec's
  "What the module owns" / "What it hides" / "What it exposes"
  sections. The module should match.
- Run the final-sweep greps from
  `2026-05-08-10`'s acceptance criteria one more time.
- Confirm the API endpoints serving stats / pace / budget / csp still
  return identical shapes and numbers via a manual `curl` smoke check
  (or restart the dev backend and click through the Overview and Budget
  pages — they'll surface any regression visually).

If any of the above fails, stop and report. Otherwise proceed to step 6.

---

### Step 6 — Budget shared primitives + dedup + dead code removal

**Plan**: `docs/plans/2026-05-08-11-budget-shared-primitives.md`

**Agent briefing**:
- **Context sources**:
  `docs/specs/2026-05-08-03-budget-page-split.md`,
  `frontend/src/components/overview/BucketCard.tsx` (style exemplar),
  `frontend/src/components/overview/RangePicker.tsx` (style exemplar),
  `frontend/src/pages/__tests__/Categories.test.tsx` (test exemplar),
  `frontend/src/pages/Budget.tsx` (the current monolith).
- **Read first**: `docs/plans/2026-05-08-11-budget-shared-primitives.md`.
- **Owns**: new `frontend/src/components/budget/` directory with
  `date-helpers.ts`, `chart-style.ts`, `bucket-copy.ts`,
  `MonthSelector.tsx`, `BucketDashboardCard.tsx`,
  `ActualsBucketCard.tsx`, plus `__tests__/` for the three components;
  modifies `pages/Budget.tsx` to delete the moved blocks and add
  imports.
- **Must not touch**: `HistoricalView` (Step 7), `SetBudgetView`
  (Step 8), `ActualVsBudgetView` and its sub-components (Step 9). The
  three view components stay inline in `Budget.tsx` after this step;
  this step only extracts shared primitives.
- **MUST follow the pattern in**:
  `frontend/src/components/overview/BucketCard.tsx` (component-file
  shape, JSDoc, lucide + shadcn imports).
- **MUST follow the pattern in**:
  `frontend/src/pages/__tests__/Categories.test.tsx` for the new
  component tests (vitest + RTL, no `QueryClientProvider`).
- **Do not**: extract any of the three view components. Do not touch
  `BudgetVarianceChart`, `CategoryDrilldown`, `mapToZonePosition`,
  `getTierColors`, the `VarianceRow` interface, or `SortColumn`/`SortDir`
  — those belong to Step 9.
- **If unclear, stop**: if `CSP_BUCKETS` and `ACTUAL_BUCKET_ORDER`
  diverge in content (they shouldn't, but check before deletion), stop
  and report. The dedup is conditional on byte-equivalent content.
- **Stay within your plan's scope.**
- **Handoff**: write `docs/handoff/step-6-budget-shared-primitives.md`
  listing: every new file's exports, the deleted blocks with line
  ranges, and the new test counts.

**Gate**: `cd frontend && npm run build && npm run test -- --run`

**Interface gate** (after step 6 passes):

- All six new files exist under `frontend/src/components/budget/`.
- `progressColor` and `ACTUAL_BUCKET_ORDER` no longer exist:
  `grep -rn "progressColor\|ACTUAL_BUCKET_ORDER" frontend/src/`
  returns no hits.
- `<NetIncomeEditor />` count in `pages/Budget.tsx` is unchanged at
  this step (still rendered in two places — Step 8 dedupes it).

---

### Step 7 — HistoricalView extraction

**Plan**: `docs/plans/2026-05-08-12-budget-historical-view.md`

**Agent briefing**:
- **Context sources**: `docs/handoff/step-6-budget-shared-primitives.md`,
  `frontend/src/components/budget/MonthSelector.tsx` (local-style
  exemplar from Step 6),
  `frontend/src/components/overview/SpendingTrendChart.tsx` (component
  shape exemplar),
  `frontend/src/pages/Budget.tsx` (current state, post-step-6).
- **Read first**: `docs/plans/2026-05-08-12-budget-historical-view.md`.
- **Prior step context**: Step 6 created
  `components/budget/{date-helpers,chart-style,bucket-copy}.ts` and the
  three small shared components. Imports for `MONTH_NAMES`,
  `shortMonth`, `tooltipStyle`, `chartColors` come from those files.
- **Owns**: new `frontend/src/components/budget/HistoricalView.tsx`
  (carries `HistoricalView` and private `trendIcon`); modifies
  `pages/Budget.tsx` to delete `trendIcon` and `HistoricalView` and
  add the import.
- **Must not touch**: `SetBudgetView` (Step 8), `ActualVsBudgetView`
  and its sub-components (Step 9), `Budget` default-export's queries /
  mutations / tab markup (only the import line and the render site
  source change).
- **MUST follow the pattern in**:
  `frontend/src/components/overview/SpendingTrendChart.tsx` (one-
  component file, JSDoc, named export).
- **Follow the pattern in**: the new
  `frontend/src/components/budget/MonthSelector.tsx` for local style.
- **Do not**: introduce a `historicalViewModel.ts`. Do not add tests
  for `HistoricalView` — out of scope per spec.
- **Stay within your plan's scope.**
- **Handoff**: write `docs/handoff/step-7-budget-historical-view.md`
  listing: the new file's exports, the deleted blocks with line
  ranges, post-refactor `Budget.tsx` line count.

**Gate**: `cd frontend && npm run build && npm run test -- --run`

---

### Step 8 — SetBudgetView extraction + NetIncomeEditor dedup

**Plan**: `docs/plans/2026-05-08-13-budget-set-budget-view.md`

**Agent briefing**:
- **Context sources**: handoffs `step-6`, `step-7`;
  `frontend/src/components/budget/HistoricalView.tsx` (style exemplar
  from Step 7);
  `frontend/src/pages/Budget.tsx` (current state, post-step-7).
- **Read first**: `docs/plans/2026-05-08-13-budget-set-budget-view.md`.
- **Prior step context**: Steps 6 and 7 are complete; `HistoricalView`
  and shared primitives are extracted. `<NetIncomeEditor />` is still
  rendered in two places (inside `SetBudgetView` AND in the
  zero-budget fallback) — this step dedupes it.
- **Owns**: new `frontend/src/components/budget/SetBudgetView.tsx`
  (carries `SetBudgetView`, the `SetBudgetViewProps` interface, all
  internal helpers + state hooks); modifies `pages/Budget.tsx` to
  delete the moved blocks, add the import, and hoist
  `<NetIncomeEditor />` to render once above the conditional.
- **Must not touch**: `ActualVsBudgetView` and its sub-components
  (Step 9), `Budget` default-export's queries / mutations / tab
  markup, `frontend/src/components/NetIncomeEditor.tsx` (used as-is).
- **MUST follow the pattern in**:
  `frontend/src/components/overview/BucketCard.tsx`.
- **Follow the pattern in**:
  `frontend/src/components/budget/HistoricalView.tsx` from Step 7.
- **Do not**: introduce a `setBudgetViewModel.ts`. Do not add
  `SetBudgetView` tests — out of scope per spec. Do not change the
  drafts state shape or the `${categoryId}-${scope}` key format.
- **If unclear, stop**: if hoisting `<NetIncomeEditor />` would change
  its render position relative to the four CSP bucket cards, stop and
  report. The post-refactor render must be visually identical.
- **Stay within your plan's scope.**
- **Handoff**: write `docs/handoff/step-8-budget-set-budget-view.md`
  listing: the new file's exports, the deleted blocks with line
  ranges, the post-hoist `<TabsContent value="set">` structure, the
  `grep -c "<NetIncomeEditor" frontend/src/pages/Budget.tsx` result
  (must be `1`).

**Gate**: `cd frontend && npm run build && npm run test -- --run`

---

### Step 9 — ActualVsBudgetView + view-model + sub-components

**Plan**: `docs/plans/2026-05-08-14-budget-actual-vs-budget-view.md`

**Agent briefing**:
- **Context sources**: handoffs `step-6`, `step-7`, `step-8`;
  `frontend/src/lib/math/__tests__/coastFire.test.ts` (pure-function
  test exemplar);
  `frontend/src/components/overview/SpendingTrendChart.tsx` and
  `frontend/src/components/overview/BucketCard.tsx` (component shape
  exemplars);
  `frontend/src/pages/Budget.tsx` (current state, post-step-8).
- **Read first**:
  `docs/plans/2026-05-08-14-budget-actual-vs-budget-view.md`.
- **Prior step context**: Steps 6–8 are complete. `Budget.tsx` still
  contains `mapToZonePosition`, `getTierColors`, `VarianceRow`,
  `CategoryDrilldown`, `BudgetVarianceChart`, `ActualVsBudgetViewProps`,
  and `ActualVsBudgetView`. This step extracts all of them.
- **Owns**: four new files in `frontend/src/components/budget/`:
  `CategoryDrilldown.tsx`, `BudgetVarianceChart.tsx`,
  `actualVsBudgetViewModel.ts`, `ActualVsBudgetView.tsx`. New
  `__tests__/actualVsBudgetViewModel.test.ts` with the 8 spec-listed
  cases. Modifies `pages/Budget.tsx` to delete the moved blocks and
  add the import.
- **Must not touch**: `HistoricalView`, `SetBudgetView` (already
  extracted), `Budget` default-export's queries / mutations /
  `actualSelectedMonth` state / tab markup (per spec resolution: stays
  in the page; do not lift to URL or to a hook).
  `frontend/src/api/transactions.ts` (used as-is).
- **MUST follow the pattern in**:
  `frontend/src/lib/math/__tests__/coastFire.test.ts` (pure-function
  test style — vitest, plain TS imports, no React, literal-data
  fixtures).
- **MUST follow the pattern in**:
  `frontend/src/components/overview/SpendingTrendChart.tsx` for
  component-file shape.
- **Resolved judgment call**: `mapToZonePosition` and `getTierColors`
  STAY inside `BudgetVarianceChart.tsx` as non-exported helpers. Do
  NOT lift them to `actualVsBudgetViewModel.ts` or to `chart-style.ts`.
- **Do not**: lift `actualSelectedMonth` to the URL or to a hook. Do
  not refactor `SetBudgetView` (already done in Step 8). Do not split
  the view-model file further; the spec calls for one file with the
  five named functions plus types.
- **If unclear, stop**: if a view-model test case (e.g. the
  rollover-with-override case) would assert behavior different from
  what `budget_service.get_actual_vs_budget` returns post-Step-5,
  stop and report. Test the view-model's transforms against what the
  backend actually emits today.
- **Stay within your plan's scope.**
- **Handoff**: write `docs/handoff/step-9-budget-actual-vs-budget-view.md`
  listing: every new file's exports, the deleted blocks with line
  ranges, post-refactor `Budget.tsx` line count (target ≤210), and
  the view-model test count.

**Gate**: `cd frontend && npm run build && npm run test -- --run`

---

## Completion criteria

- All plan acceptance criteria for plans 06–14 met.
- Backend gate passes: `cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check .`
- Frontend gate passes: `cd frontend && npm run build && npm run test -- --run`
- Final greps return clean (run from repo root):
  - `grep -rn "_effective_budget\b\|_effective_monthly_budget\b\|_actuals_by_category\b\|_months_overlapping\b" backend/app/services/`
    → no hits.
  - `grep -rn "progressColor\|ACTUAL_BUCKET_ORDER" frontend/src/`
    → no hits.
  - `grep -c "<NetIncomeEditor" frontend/src/pages/Budget.tsx` → `1`.
- Manual frontend smoke check: load `/budget` in the dev server, click
  through all three tabs, exercise the inline editing, month selector,
  bucket-row expansion, and Suggest Budgets. All behavior identical to
  pre-refactor.
- Handoff files exist for steps 1, 2, 3, 4, 5, 6, 7, 8, 9.

## On failure

If any gate fails, **stop and report** — do not auto-fix. The agent for
that step has the most context to diagnose; surface the failure with the
gate output and let the user decide whether to retry the same step,
revise the plan, or back out.
