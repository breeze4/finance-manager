# Step 7 handoff — Forecast page (Phase 6 of mockup-page port)

Plan: `docs/plans/2026-05-07-08-port-mockup-pages.md` §Phase 6 (all
checklist items done).

## What landed

- `frontend/src/api/forecast.ts` — NEW. Snake_case at the boundary (no
  adapter). Exports `getForecast(year, method?)`, `getYoY()`,
  `getMethods()`, plus the four response interfaces
  (`ForecastResponse`, `MonthForecastResponse`,
  `ForecastLineItemResponse`, `YoYEntryResponse`, `MethodsResponse`).
  `MonthForecastResponse.status` is typed as the literal union
  `"actual" | "partial" | "projected"` since the backend's three values
  are stable and the page narrows on them.
- `frontend/src/pages/Forecast.tsx` — REPLACED the 3-line stub. Renders
  five sections: header (title + projected annual total + optional
  method picker), projection line chart, projection table,
  year-over-year bar chart, top-categories-by-year table (new vs the
  mockup), recurring charges list.

No changes to `_client.ts`, `format.ts`, `App.tsx`, `AppSidebar.tsx`,
or any other API client / page. No new top-level deps.

## API endpoints used

| Hook query key                       | Endpoint                       |
| ------------------------------------ | ------------------------------ |
| `["forecast", "methods"]`            | `GET /api/forecast/methods`    |
| `["forecast", { year, method }]`     | `GET /api/forecast/{year}?method=` |
| `["forecast", "yoy"]`                | `GET /api/forecast/yoy`        |

Year is `new Date().getFullYear()` — no year picker since the mockup
didn't have one. Method default is `"simple"`.

## Solid-vs-dashed technique

Two-series approach. Each `ChartRow` carries `actualTotal` and
`projectedTotal`, where:

- `status === "actual"` → `actualTotal = total`, `projectedTotal = null`
- `status === "partial"` → both populated with the same `total`
  (duplicates the transition-month value into both series so the lines
  meet with no visual gap)
- `status === "projected"` → `actualTotal = null`,
  `projectedTotal = total`

Two `<Line>` series in the same `<LineChart>`:
- `dataKey="actualTotal"` — solid teal stroke, dots
- `dataKey="projectedTotal"` — dashed (`strokeDasharray="5 5"`) blue
  stroke, no dots

Both have `connectNulls={false}` so any null value produces a gap;
the partial-month overlap is the only point where both series have
a value.

Driven entirely off the backend `status` field, never `new Date()` —
matches the spec note. The projection-table row also uses `status` to
decide italic-future styling and to compute Difference (only for
`actual`/`partial` rows).

## Method picker

Yes, but conditional. `getMethods()` is queried on mount. The Select
only renders when `methods.length > 1`. With only `"simple"` registered
in `backend/app/services/forecast/registry.py`, the picker is hidden
in the UI today — same surface as the mockup. When a future method
lands in the registry, the picker auto-appears with no page change.

The forecast queryKey includes `method` so the year-forecast query
re-fires automatically on selection change.

## Recurring-charges filter strategy

Backend `SimpleForecaster` tags line items with `basis` values
`"actual"`, `"partial"`, `"seasonal"`, `"average"`, or
`"subscription"`. The Recurring Charges section filters
`line_items.basis === "subscription"` from the **first projected
month** (sorted by amount desc).

Picking the first projected month rather than the current month
matters because in `"partial"` (current) and `"actual"` (past) months,
subscription cost is folded into actuals and not exposed as a separate
"subscription" line — only future projections expose it. If the user
loads the page mid-December the section will be empty; that's a
degenerate edge case, acceptable.

If no projected month exists (e.g. the page is loaded on Dec 31), the
section renders an empty-state message. No call to
`/api/subscriptions` — the forecast endpoint already exposes what we
need via `basis === "subscription"`, avoiding a second round-trip.

Display shows `category_name` (or `"Uncategorized"`) plus the
forecaster's monthly-equivalent amount. The mockup showed
per-vendor rows instead — porting that would require a separate
`/api/subscriptions` query and is out of scope for this slice.

## YoY layout

Two pieces:
1. **Aggregate bar chart** — collapses `YoYEntryResponse[]` into a
   per-year sum across all categories (`Object.values(annual_totals)`
   summed). Renders as a single-series bar chart sorted by year asc.
   Replaces the mockup's monthly 2025-vs-2026 grouped bars (which
   needed transaction-level data the backend doesn't expose at the
   `/yoy` endpoint).
2. **Top-categories-by-year table** — top 6 categories (backend
   pre-sorts by sum-of-totals desc, so `.slice(0, 6)`), one row per
   category, columns are `years` ascending. Cells are
   `formatCurrency(annual_totals[year] ?? 0)`. New section vs mockup,
   but it's the natural surface for the `/yoy` data shape and gives
   the year-over-year story at category granularity that the aggregate
   bars lose.

If `/yoy` returns no entries, both the chart and the table are
suppressed (chart shows "No history yet.", table card hidden).

## Gate result

```
$ cd frontend && npm run build
✓ built in 4.89s

$ cd frontend && npm test -- --run
Test Files  12 passed (12)
     Tests  281 passed (281)
```

281/281, same as Step 6 baseline. No tests added — page is a thin
TanStack-Query wrapper around the typed client with pure formatters,
same justification as Subscriptions / Overview / Payments /
Transactions.

## Notes / surprises

- Backend status enum is **three** values (`actual`, `partial`,
  `projected`), not the two implied by some early planning. `partial`
  is the current month (actual-to-date plus projected remainder).
  Treating partial as "both actual and projected" produces the
  cleanest chart — the line transitions through that month with no
  gap, and the projection-table shows it with a real Difference value
  (since actual-to-date is real).
- `YoYEntryResponse.annual_totals` is `Record<string, number>` on the
  wire (JSON object keys are strings) even though the backend
  declares `dict[int, float]`. Pydantic serialises int keys as
  strings, so the client type is `Record<string, number>` and we
  `Number(y)` when iterating.
- `ForecastResponse.method` is echoed back in the response. Not used
  in the UI but kept in the type for completeness.
- Recharts `connectNulls` defaults to `false`, but I made it explicit
  on both `<Line>` series so the gap behaviour is grep-able.
- `isAnimationActive={false}` on both lines for the same reason as the
  Net Worth chart — animation looks janky on small datasets and adds
  no value.
- The "Top categories by year" table is an addition over the mockup.
  The mockup's monthly-grouped 2025-vs-2026 bars require monthly
  per-year history, which is a different endpoint shape than `/yoy`
  (which returns annual totals only). Either: add a category drilldown
  on top of `/yoy` (chosen) or stand up a `/api/forecast/yoy/monthly`
  endpoint (deferred — backend change). Going with the table keeps
  this slice frontend-only.
- `"Uncategorized"` lines (where `category_id` is null) get a fallback
  display name; the React key is `${category_id ?? "uncat"}-${name}`
  to avoid duplicate-key warnings if multiple null-category lines
  appear (shouldn't happen given the backend groups by `category_id`,
  but defensive).

## Files touched

- `frontend/src/api/forecast.ts` (NEW)
- `frontend/src/pages/Forecast.tsx` (REPLACED — was 3-line stub)
- `docs/handoff/step-7-forecast.md` (NEW — this file)
