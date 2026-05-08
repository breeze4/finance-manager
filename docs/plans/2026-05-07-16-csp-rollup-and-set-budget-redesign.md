# CSP Rollup Service and Set Budget Tab Redesign

## Parent spec

`docs/specs/2026-05-07-02-conscious-spending-plan.md`

## What to build

Add the `csp_rollup_service` (planning rollup only — actuals rollup is Slice 4). Expose it via a new `/api/csp/rollup` endpoint. Rewrite the Set Budget tab in `Budget.tsx` to be the CSP planning surface: net income block at top (absorbs the interim editor placed in Slice 2), four-bucket dashboard cards with Ramit ranges and in/over/under indicators, bucket-grouped collapsible category list with inline editable baseline, historical-average hint per row, override and rollover indicators retained.

In the same change, delete the Flex Budget tab, the `classifyBucket()` heuristic, and `FlexBucketView` from `Budget.tsx`. Update the tabs list to omit Flex Budget. The Budget page now has three tabs: Historical | Set Budget (CSP-flavored) | Actual vs Budget.

## Type

AFK

## Blocked by

- Blocked by `2026-05-07-14-csp-category-fields-and-bucket-seed.md` (consumes `csp_bucket` and `is_pre_tax`)
- Blocked by `2026-05-07-15-net-income-and-paycheck-detection.md` (consumes `net_income_service` for the rollup denominator)

## User stories addressed

- User story 2 (historical averages alongside category targets)
- User story 7 (four-bucket dashboard at top of Set Budget)
- User story 8 (under/in-range/over indicator per bucket)
- User story 9 (inline edit of category baseline)
- User story 10 (live update of bucket %s as edits happen)
- User story 11 (categories grouped by bucket)
- User story 12 (per-month overrides retained)
- User story 13 (rollover toggle retained)
- User story 14 (dashboard reflects baseline only, not rollover/overrides)
- User story 22 (warning surfaced if any spending category lacks a bucket — visual lands here)

## Acceptance criteria

- [ ] `csp_rollup_service.get_planning_rollup(month) -> list[BucketRollup]` returns four bucket records: numerator (sum of category baselines + sum of pre-tax budgets in that bucket), percentage of denominator, denominator (`net_income(month) + sum(all pre_tax budgets for month)`), Ramit range, status (`under | in-range | over`).
- [ ] Rollup excludes: income categories, `is_transfer=true` transactions, `exclude_from_budget=true` categories, categories with NULL `csp_bucket`. Pre-tax categories are included with `actual_for_planning := budget`.
- [ ] If any spending category has NULL `csp_bucket`, the response includes a `warning` field listing those categories. Frontend renders the warning prominently.
- [ ] Investments bucket: when value exceeds 10%, `status = 'over'` but UI labels it `over (ok)` — flag conveyed via a separate response field.
- [ ] `GET /api/csp/rollup?month=YYYY-MM&mode=planning` returns the rollup. (Slice 4 will add `mode=actuals`.)
- [ ] Set Budget tab in `Budget.tsx` rewritten with: net income block at top (consumes Slice 2's `NetIncomeEditor`), four bucket dashboard cards (each: bucket name, baseline %, baseline $, Ramit range, status indicator), bucket-grouped collapsible category list with editable baseline input, historical-average muted hint, per-month override badge, rollover toggle.
- [ ] Inline editing: changing a baseline value PUTs to existing budget endpoint and re-fetches the rollup; bucket cards update live.
- [ ] Bucket dashboard %s reflect baseline targets only — no rollover surplus, no per-month overrides.
- [ ] Flex Budget tab fully removed: tab trigger gone, tab content gone, `classifyBucket()` deleted, `FlexBucketView` deleted, all related imports cleaned up.
- [ ] Tabs list updated to three values: `historical | set | actual` — `default value` updated if it was `flex`.
- [ ] Tests cover: planning rollup math (basic case, with pre-tax categories, with excluded categories, with NULL bucket categories), denominator inflation, range classifier (under/in-range/over), Investments "over (ok)" labeling.
- [ ] Backend test suite passes.
- [ ] Frontend builds and Set Budget tab renders end-to-end with real data; manual smoke test confirms inline edits update bucket cards.

## Owns

- `backend/app/services/csp_rollup_service.py` — new file with `get_planning_rollup` only
- `backend/app/routers/csp_router.py` — new file with `GET /api/csp/rollup` (planning mode only; Slice 4 extends it)
- `backend/app/main.py` — register the csp router (single line)
- `backend/tests/test_csp_rollup_service.py` — new test file (planning rollup tests)
- `frontend/src/api/csp.ts` — new file with TypeScript types
- `frontend/src/pages/Budget.tsx` — Set Budget tab body (rewrite); Flex Budget tab body (delete); tabs list (remove Flex Budget); `classifyBucket()` (delete); `FlexBucketView` (delete); related imports

## Must not touch

- `backend/app/services/budget_service.py` — owned by `2026-05-07-17` (pre-tax actuals modification)
- `backend/app/models/category.py` and schemas — owned by `2026-05-07-14`
- `backend/app/services/net_income_service.py` and `paycheck_detection.py` — owned by `2026-05-07-15`
- `frontend/src/pages/Budget.tsx` Actual vs Budget tab body — owned by `2026-05-07-17`
- `frontend/src/pages/Budget.tsx` Historical tab body — leave unchanged
- `frontend/src/components/NetIncomeEditor.tsx` — created in Slice 2, this slice consumes it; only refactor if absorbing it into the new layout requires it (and then minimally)

## Defines interfaces

- `csp_rollup_service.get_planning_rollup(month) -> list[BucketRollup]` — consumed by Slice 4 (which adds the actuals counterpart in the same service)
- `GET /api/csp/rollup` HTTP shape (with `mode=planning`) — consumed by Slice 4 (which adds `mode=actuals` to the same endpoint)
- Verification gate: rollup service unit tests must pass before Slice 4 extends the service

## Pattern exemplar

- **Follow the pattern in**: `backend/app/services/budget_service.py` — for service shape, dataclass response types, and SQLAlchemy query patterns.
- **Follow the pattern in**: `backend/app/routers/budget_router.py` — for the new csp router.
- **Follow the pattern in**: `backend/tests/test_budget_analysis.py` and `test_budget_crud.py` — for service test structure, fixtures, and assertions on aggregation math.
- **Follow the pattern in**: `frontend/src/pages/Budget.tsx` existing `SetBudgetView` component — for the rewrite (similar inputs and editing patterns, restructured into bucket groups).

## Tasks

- [ ] Design the `BucketRollup` response shape; document fields in `csp_rollup_service.py`
- [ ] Implement `get_planning_rollup(month)`: gather categories, group by bucket, sum baselines + pre-tax budgets, compute denominator from net income service + pre-tax sum, classify against Ramit ranges
- [ ] Add NULL-bucket detection: any spending category with NULL `csp_bucket` (and not income/transfer/excluded) goes into the warning list
- [ ] Add Investments "over (ok)" flag in the response
- [ ] Write unit tests for the rollup service: basic case, with pre-tax, with excluded categories, with NULL-bucket warnings, range classification edge cases
- [ ] Build `csp_router` with `GET /api/csp/rollup?month=...&mode=planning`
- [ ] Register the router in `backend/app/main.py`
- [ ] Add `frontend/src/api/csp.ts` with types and fetch function
- [ ] Rewrite Set Budget tab body: net income block at top (mount `NetIncomeEditor`), four bucket cards row, bucket-grouped collapsible category list with editable baseline + historical hint + override/rollover indicators
- [ ] Delete Flex Budget tab trigger from the tabs list, delete the `<TabsContent value="flex">` block, delete `classifyBucket()`, delete `FlexBucketView`
- [ ] Update default tab value if it was `flex`
- [ ] Manual smoke test: open Budget page, see new Set Budget tab, edit a category baseline, watch bucket cards update live
- [ ] Manual smoke test: open Budget page, confirm Flex Budget tab is gone

## Implementation notes

Range classifier (Ramit's defaults, hardcoded constants):
- Fixed: 50–60% — under if < 50, over if > 60
- Investments: ≥ 10% — under if < 10, "over (ok)" if > 10 (do not penalize)
- Savings: 5–10% — under if < 5, over if > 10
- Guilt-Free: 20–35% — under if < 20, over if > 35

Net income block at top of the tab should show:
- Current monthly amount (large number)
- Composition: `take-home + pre-tax sum` with tooltip explaining the synthetic denominator
- "Effective from <month>" with link to history drilldown
- Edit button opening the modal from Slice 2

Bucket card composition (each of four):
- Bucket name
- Baseline % (large)
- Baseline $ (smaller)
- Ramit range (e.g., "Range: 50–60%")
- Status indicator: green check if in-range, amber/red caret if under/over, "over (ok)" badge for Investments

Category list section (one per bucket, collapsible):
- Section header: bucket name + total $ + bucket count
- Per-row: category name, editable baseline input, muted historical-avg hint, override badge if any, rollover toggle, pre-tax tag if applicable
