# Step 3 — Overview spending trend chart

Adds the actual-vs-expected per-month bar chart between the bucket grid
and the top-movers table, plus the backend endpoint that powers it.
The same endpoint is what Step 5's range picker will call with arbitrary
ranges — the URL contract is stable.

## 1. Files created / modified

### Created
- `backend/tests/test_stats_service.py` — new file. 9 unit tests
  covering range-edge cases (mid-month start, mid-month end, year
  boundary), the three exclusions (transfer / `exclude_from_budget` /
  pre-tax), override-vs-baseline, and empty/inverted ranges.
- `frontend/src/components/overview/SpendingTrendChart.tsx` — pure
  presentation component (props in, chart out). Two-series
  `<BarChart>` mirroring `NetWorthChart.tsx`'s themed-tooltip /
  no-animation conventions.
- `frontend/src/components/overview/__tests__/SpendingTrendChart.test.tsx`
  — 3 render-asserts tests (loading state, empty state, mounts with
  real data).

### Modified
- `backend/app/services/stats_service.py` — added
  `get_spending_trend(db, *, date_from, date_to)` and a private
  `_effective_monthly_budget` helper. `get_summary` /
  `get_monthly_stats` untouched.
- `backend/app/schemas/stats.py` — added `TrendMonth` and
  `SpendingTrendResponse`. Existing schemas untouched.
- `backend/app/routers/stats_router.py` — added
  `GET /api/stats/spending-trend`. Existing `/summary`, `/monthly`,
  `/monthly-pace` untouched.
- `backend/tests/test_stats_api.py` — appended a
  `TestSpendingTrendEndpoint` class (4 tests: 200 OK + shape, month
  count, row keys, actual+expected math).
- `frontend/src/api/overview.ts` — appended `TrendMonth`,
  `SpendingTrendResponse`, `getSpendingTrend(...)`. Existing
  exports untouched.
- `frontend/src/pages/Overview.tsx` — added a `trendQ` TanStack Query
  and a `<Card>` containing `<SpendingTrendChart>` between the
  bucket grid and the top-movers table.

Must-not-touch list was respected: no edits to `pace_service.py`,
`subscription_due_service.py`, `budget_service.py`,
`csp_rollup_service.py`, `PaceHeadline.tsx`, `BucketCard.tsx`,
`TopMoversTable.tsx`, or `RecentTransactionsList.tsx`.

## 2. Endpoint contract

```
GET /api/stats/spending-trend?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
response_model: SpendingTrendResponse

200 OK with body:
{
  "date_from": "2025-04-01",
  "date_to":   "2025-09-30",
  "months": [
    { "month": "2025-04", "actual": 1234.56, "expected": 1500.00 },
    ...
  ]
}
```

- `month` is "YYYY-MM" (string) for stable JSON ordering and direct use
  as a Recharts `XAxis dataKey`.
- One entry per calendar month any of whose days falls in
  `[date_from, date_to]`, in chronological order.
- `actual` is the sum of non-transfer, non-`exclude_from_budget`,
  non-pre-tax outflow magnitudes for the month, restricted to the
  requested range. A range that ends mid-month therefore truncates
  `actual` for that month.
- `expected` is the FULL-month sum of effective monthly budgets
  (override > baseline) for the same set of categories. It does NOT
  scale with a partial range — that's pace, not trend.
- Empty `months[]` when `date_from > date_to`.

No 400 cases are added; arbitrary ranges are accepted (Step 5's range
picker will exercise this without endpoint changes).

## 3. Chart component props

```typescript
export interface SpendingTrendChartProps {
  data: TrendMonth[];     // from SpendingTrendResponse.months
  loading: boolean;       // from trendQ.isLoading
}
```

Component is dumb — Overview.tsx owns the query and passes both props.
States:
- `loading=true` → centered "Loading chart…" in a 320px box.
- `data.length === 0` → centered "No data for this range" in a 320px box.
- Otherwise → Recharts `<BarChart>` with two `<Bar>` series:
  - `actual` → `hsl(var(--chart-1))` (analyzer teal)
  - `expected` → `hsl(var(--chart-2))` (muted blue)

Both bars use `isAnimationActive={false}` per the Overview convention.
Tooltip uses `formatCurrency(value)` and re-formats the X-axis label as
`"MMM YYYY"`.

## 4. Section order in Overview.tsx after this step

Top-to-bottom, inside the `<div className="space-y-6">` parent:

1. `<PaceHeadline ... />` (Step 1, frozen)
2. Four-column `<BucketCard>` grid in canonical order — fixed,
   investments, savings, guilt_free (Step 1, frozen)
3. **`<Card>` containing `<SpendingTrendChart>` — new this step**
4. `<TopMoversTable categories={data.categories} />` (Step 2, frozen)
5. `<RecentTransactionsList />` (Step 2, frozen)

Step 4 (subscriptions remaining card) should append below
`<RecentTransactionsList>` or wherever the spec/plan-4 places it; the
trend chart sits squarely between (2) and (4).

## 5. Trend query key shape

```ts
queryKey: ["overview", "spending-trend", { dateFrom: trendFrom, dateTo: trendTo }]
queryFn:  getSpendingTrend({ dateFrom: trendFrom, dateTo: trendTo })
```

- `trendFrom` is computed once (in `useMemo`) as
  `1st-of-month from (today − 5 calendar months)`, i.e. the start of a
  6-month window ending today (today's month + 5 prior months).
- `trendTo` is `isoDate(today)`.

Step 5's range picker will need to:
1. Replace the hardcoded `trendFrom` / `trendTo` with picker state.
2. Otherwise leave the query key shape alone — TanStack Query already
   re-keys when `dateFrom` / `dateTo` change because they're embedded in
   the third tuple slot.

The pace query (`paceQ`) is independent — its range stays MTD. Step 5
will collapse the two onto a single picker.

## 6. Effective-monthly-budget helper — duplicated, not shared

I duplicated the override-or-baseline lookup from `pace_service.py`
into `stats_service._effective_monthly_budget`. Reasons:

- `budget_service.py` is must-not-touch and exposes no public
  override-or-baseline helper.
- `pace_service._effective_budget` is private (underscore-prefixed) —
  importing across services to call a private helper trades local
  duplication for cross-module coupling. The 2-liner is small enough
  that duplication wins.

For Step 5, when extending `pace_service` for the actual-vs-budget
branch, you have three options:
1. Promote the helper to a small shared module (e.g.
   `services/effective_budget.py`) and have both `pace_service` and
   `stats_service` import it. Cleanest.
2. Leave it duplicated — the math is trivial and the call sites are
   stable.
3. Promote it inside `pace_service` as a public symbol and have
   `stats_service` import it.

I have no strong preference; option (1) is the most testable and the
least entangled. But Step 5 owns this call.

## 7. Smoke test status

Not run — verified via test gates only:
- `make test` → 471 passed (was 459, +12 across service unit + endpoint
  integration).
- `cd frontend && npm test -- --run` → 298 passed (was 295, +3 chart
  tests).
- `cd frontend && npm run build` → clean.
- `make lint` → clean.

Worth a manual eyeball once Step 4 lands and the page has more vertical
content; the chart's 320px container plus the existing sections will be
the longest the page has been so far.

## 8. Deviations

None.
