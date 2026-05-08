# Overview spending trend chart

## Parent spec

[`docs/specs/2026-05-08-01-overview-redesign.md`](../specs/2026-05-08-01-overview-redesign.md)

## What to build

Add a 6-month "actual vs expected total spending" trend chart to Overview:

1. Backend: extend `stats_service` with `get_spending_trend(db, date_from,
   date_to)` returning `[{month: "YYYY-MM", actual, expected}]` for whole
   calendar months whose any day overlaps the range. Honors transfer
   exclusion, `exclude_from_budget` exclusion, pre-tax exclusion. "Actual"
   sums non-transfer transactions for the month; "expected" sums effective
   monthly budgets (override > baseline) for that month.
2. New endpoint `GET /api/stats/spending-trend?date_from=&date_to=`.
3. Frontend: `SpendingTrendChart` component (two-series Recharts bar or
   line chart) wired into Overview below the recent-transactions section.
   For this plan, the range is hardcoded to "last 6 months ending today";
   range-picker integration arrives in plan `2026-05-08-05`.

See spec sections "Behavior" (cross-cutting rules) and "Modules" (spending-
trend extension).

## Type

AFK

## Blocked by

- Blocked by `2026-05-08-01-overview-pace-foundation.md` — Overview page
  exists from plan 1; this plan appends another section.

(Independent of plan 2 in code surface, but sequenced after for merge
hygiene.)

## User stories addressed

User story 10 from the parent spec.

## Acceptance criteria

- [ ] `stats_service.get_spending_trend(db, date_from, date_to)` returns
  the documented per-month list for the full set of calendar months any of
  whose days fall in the range.
- [ ] Each month's `actual` is the sum of non-transfer, non-excluded, non-
  pre-tax category transactions in that month (positive value; outflows
  abs-summed).
- [ ] Each month's `expected` is the sum of effective monthly budgets for
  the same set of categories for that month (override taking precedence
  over baseline).
- [ ] Pre-tax categories are excluded from both totals.
- [ ] Endpoint integration test: `GET /api/stats/spending-trend?date_from=
  <ISO>&date_to=<ISO>` returns 200 with the documented shape.
- [ ] Service unit tests cover: range that starts mid-month (still emits
  whole months), range that ends mid-month (emits the partial month with
  partial actual but full expected), range crossing year boundary,
  override-vs-baseline handling, pre-tax exclusion.
- [ ] Frontend `SpendingTrendChart` renders a two-series chart for the
  last 6 months (computed on the fly as today − 6 months → today).
- [ ] Empty-data state ("No data for this range") renders cleanly when the
  endpoint returns an empty list.
- [ ] `make test` and `cd frontend && npm test` both pass.
- [ ] `make lint` passes.

## Owns

- `backend/app/services/stats_service.py` — add `get_spending_trend`
  function; do not alter `get_summary` or `get_monthly_stats`
- `backend/app/schemas/stats.py` — add `SpendingTrendResponse`,
  `TrendMonth` schemas
- `backend/app/routers/stats_router.py` — add `spending_trend` endpoint
- `backend/tests/test_stats_api.py` — extend with spending-trend
  integration test
- `backend/tests/test_stats_service.py` — new (if it doesn't exist) or
  extend with `get_spending_trend` unit tests
- `frontend/src/api/overview.ts` — add `getSpendingTrend(range)` (extends
  the file from plan 1)
- `frontend/src/components/overview/SpendingTrendChart.tsx` — new
- `frontend/src/pages/Overview.tsx` — insert the chart section below
  recent-transactions; do not alter sections owned by plans 1–2.

## Must not touch

- `backend/app/services/pace_service.py`,
  `subscription_due_service.py` — owned by plan 1.
- `backend/app/services/budget_service.py` — read-only consumer of its
  effective-budget logic.
- `frontend/src/components/overview/PaceHeadline.tsx`,
  `BucketCard.tsx`, `TopMoversTable.tsx`,
  `RecentTransactionsList.tsx` — owned by plans 1–2.
- The headline / bucket-card / top-movers / recent-txns sections of
  `Overview.tsx`.

## Defines interfaces

- `SpendingTrendResponse` schema in `backend/app/schemas/stats.py` —
  consumed by plan `2026-05-08-05` (range picker), which calls the same
  endpoint with a different range but the same shape.

## Pattern exemplar

- **Follow the pattern in**: `backend/app/services/stats_service.py`'s
  existing `get_monthly_stats` — same module, same style of per-month
  group-by query with extract(year, month). Mirror the SQLAlchemy
  patterns.
- **MUST follow the pattern in**: `backend/app/routers/stats_router.py` —
  add the new endpoint alongside the existing two; same dependency
  injection + Pydantic response_model style.
- **Follow the pattern in**: `frontend/src/components/NetWorthChart.tsx`
  — Recharts component pattern with two series, themed tooltip, no
  animation (matches Overview convention from plan 1).
- **Follow the pattern in**: `backend/tests/test_stats_api.py` — for the
  endpoint integration test.

## Tasks

- [ ] Add `SpendingTrendResponse` and `TrendMonth` Pydantic schemas to
  `backend/app/schemas/stats.py`.
- [ ] Implement `stats_service.get_spending_trend(db, date_from, date_to)`.
- [ ] Wire `GET /api/stats/spending-trend` in `stats_router.py`.
- [ ] Add `get_spending_trend` unit tests under `tests/test_stats_service.py`
  (create the file if it doesn't already exist; check first).
- [ ] Extend `tests/test_stats_api.py` with a spending-trend endpoint
  integration test.
- [ ] Add `getSpendingTrend(range)` to `frontend/src/api/overview.ts`.
- [ ] Build `SpendingTrendChart.tsx` (two-series chart; "actual" and
  "expected" colors mirror the existing Overview palette).
- [ ] Insert the chart section into `Overview.tsx` below recent
  transactions. Hardcode range to `today − 6 months → today`.
- [ ] Smoke-test against dev server.
- [ ] Run `make test`, `cd frontend && npm test`, `make lint`.

## Implementation notes

- The "expected" computation reuses budget_service's effective-budget
  resolution (`get_effective_budget(category_id, year, month)` or
  whatever the existing helper is named — verify in the file). Do not
  re-implement override resolution.
- For chart styling, mirror the dark-theme palette used in
  `NetWorthChart.tsx` and the new `BucketCard.tsx` from plan 1. Two
  distinct colors: actual (e.g., teal) and expected (e.g., muted blue).
