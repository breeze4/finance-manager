# Step 3 handoff — Overview page (Phase 2 of mockup-page port)

Plan: `docs/plans/2026-05-07-08-port-mockup-pages.md` §Phase 2 (all
checklist items done).

> Filename note: `docs/handoff/step-3-coast-fire.md` already exists from
> the prior calculator pipeline. Per the convention used by Steps 1 and 2,
> this pipeline's Phase 2 handoff disambiguates as `step-3-overview.md`.

## What landed

- `frontend/src/api/stats.ts` — typed client for `/api/stats/summary` and
  `/api/stats/monthly`. Snake_case fields preserved at the API boundary.
- `frontend/src/api/transactions.ts` — minimal typed client (list-only).
  Phase 5 will extend this with PATCH/bulk-update plus the camelCase
  adapter the mockup expects; the field shape declared here matches
  `backend/app/schemas/transaction.TransactionResponse` so Phase 5 should
  not need to touch the existing exports, only add to them.
- `frontend/src/pages/Overview.tsx` — replaces `Home.tsx`. Four cards +
  four charts wired via TanStack Query.
- `frontend/src/App.tsx` — `Home` import + `<Route path="/">` element
  swapped to `Overview`. No other lines changed.
- `frontend/src/pages/Home.tsx` — deleted.

## API client shape

`stats.ts` exports:

```ts
getSummary(dateFrom?: string | null, dateTo?: string | null): Promise<SummaryResponse>
getMonthly(year: number, categoryId?: number | null): Promise<MonthlyStatsResponse>
```

`SummaryResponse` mirrors the Pydantic schema verbatim (snake_case,
`savings_rate` is a fraction 0-1, `total_spending`/`top_categories[].total`
are positive). `MonthlyCategorySpending.total` is also positive.

`transactions.ts` exports:

```ts
listTransactions(params?: ListTransactionsParams): Promise<PaginatedTransactions>
```

`ListTransactionsParams` currently exposes only the params Overview uses
(`date_from`, `date_to`, `is_transfer`, `page`, `page_size`). Phase 5
will widen this to the full filter set the router supports.

Neither client re-exports `ApiError` — no external consumer needs it
yet. The Overview page surfaces query errors via the standard
`useQuery.error` field (an `ApiError` instance flows through unchanged
because `_client.ts` throws the typed error).

## Page structure

Three queries fan out at mount:

| Query key                                                           | Endpoint                              | Purpose                                |
| ------------------------------------------------------------------- | ------------------------------------- | -------------------------------------- |
| `["stats", "summary", { dateFrom: null, dateTo: null }]`            | `GET /api/stats/summary`              | Cards + Category Breakdown donut       |
| `["stats", "monthly", { year }]`                                    | `GET /api/stats/monthly?year=YYYY`    | Spending Over Time bars + IvE spending |
| `["transactions", "for-top-vendors", { year, pageSize: 200 }]`      | `GET /api/transactions?is_transfer=false&page_size=200` | Top Vendors bars + IvE income          |

`year` is `new Date().getFullYear()` (no controls yet — v1).

Layout matches the mockup: 4-card grid → 2x2 chart grid (Spending Over
Time, Category Breakdown, Income vs Expenses, Top Vendors). All charts
guard on loading + empty states; Recharts containers are not rendered
until data is present (matching `NetWorthChart.tsx` convention). All
bars use `isAnimationActive={false}`.

The pct-change "vs last month" sub-line on the Total Spending card was
**dropped** — the backend `/summary` endpoint takes a single date range,
not two, so reproducing it would require two extra calls. Leaving it off
is honest for a v1 that shows all-time totals; revisit if/when a global
period filter lands.

## Top-vendors decision

Computed client-side from `GET /api/transactions?is_transfer=false&page_size=200`
(page 1). The backend stats router has no `top-vendors` endpoint, and
per orchestrator decision: no backend changes in this phase. Group by
`vendor`, sum `Math.abs(amount)` for negative-amount rows, sort desc,
take top 10.

The same query also feeds the **Income vs Expenses** chart's income
series, because `/api/stats/monthly` returns spending only (it filters
`amount < 0` server-side). Sharing one fetch keeps the page to three
network round-trips at mount.

**v1 limit**: capped at 200 most-recent transactions. With heavier data
the right fix is a proper `/api/stats/top-vendors` endpoint (or extending
`/summary` to return `top_vendors` alongside `top_categories`). Phase 5
will own a richer transactions client; if Overview's vendor data starts
mis-counting in production, lift the page-size to the router's `200`
ceiling and re-evaluate.

## Backend gaps observed

- `/api/stats/monthly` returns only spending (filtered to `amount < 0`).
  Monthly **income** for the IvE chart had to come from the transactions
  fetch. A future endpoint that returns spending+income per month would
  let Overview drop the transactions query entirely.
- `/api/stats/summary` returns no top-vendors aggregation. Same
  workaround — see "Top-vendors decision" above.
- `/api/stats/summary` accepts a single date range. There is no
  this-month-vs-last-month delta; preserving the mockup's pct-change
  card sub-line would require two summary calls per render.

None of these gaps blocked the port — all are trade-offs the plan
explicitly anticipated ("compute client-side, document, defer backend
work").

## Files touched

- `frontend/src/api/stats.ts` (NEW, 64 lines)
- `frontend/src/api/transactions.ts` (NEW, 60 lines — minimal, list-only)
- `frontend/src/pages/Overview.tsx` (NEW, 332 lines)
- `frontend/src/App.tsx` (EDIT — −1 / +1 lines: `Home` → `Overview`)
- `frontend/src/pages/Home.tsx` (DELETED)
- `docs/handoff/step-3-overview.md` (NEW — this file)

No changes to:

- `frontend/src/api/_client.ts`, `frontend/src/lib/format.ts` — Step 2
  finalised; Overview consumes them as-is.
- `frontend/src/components/AppSidebar.tsx` — "Overview" entry already
  pointed at `/` with `LayoutDashboard` icon; matches the spec, no
  change needed.
- Any other page (Subscriptions, Payments, Forecast, Budget,
  Transactions stubs all still in place — later steps).
- Backend (no changes in this phase; gaps documented above).

## Gate result

```
$ cd frontend && npm run build
✓ built in 4.74s

$ cd frontend && npm test -- --run
Test Files  12 passed (12)
     Tests  281 passed (281)
```

281 tests / 12 files — same as the Step 2 baseline. No tests added
this step (Overview is a thin TanStack-Query wrapper around already-
tested API clients; integration coverage will land if/when a wider
testing pass is in scope).

## Notes / surprises

- The mockup's `currentMonth` semantic ("this month vs last month" cards)
  doesn't translate cleanly to the existing backend. Decided up front to
  show all-time totals on the cards and drop the pct-change sub-line.
  Trade-off documented; cards still match the mockup's visual layout.
- `savings_rate` on the wire is a fraction (0.0-1.0). The page multiplies
  by 100 before rendering. Not obvious from the schema — flagged in the
  `stats.ts` docstring so future readers don't double-format.
- The `summary.top_categories` list is already sorted by spending desc
  and capped at 10 server-side; the page slices to 8 to match the
  mockup's CHART_COLORS palette and avoid wrap-around colour repetition.
- `MonthlyCategorySpending` rows from `/api/stats/monthly` are per
  (month, category). Overview sums across categories per month before
  charting. If a future drilldown needs the per-category-per-month
  breakdown, the data is already in the cached query response.
- `frontend/src/api/transactions.ts` was deliberately created with only
  the surface Overview needs. Phase 5 should `Edit` (extend), not
  `Write` (rewrite), this file. The TS interfaces declared here match
  the full backend shape, so no rename or type churn.
- `Home.tsx` was a 3-line stub (`<h1>Overview</h1>`). The delete is a
  pure cleanup; no consumer outside `App.tsx` referenced it.
