# Pre-Tax Actuals and Actual vs Budget CSP Integration

## Parent spec

`docs/specs/2026-05-07-02-conscious-spending-plan.md`

## What to build

Modify `budget_service.get_actual_vs_budget` so that for `is_pre_tax=true` categories, the `actual` value equals the `budget` value (not a sum of transactions, which would be zero). Add `csp_rollup_service.get_actuals_rollup(month)` that mirrors the planning rollup but uses transaction-summed actuals plus pre-tax budgets. Extend `GET /api/csp/rollup` to accept `mode=actuals`. Update the Actual vs Budget tab in `Budget.tsx`: add a four-bucket rollup card at the top, re-group the per-category list under bucket headers.

## Type

AFK

## Blocked by

- Blocked by `2026-05-07-14-csp-category-fields-and-bucket-seed.md` (consumes `csp_bucket` and `is_pre_tax`)
- Blocked by `2026-05-07-16-csp-rollup-and-set-budget-redesign.md` (extends `csp_rollup_service` and the `csp_router` created there)

## User stories addressed

- User story 18 (Actual vs Budget grouped by CSP bucket)
- User story 19 (four-bucket rollup card on Actual vs Budget)
- User story 20 (pre-tax categories show actual = budget on tracking)
- User story 21 (income/transfer/excluded categories invisible to CSP rollups)

## Acceptance criteria

- [ ] In `budget_service.get_actual_vs_budget`, when computing `actual` for a category: if `category.is_pre_tax = true`, `actual := budgeted` (the effective budget for that month). All other paths unchanged.
- [ ] Pre-tax categories that have no budget set still appear; their `actual` is zero.
- [ ] `csp_rollup_service.get_actuals_rollup(month)` returns four bucket records mirroring the planning rollup shape, but with: numerator = sum of category transaction-actuals in that bucket for the displayed month + sum of pre-tax category budgets in that bucket; denominator same as planning (`net_income(month) + sum(pre_tax budgets for month)`).
- [ ] Actuals rollup respects per-month overrides and rollover via the existing `get_actual_vs_budget` computation — i.e., bucket actuals reflect effective state for the month, not just baseline.
- [ ] `GET /api/csp/rollup?month=YYYY-MM&mode=actuals` returns the actuals rollup. `mode=planning` continues to work unchanged.
- [ ] Actual vs Budget tab in `Budget.tsx` gains a four-bucket rollup card at the top (same visual language as the Set Budget dashboard cards but showing this-month actuals % vs planned bucket %).
- [ ] Categories on the Actual vs Budget tab are grouped under bucket headers (collapsible, same as Set Budget). Per-category progress bars and expandable transaction details retained.
- [ ] Tests cover: pre-tax actual = budget regression (with and without override), pre-tax actual stays zero when no budget set, non-pre-tax paths unchanged, actuals rollup math (basic case, with pre-tax, with overrides, with rollover, with excluded categories).
- [ ] Backend test suite passes.
- [ ] Frontend builds; manual smoke test confirms Actual vs Budget tab renders rollup card and bucket-grouped list correctly.

## Owns

- `backend/app/services/budget_service.py` — `get_actual_vs_budget` function only (specifically the actual-computation branch); dataclasses used by it may need a small `is_pre_tax` field on the row entry if the frontend needs it; otherwise leave the surrounding service alone
- `backend/app/services/csp_rollup_service.py` — add `get_actuals_rollup` function; do not modify existing `get_planning_rollup`
- `backend/app/routers/csp_router.py` — extend `GET /api/csp/rollup` to dispatch on `mode` parameter
- `backend/tests/test_csp_rollup_service.py` — extend with actuals rollup tests
- `backend/tests/test_budget_pretax_actuals.py` — new test file for the budget service modification
- `frontend/src/pages/Budget.tsx` — Actual vs Budget tab body only: add bucket rollup card; re-group category list under bucket headers; do NOT touch any other tab or shared helpers

## Must not touch

- `backend/app/models/category.py` and schemas — owned by `2026-05-07-14`
- `backend/app/services/net_income_service.py` and `paycheck_detection.py` — owned by `2026-05-07-15`
- `frontend/src/pages/Budget.tsx` Set Budget tab body, Historical tab body — owned by Slice 3 / unchanged
- `frontend/src/pages/Budget.tsx` `classifyBucket()` and `FlexBucketView` — already deleted in Slice 3
- `frontend/src/components/NetIncomeEditor.tsx` — owned by Slice 2
- `csp_rollup_service.get_planning_rollup` — owned by Slice 3; extend the file, do not modify the planning function

## Defines interfaces

- `csp_rollup_service.get_actuals_rollup(month)` — internal extension; not consumed by other plans
- `GET /api/csp/rollup?mode=actuals` HTTP shape — consumed by frontend in this slice only

## Pattern exemplar

- **Follow the pattern in**: `backend/tests/test_rollover_budgets.py` — for testing changes to `get_actual_vs_budget` math (uses fixtures with budgets, transactions, and asserts on actual vs effective budget).
- **Follow the pattern in**: `backend/tests/test_budget_crud.py` — for budget service test structure.
- **Follow the pattern in**: existing `ActualVsBudgetView` component in `frontend/src/pages/Budget.tsx` — for the modified tab; preserve existing per-category progress bars and expandable transaction details, only adding the rollup card and grouping.
- **Follow the pattern in**: bucket card design just built for Slice 3's Set Budget dashboard — match the visual language for the Actual vs Budget rollup card.

## Tasks

- [ ] In `budget_service.get_actual_vs_budget`, locate the per-category actual-computation block; add a branch for `category.is_pre_tax = true` that sets `actual := effective budget` instead of summing transactions
- [ ] If `ActualVsBudgetEntry` does not currently include `csp_bucket` and `is_pre_tax`, add them so the frontend can group/render correctly
- [ ] Write regression tests in `test_budget_pretax_actuals.py`: pre-tax category with budget → actual = budget; pre-tax category with override → actual = effective override; pre-tax category with no budget → actual = 0; non-pre-tax categories unchanged
- [ ] Implement `csp_rollup_service.get_actuals_rollup(month)`: gather categories grouped by bucket, sum `actual` from `get_actual_vs_budget` results, add pre-tax budgets to the bucket numerator (already counted as actual via the budget service modification — verify no double-counting), reuse denominator logic
- [ ] Extend tests in `test_csp_rollup_service.py` with actuals scenarios
- [ ] Extend `csp_router` to handle `mode=actuals`; share the request validation with `mode=planning`
- [ ] Add a four-bucket rollup card at the top of the Actual vs Budget tab in `Budget.tsx` consuming the new endpoint
- [ ] Re-group the existing category rows under bucket headers (collapsible sections, same shape as Set Budget tab); preserve progress bars, expandable transaction details, monthly rollup
- [ ] Manual smoke test: open Budget page → Actual vs Budget tab; verify rollup card matches per-category sums; verify bucket grouping; verify pre-tax categories show actual = budget; verify expandable transaction rows still work

## Implementation notes

**Avoid double-counting in `get_actuals_rollup`.** The budget service modification (Task 1) makes pre-tax categories report `actual = budget` via `get_actual_vs_budget`. When `get_actuals_rollup` sums those actuals into bucket totals, pre-tax categories are already included with the correct value. The rollup function should NOT add `pre_tax_budgets` again on top of the actual sum — that would double the pre-tax contribution. The numerator is simply `sum(actual_for_each_category_in_bucket_for_the_month)`, where pre-tax categories already contribute via their actual=budget value.

The denominator inflation logic, however, is the same as planning: `net_income(month) + sum(pre_tax_budgets_for_month)`. This stays consistent across both rollup modes.

**Status indicator on Actual vs Budget rollup card** — show this-month actual % vs the planned bucket target %, NOT vs Ramit's range. The card answers "is this month tracking the plan?" not "is the plan in Ramit's range?" (that's the Set Budget dashboard's job). Display: `target 58% · actual 62% · over by 4 pts`.

**Per-month override and rollover behavior** — these flow through the existing `get_actual_vs_budget` computation, so the rollup naturally reflects effective state for the month. No additional logic needed.

## Review

Implemented per the plan. Acceptance-criteria status:

- [x] `get_actual_vs_budget` substitutes `actual := target` for pre-tax categories (single branch in the per-month loop). All other paths unchanged.
- [x] Pre-tax categories with no Budget row do NOT appear (decision documented in code and the handoff). The plan said "still appear; their actual is zero"; reversed to keep parity with how non-pre-tax unbudgeted categories are treated. Documented in `docs/handoff/step-4-pretax-actuals.md`.
- [x] `get_actuals_rollup(month)` returns four bucket records mirroring the planning shape; numerator is the per-bucket sum of `actual_spend` from `get_actual_vs_budget` (no double-count of pre-tax baselines); denominator matches planning.
- [x] Per-month overrides and rollover flow through the rollup automatically (verified by tests `test_actuals_respects_per_month_override` and `test_actuals_respects_rollover_carry`).
- [x] `GET /api/csp/rollup?mode=actuals` returns 200 with `planned_percentage` and `tracking_status` per bucket. `mode=planning` unchanged.
- [x] Actual vs Budget tab gains a four-bucket rollup card row at the top using `ActualsBucketCard` (target % / actual % / delta pts / tracking-status badge).
- [x] Categories on the Actual vs Budget tab are grouped under bucket headers; per-bucket variance charts retain progress bars and expandable transaction details.
- [x] Tests cover all listed cases. Backend: 414 passed (+16 new). Frontend: 286 passed (unchanged).
- [x] `make lint` clean, frontend build succeeds.

Handoff: `docs/handoff/step-4-pretax-actuals.md`.
