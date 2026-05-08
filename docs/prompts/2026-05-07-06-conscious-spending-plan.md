# Orchestration Prompt: Conscious Spending Plan (CSP)

## Project context

- Working directory: `.`
- Spec: `docs/specs/2026-05-07-02-conscious-spending-plan.md`
- Research: none — proceed using the spec, plan files, and direct code inspection
- Build: `cd frontend && npm run build`
- Backend test: `make test` (pytest)
- Frontend test: `cd frontend && npm test` (vitest — existing tests cover Categories, Mortgage, CoastFire; expect `Categories.test.tsx` to need updating in Step 1)
- Lint: `make lint` (backend only — frontend type-checking happens via the build)
- Migrations: `make migrate` (apply Alembic migrations)
- Handoff directory: `docs/handoff/` (create if needed)

## Orchestrator responsibilities

You are actively managing context between agents. Before launching each step:

1. Read the files listed under **Context sources** and inline the relevant sections into the agent's **Context** field.
2. If a previous step completed, read `docs/handoff/step-{N-1}-<name>.md` and use it to fill in what the prior step actually produced (file paths, function signatures, schema shapes).
3. Pause for HITL checkpoints — do not auto-proceed.

The four plans are executed **serially**. Plans 14 and 15 have no declared dependency on each other, but they were not parallelized for two reasons: Step 1 is HITL (user review of bucket assignments) so a parallel branch would stall anyway, and both add Alembic migrations whose sequence is cleaner when chained. If you want to revisit parallelization, the only safe target is Steps 1 and 2.

## Execution plan

### Step 1 — Category fields and bucket seed (HITL)

**Plan**: `docs/plans/2026-05-07-14-csp-category-fields-and-bucket-seed.md`

**Agent briefing**:
- **Context sources** (orchestrator reads these before launch):
  - `backend/app/models/category.py` — current Category model
  - `backend/app/schemas/category.py` — current Category schemas
  - `backend/app/routers/category_router.py` — current CRUD handlers
  - `backend/alembic/versions/61d1164fa063_category_exclude_from_budget.py` — exemplar for column-add migration
  - `backend/alembic/versions/9650d330fb7a_seed_canonical_categories.py` — exemplar for data-only migration
  - `backend/tests/test_category_exclusion.py` — exemplar for test patterns
  - `frontend/src/pages/Categories.tsx` — current Categories page
  - `frontend/src/pages/__tests__/Categories.test.tsx` — frontend test that will likely need an update for new fields
  - `frontend/src/api/categories.ts` — current TS types
- **Read first**: `docs/plans/2026-05-07-14-csp-category-fields-and-bucket-seed.md`
- **Context**: <orchestrator inlines the current model/schema/router shapes and the latest two migration exemplars so the agent doesn't need to discover them>
- **Owns**: see `Owns` in plan file
- **Must not touch**: see `Must not touch` in plan file. In particular, do NOT modify `budget_service.py`, `Budget.tsx`, `csp_rollup_service.py` (does not exist yet), `net_income_service.py` (does not exist yet).
- **MUST follow the pattern in**: `backend/alembic/versions/61d1164fa063_category_exclude_from_budget.py` (column-add) and `9650d330fb7a_seed_canonical_categories.py` (data-only)
- **Do not** add a CSP rollup service, a net income service, or modify Budget.tsx — Steps 2, 3, and 4 own those.
- **HITL pause point**: After producing the proposed bucket-assignment table (mid-task) and BEFORE running the data migration. Print the proposal as a markdown table to the chat. Wait for user approval. Iterate on edits if requested.
- **If unclear, stop**: how `effective_month` should be stored in the seed migration (irrelevant — that's Step 2); what bucket Health Care, Pets, or Subscriptions belongs in (flag for user attention in the proposal).
- **Handoff**: Write `docs/handoff/step-1-csp-category-fields.md` listing: schema migration revision ID, data migration revision ID, exact bucket-assignment table approved by the user, list of categories with NULL `csp_bucket` (income, transfer, excluded), files modified, any test failures encountered and how resolved.
- Stay within your plan's scope. If you see an improvement that belongs to a later step, leave it.

**HITL checkpoint**: User reviews proposed bucket assignments. Do not run the data migration without explicit approval.

**Gate (after Step 1 completes)**: `make test && cd frontend && npm run build && npm test`. On failure: stop and report. Do not auto-fix.

**Interface gate (after Step 1 completes)**: Verify the following before launching Step 3:
- `Category` model has columns `csp_bucket` (nullable enum) and `is_pre_tax` (boolean, default false)
- `CategoryResponse` exposes both fields
- Every spending category in the database has a non-NULL `csp_bucket`; income/transfer/excluded categories have NULL

### Step 2 — Net income service and paycheck detection

**Plan**: `docs/plans/2026-05-07-15-net-income-and-paycheck-detection.md`

**Agent briefing**:
- **Context sources** (orchestrator reads these before launch):
  - `docs/handoff/step-1-csp-category-fields.md` — confirms Step 1 state (Step 2 doesn't depend on Step 1, but the handoff confirms green tests before Step 2 starts)
  - `backend/app/services/subscription_service.py` — recurring-pattern detection logic to reuse or share
  - `backend/app/services/net_worth_service.py` — service shape exemplar
  - `backend/app/routers/coast_fire_router.py` — small-router exemplar
  - `backend/tests/test_net_worth_service.py` — service test exemplar
  - `backend/tests/test_subscriptions.py` — recurring-detection test patterns
  - `backend/alembic/versions/a3f1c2b8d4e5_accounts_and_transaction_fk.py` — fresh-table migration exemplar
  - `backend/app/main.py` — current router registration
  - `frontend/src/pages/Budget.tsx` — current shape (only the top of the Set Budget tab will receive the interim mount)
- **Read first**: `docs/plans/2026-05-07-15-net-income-and-paycheck-detection.md`
- **Context**: <orchestrator inlines the recurring-pattern detection from `subscription_service.py`, the router registration block from `main.py`, and the current top of the Set Budget tab body in `Budget.tsx`>
- **Owns**: see `Owns` in plan file
- **Must not touch**: see `Must not touch` in plan file. Specifically: do NOT modify `category.py` (Step 1's field), `budget_service.py` (Step 4), `csp_rollup_service.py` (Step 3 creates it), the bulk of `Budget.tsx` (only add the single `<NetIncomeEditor />` mount line at the top of the Set Budget tab body — no other edits).
- **Follow the pattern in**: `backend/app/services/net_worth_service.py` (service shape), `backend/app/routers/coast_fire_router.py` (router shape), `backend/tests/test_net_worth_service.py` (test shape).
- **Do not** modify the existing Set Budget tab content or any other tab — that is Step 3's responsibility. The interim mount is one import + one render line, nothing else.
- **Prior step context**: Step 1 added `csp_bucket` and `is_pre_tax` to Category. Step 2 does not consume these; trust `docs/handoff/step-1-csp-category-fields.md` for the current Category schema.
- **If unclear, stop**: how to share recurring-pattern detection with `subscription_service.py` — extract a shared helper module versus calling the existing detector with parameters. Ask if extraction is preferred.
- **Handoff**: Write `docs/handoff/step-2-net-income.md` listing: migration revision ID for `net_income_periods`, service module names and exported function signatures (`get_for_month`, `set_from_month`, `get_history`, `suggest_monthly_net`), router endpoints registered, frontend component names, exact file location of the interim `<NetIncomeEditor />` mount, any shared helper extracted from `subscription_service.py`.
- Stay within your plan's scope. If you see an improvement that belongs to a later step, leave it.

**Gate (after Step 2 completes)**: `make test && cd frontend && npm run build && npm test`. On failure: stop and report.

**Interface gate (after Step 2 completes)**: Verify before launching Step 3:
- `net_income_service.get_for_month(month)` is importable and returns `Decimal | None`
- `paycheck_detection.suggest_monthly_net()` is importable
- `GET /api/net-income?month=...` and `GET /api/paycheck-detection/suggest` respond
- `NetIncomeEditor` component is mounted at the top of the Set Budget tab

### Step 3 — CSP rollup and Set Budget redesign

**Plan**: `docs/plans/2026-05-07-16-csp-rollup-and-set-budget-redesign.md`

**Agent briefing**:
- **Context sources** (orchestrator reads these before launch):
  - `docs/handoff/step-1-csp-category-fields.md` — Category schema and approved bucket assignments
  - `docs/handoff/step-2-net-income.md` — net income service signatures
  - `backend/app/services/budget_service.py` — existing budget computation patterns (consume, do not modify in this step)
  - `backend/app/routers/budget_router.py` — router exemplar
  - `backend/tests/test_budget_analysis.py` and `test_budget_crud.py` — test exemplars
  - `frontend/src/pages/Budget.tsx` — full file; pay attention to `SetBudgetView`, `FlexBucketView`, `classifyBucket()`, the tabs list (line ~1331), and the existing `<TabsContent value="flex">` block
  - `frontend/src/components/NetIncomeEditor.tsx` — the editor created in Step 2 that this step absorbs into the new layout
  - `frontend/src/api/csp.ts` — does not exist yet; create per plan
- **Read first**: `docs/plans/2026-05-07-16-csp-rollup-and-set-budget-redesign.md`
- **Context**: <orchestrator inlines: the relevant section of `budget_service.py` showing how to query categories with budgets, the `Budget.tsx` regions for `SetBudgetView`, `FlexBucketView`, `classifyBucket`, and the tabs list, plus the `NetIncomeEditor` component signature from Step 2>
- **Owns**: see `Owns` in plan file
- **Must not touch**: see `Must not touch` in plan file. Critically: do NOT modify `budget_service.py` (Step 4 owns the pre-tax actuals branch); do NOT modify the Actual vs Budget tab body or `ActualVsBudgetView` (Step 4 owns that); do NOT modify the Historical tab body.
- **Follow the pattern in**: `backend/app/services/budget_service.py` (service shape with dataclasses), `backend/app/routers/budget_router.py` (router shape), existing `SetBudgetView` (component restructuring).
- **Do not** add the actuals rollup function (`get_actuals_rollup`) — that is Step 4's responsibility. Implement only `get_planning_rollup`.
- **Do not** add `mode=actuals` handling in `csp_router` — Step 4 will extend it. The endpoint may accept the `mode` parameter but only `mode=planning` is implemented.
- **Prior step context**: Steps 1 and 2 added the schema fields, the net income service, and the interim editor mount. Trust the handoff files for exact signatures and current `Budget.tsx` shape. The interim mount must be absorbed into the new top-of-tab layout cleanly.
- **If unclear, stop**: where to render the NULL-`csp_bucket` warning (banner above the dashboard? inline next to the affected category? both?). Ask the user before guessing.
- **Handoff**: Write `docs/handoff/step-3-csp-rollup-and-redesign.md` listing: rollup service module path, `get_planning_rollup` exact signature and `BucketRollup` shape, csp router endpoint path and accepted query params, list of `Budget.tsx` regions added/deleted (specifically: tabs list change, Set Budget tab rewrite, Flex Budget tab deletion, `classifyBucket` deletion, `FlexBucketView` deletion), TypeScript types added in `frontend/src/api/csp.ts`.
- Stay within your plan's scope. If you see an improvement that belongs to a later step, leave it.

**Gate (after Step 3 completes)**: `make test && cd frontend && npm run build && npm test`. On failure: stop and report.

**Interface gate (after Step 3 completes)**: Verify before launching Step 4:
- `csp_rollup_service.get_planning_rollup(month)` is importable and returns the documented `BucketRollup` shape
- `GET /api/csp/rollup?month=...&mode=planning` returns valid JSON
- `Budget.tsx` no longer references `classifyBucket` or `FlexBucketView`; the tabs list contains exactly three values

### Step 4 — Pre-tax actuals and Actual vs Budget CSP integration

**Plan**: `docs/plans/2026-05-07-17-pretax-actuals-and-actual-vs-budget-csp.md`

**Agent briefing**:
- **Context sources** (orchestrator reads these before launch):
  - `docs/handoff/step-1-csp-category-fields.md` — Category schema
  - `docs/handoff/step-2-net-income.md` — net income service signatures
  - `docs/handoff/step-3-csp-rollup-and-redesign.md` — `get_planning_rollup` and `BucketRollup` shape (mirror this for actuals)
  - `backend/app/services/budget_service.py` — full file, focus on `get_actual_vs_budget` and `ActualVsBudgetEntry`
  - `backend/app/services/csp_rollup_service.py` — extend, do not modify the planning function
  - `backend/app/routers/csp_router.py` — extend with `mode=actuals` dispatch
  - `backend/tests/test_rollover_budgets.py` — exemplar for testing changes to `get_actual_vs_budget`
  - `backend/tests/test_budget_crud.py` — additional test exemplar
  - `backend/tests/test_csp_rollup_service.py` — extend with actuals tests
  - `frontend/src/pages/Budget.tsx` — the `ActualVsBudgetView` component and surrounding rendering
- **Read first**: `docs/plans/2026-05-07-17-pretax-actuals-and-actual-vs-budget-csp.md`
- **Context**: <orchestrator inlines: `get_actual_vs_budget` source from `budget_service.py`, the `BucketRollup` shape from Step 3's handoff, the current `ActualVsBudgetView` component>
- **Owns**: see `Owns` in plan file
- **Must not touch**: see `Must not touch` in plan file. Critically: do NOT modify the Set Budget tab body, `get_planning_rollup`, the Historical tab body, or `NetIncomeEditor`.
- **Follow the pattern in**: `backend/tests/test_rollover_budgets.py` (testing `get_actual_vs_budget` changes), the rollup card visual built in Step 3 (match for the Actual vs Budget rollup card).
- **Critical: avoid double-counting in the actuals rollup.** The budget service modification makes pre-tax categories report `actual = budget` via `get_actual_vs_budget`. The actuals rollup numerator is simply the sum of those per-category actuals — do NOT add `pre_tax_budgets` again on top. See the Implementation notes in the plan file.
- **Prior step context**: Steps 1, 2, 3 produced the schema fields, services, planning rollup, and Set Budget redesign. Trust the handoff files for exact signatures.
- **If unclear, stop**: whether `ActualVsBudgetEntry` already includes `csp_bucket` and `is_pre_tax` (if not, add them — frontend needs them for grouping and rendering); how the bucket card status indicator should differ from Step 3's (planning compares to Ramit's range; actuals compares to the planned target).
- **Handoff**: Write `docs/handoff/step-4-pretax-actuals.md` listing: exact change to `get_actual_vs_budget` (file location, before/after of the affected branch), `get_actuals_rollup` signature, `csp_router` mode dispatch shape, `Budget.tsx` Actual vs Budget tab regions modified, regression test names added.
- Stay within your plan's scope. If you see an improvement, file it as a follow-up rather than implementing.

**Gate (after Step 4 completes)**: `make test && cd frontend && npm run build && npm test && make lint`. On failure: stop and report.

## HITL checkpoints

- [ ] Step 1: User reviews proposed bucket assignments for every existing category before the data migration runs. Agent prints proposals as a markdown table; user approves or requests edits.

## Interface gates

- [ ] After Step 1: `Category` has `csp_bucket` (nullable enum) and `is_pre_tax` (bool); `CategoryResponse` exposes both; every spending category has non-NULL `csp_bucket`.
- [ ] After Step 2: `net_income_service.get_for_month` and `paycheck_detection.suggest_monthly_net` importable; `/api/net-income` and `/api/paycheck-detection/suggest` endpoints respond.
- [ ] After Step 3: `csp_rollup_service.get_planning_rollup` importable; `/api/csp/rollup?mode=planning` works; `Budget.tsx` no longer references `classifyBucket` or `FlexBucketView`.

## Soft dependency notes

- Steps 2 and 3 both touch `backend/app/main.py` (router registration). Each adds a single `app.include_router` line. Confirm Step 3's edit doesn't disturb Step 2's registration.
- Steps 2, 3, and 4 all touch `frontend/src/pages/Budget.tsx`, but at non-overlapping regions (Step 2: top-of-tab interim mount; Step 3: Set Budget tab body, tabs list, Flex Budget removal; Step 4: Actual vs Budget tab body). Each step's "Owns" field specifies the region.
- Steps 3 and 4 both touch `csp_rollup_service.py` and `csp_router.py`. Step 3 creates the planning function + endpoint; Step 4 extends the same service with the actuals function and the same endpoint with `mode=actuals` dispatch.

## Completion criteria

- All four plan acceptance criteria met
- `make test && cd frontend && npm run build && npm test && make lint` passes
- HITL bucket-assignment review approved by user
- Manual smoke test of the redesigned Budget page: net income editor works, Set Budget tab dashboard updates live as categories are edited, Flex Budget tab is gone, Actual vs Budget tab shows the four-bucket rollup card and bucket-grouped categories
- Frontend test coverage gap acknowledged: four frontend modules modified with only `Categories.test.tsx` updated; Set Budget redesign and Actual vs Budget changes verified via manual smoke test only

## Out-of-scope reminders for all agents

- Do not update `docs/SPEC.md` — user explicitly skipped that.
- Do not add savings sub-goals, Money Dials, or user-customizable bucket ranges — these are out of scope per the spec.
- Pre-tax categories must not accept transactions — UI prevents it and backend rejects it.
