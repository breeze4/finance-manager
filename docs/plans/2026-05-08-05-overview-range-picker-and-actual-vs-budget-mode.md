# Overview range picker + actual-vs-budget mode

## Parent spec

[`docs/specs/2026-05-08-01-overview-redesign.md`](../specs/2026-05-08-01-overview-redesign.md)

## What to build

The final Overview slice. Adds the range picker, persists state in the URL,
and re-anchors the entire page to the selected range. Backend extends
`pace_service` to support actual-vs-budget mode (used for any range that
isn't `[first-of-current-month, today]`).

1. Backend: extend `pace_service.compute_monthly_pace(db, date_from,
   date_to)` so that when the range is not the in-progress current month,
   it returns `mode = "actual_vs_budget"` with category rows whose
   `expected` is the sum of effective monthly budgets for months in the
   range, and `actual` is the sum of transactions in the range. The
   subscription-holdout logic does not apply — that's a pace-mode-only
   detail. Bucket rollups, headline math, and the response shape stay
   identical aside from the headline copy and the absence of subscription
   accounting.
2. Backend: `GET /api/subscriptions/remaining` returns 204 No Content
   when `date_from != first-of-current-month` or `date_to < today`.
3. Backend: `GET /api/stats/spending-trend` already accepts a range; verify
   it produces correct output for the seven preset ranges.
4. Frontend: new `useOverviewRange` hook with seven presets (current MTD,
   last 30 days, 3 months, YTD, 1 year, last year, custom) plus a custom
   date picker. State persists to the URL as `?range=current-mtd` for
   presets and `?from=YYYY-MM-DD&to=YYYY-MM-DD` for custom. A bare URL
   defaults to current MTD.
5. Frontend: new `RangePicker` component (preset dropdown + custom
   date-range trigger). Mounted at the top of the Overview page.
6. Frontend: every Overview section subscribes to the picker range, re-
   queries on change. Pace headline copy changes between pace mode ("On
   pace — $X under expected") and actual-vs-budget mode ("Spent $X /
   Budgeted $Y / $Z under" or "Over by $Z"). Bucket cards drop the pace
   bar in actual-vs-budget mode and show a simple progress fill against
   the range budget. Subscriptions-remaining card hides itself when the
   endpoint returns 204. Trend chart spans months covered by the range.
   Recent transactions filters to within the range.

See spec sections "Behavior" (actual-vs-budget mode, range picker presets,
cross-cutting rules), "Resolved Decisions" (picker persistence,
custom-range mode rule).

## Type

AFK

## Blocked by

- Blocked by `2026-05-08-01-overview-pace-foundation.md`
- Blocked by `2026-05-08-02-overview-top-movers-and-recent-txns.md`
- Blocked by `2026-05-08-03-overview-spending-trend-chart.md`
- Blocked by `2026-05-08-04-overview-subscriptions-remaining.md`

## User stories addressed

User stories 13, 14, 15, 16, 17 from the parent spec.

## Acceptance criteria

- [ ] `pace_service.compute_monthly_pace(db, date_from, date_to)` no
  longer raises for non-pace ranges; instead returns `mode =
  "actual_vs_budget"` with the documented shape.
- [ ] Pace-mode discriminator: `mode = "pace"` iff `date_from ==
  first-of-current-month` AND `date_to >= today`. Otherwise
  `actual_vs_budget`. Verified by unit and integration tests covering
  both branches.
- [ ] Headline math in actual-vs-budget mode: variance = sum across
  spending categories of `(actual − Σ effective_monthly_budget for months
  in range)`. Headline copy adjusts accordingly.
- [ ] Pre-tax exclusion still applies; uncategorized handling still
  applies; transfers still excluded.
- [ ] `GET /api/subscriptions/remaining` returns 204 when range is not
  in-progress current month. Verified by integration test.
- [ ] `GET /api/stats/spending-trend` returns correct data for each of
  the seven preset ranges. Verified by integration tests for last-30,
  3-months, YTD, 1-year, last-year, and a custom range.
- [ ] `useOverviewRange` hook reads the URL on mount, writes on change,
  and exposes `{range: {preset, date_from, date_to}, setRange,
  presets[]}`. Bare URL defaults to current MTD.
- [ ] URL forms supported: `?range=current-mtd`, `?range=last-30-days`,
  `?range=3-months`, `?range=ytd`, `?range=1-year`, `?range=last-year`,
  `?from=YYYY-MM-DD&to=YYYY-MM-DD` (custom).
- [ ] `RangePicker` UI shows the seven presets in a dropdown plus a
  "Custom" option that opens a date-range picker.
- [ ] Every Overview section's TanStack Query key includes the range so
  that picker change triggers refetch.
- [ ] Subscriptions-remaining card hides when the endpoint returns 204.
- [ ] Recent transactions section filters to `date_from`/`date_to` from
  the picker.
- [ ] Trend chart shows months covered by the range; for "1 year" → 12
  bars, for "3 months" → 3 bars, for "last year" → 12 bars from prior
  calendar year, etc.
- [ ] Bucket cards show pace bars only in pace mode; in actual-vs-budget
  mode they show a simple progress fill against range budget.
- [ ] Pace-service unit tests cover actual-vs-budget mode: range across
  multiple months, range that ends before today, range crossing year
  boundary, override-vs-baseline behavior across multiple months.
- [ ] `make test` and `cd frontend && npm test` both pass.
- [ ] `make lint` passes.

## Owns

- `backend/app/services/pace_service.py` — extend with actual-vs-budget
  mode logic; do not modify the pace-mode helper signatures
- `backend/app/routers/stats_router.py` — drop the 400 guard on
  `monthly_pace` (no longer needed)
- `backend/app/routers/subscription_router.py` — add the 204 response
  branch on `remaining` for non-current-MTD ranges
- `backend/tests/test_pace_service.py` — extend with actual-vs-budget
  mode tests
- `backend/tests/test_stats_api.py` — extend with mode-discriminator
  integration tests covering both branches
- `backend/tests/test_subscriptions.py` — extend with 204 case
- `frontend/src/hooks/useOverviewRange.ts` — new
- `frontend/src/components/overview/RangePicker.tsx` — new
- `frontend/src/pages/Overview.tsx` — wire the picker into every section,
  pass range into queries
- `frontend/src/components/overview/PaceHeadline.tsx` — extend to
  render actual-vs-budget copy when `mode = "actual_vs_budget"`
- `frontend/src/components/overview/BucketCard.tsx` — extend to render
  the simple progress fill when `mode = "actual_vs_budget"`
- `frontend/src/components/overview/TopMoversTable.tsx` — already sorts
  by `|actual - expected|`; verify it works for both modes (no change
  expected, just confirm)
- `frontend/src/components/overview/SpendingTrendChart.tsx` — accept the
  range from the picker; chart adapts to span months covered
- `frontend/src/components/overview/RecurringRemainingCard.tsx` — handle
  the 204 case (hide the card)
- `frontend/src/components/overview/RecentTransactionsList.tsx` — accept
  range; filter transactions accordingly

## Must not touch

- `backend/app/services/budget_service.py` — read-only consumer.
- `backend/app/services/subscription_due_service.py` — already correct
  from plan 1.
- `backend/app/services/stats_service.py:get_spending_trend` — already
  accepts a range; do not modify, only verify.
- The pace-mode branch of `pace_service` from plan 1 — extend in
  parallel, do not refactor.
- Existing endpoints `summary`, `monthly`, etc. on stats_router.

## Defines interfaces

- Picker URL contract: the query-string format becomes part of the
  product surface (deep-linkable). Document in code comments at the
  hook.
- Pace endpoint mode discriminator: this plan completes the contract by
  adding the second branch promised in plan 1.

## Pattern exemplar

- **Follow the pattern in**: `frontend/src/hooks/useGlobalFilters.tsx` —
  existing global-filter hook. Mirror its API style (returns state +
  setter + presets/options) but use URL persistence instead of in-memory
  state. URL handling: use react-router's `useSearchParams`.
- **Follow the pattern in**:
  `frontend/src/components/DateRangePicker.tsx` — already exists in the
  codebase. Reuse it for the custom date range; do not roll a new one.
- **Follow the pattern in**: `backend/app/services/csp_rollup_service.py`
  for the dual-mode pattern — `get_planning_rollup` and
  `get_actuals_rollup` are sibling functions sharing internal helpers.
  Apply the same pattern for the pace-mode vs actual-vs-budget branch in
  `pace_service`.
- **Follow the pattern in**: `backend/tests/test_csp_rollup_service.py`
  for tests covering both modes of a dual-mode service.

## Tasks

- [ ] Extend `pace_service.compute_monthly_pace` with the
  actual-vs-budget branch. Internal helper for the budget summing across
  months in range.
- [ ] Drop the 400 guard in the `monthly_pace` endpoint handler.
- [ ] Add 204 branch to `GET /api/subscriptions/remaining` when range
  isn't current MTD.
- [ ] Verify (with new tests) that `get_spending_trend` produces correct
  data for each preset range.
- [ ] Extend `test_pace_service.py` with actual-vs-budget mode tests.
- [ ] Extend `test_stats_api.py` with mode-discriminator integration
  tests.
- [ ] Extend `test_subscriptions.py` with 204 case.
- [ ] Build `useOverviewRange.ts` hook with `useSearchParams`-based URL
  persistence and the seven presets.
- [ ] Build `RangePicker.tsx` (dropdown of presets + custom date entry
  via the existing `DateRangePicker`).
- [ ] Wire the picker into `Overview.tsx`. Each section's query key
  includes the range; queries refetch on picker change.
- [ ] Extend `PaceHeadline.tsx` to render actual-vs-budget copy when
  `mode = "actual_vs_budget"`.
- [ ] Extend `BucketCard.tsx` to render simple progress fill in
  actual-vs-budget mode.
- [ ] Update `RecurringRemainingCard.tsx` to handle 204 by hiding.
- [ ] Update `RecentTransactionsList.tsx` to accept range and pass it to
  the transactions query.
- [ ] Update `SpendingTrendChart.tsx` to accept range from picker.
- [ ] Smoke-test against dev server: cycle through all seven presets,
  verify subs-remaining hides, headline copy switches, trend bars match
  the picker.
- [ ] Run `make test`, `cd frontend && npm test`, `make lint`.

## Implementation notes

- **Preset → range mapping** (use these definitions exactly):
  - `current-mtd` → `[first-of-current-month, today]`
  - `last-30-days` → `[today − 30 days, today]`
  - `3-months` → `[today − 3 months, today]`
  - `ytd` → `[Jan 1 of current year, today]`
  - `1-year` → `[today − 1 year, today]`
  - `last-year` → `[Jan 1 prior year, Dec 31 prior year]`
  - `custom` → user-supplied `from` / `to`
- The pace-mode predicate is exact: `date_from == first-of-current-month
  AND date_to >= today`. A custom range that happens to match this is
  pace mode; anything else is actual-vs-budget. There is no fuzzy
  alignment.
- `useOverviewRange` should expose a `presets` array suitable for
  rendering the dropdown directly, including a stable `key`/`label`/
  `range` shape for each.
- All TanStack Query keys for Overview queries must include
  `[range.preset, range.date_from, range.date_to]` so that picker change
  invalidates all four queries simultaneously.
