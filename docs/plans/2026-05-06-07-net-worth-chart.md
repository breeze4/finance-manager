# Net Worth Chart

## Parent spec

`docs/specs/2026-05-06-02-balance-snapshots.md`

## What to build

The net-worth-over-time line chart on the Net Worth page. Pure aggregation service (LVCF + type-driven sign + archived exclusion), one new GET endpoint, one Recharts line chart with a date-range picker. The page already has the latest-balance table from plan `06`; this plan adds the chart above it.

End-to-end demoable: with snapshots in the database from plan `06`, the user opens the Net Worth page and sees a single line tracking their net worth across the chosen date range.

## Type

AFK

## Blocked by

- Blocked by `2026-05-06-06-balance-snapshot-entry.md` (needs `balance_snapshots` rows to aggregate; needs the Net Worth page to render onto)

## User stories addressed

From the parent spec:

- §"Backend — Net worth aggregation" — LVCF, type-driven sign, archived exclusion
- §"API — GET /net-worth?start_date=&end_date=" — daily time series
- §"Frontend — Net Worth page" (chart portion only — table is plan 06)
- §"Testing — test_net_worth_service" — LVCF across gaps, sign flip, archived exclusion, edge cases
- §"Resolved Decisions" — sign convention, LVCF rule

## Acceptance criteria

- [x] `net_worth_service.compute_time_series(db, start_date, end_date)` returns a list of `{ date, net_worth }` covering every day in the inclusive range
- [x] LVCF rule: on date D, each non-archived account contributes the most recent snapshot with `as_of_date <= D`; accounts with no prior snapshot contribute 0
- [x] Sign rule: balances of `credit_card` accounts are subtracted; all other types are added
- [x] Archived accounts are excluded entirely from aggregation regardless of whether they have prior snapshots
- [x] When `start_date` or `end_date` is omitted on the query, defaults are: start = the date of the earliest snapshot in the database; end = today. If there are no snapshots at all, return an empty list
- [x] `GET /api/net-worth?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` returns the series
- [x] `GET /api/net-worth` (no params) returns the default-range series
- [x] Net Worth page renders a Recharts `LineChart` above the existing latest-balance table; x-axis is date, y-axis is dollar amount, single series, teal stroke matching the analyzer theme
- [x] Date range picker on the page lets the user pick start/end; defaults to "all time" (earliest snapshot → today). Quick-range buttons: 30d, 90d, 1y, all
- [x] Hover tooltip shows the exact date and net-worth value formatted as currency
- [x] Empty state: when no snapshots exist, the chart area shows a centered message ("No snapshots yet. Take your first snapshot above.") instead of an empty axis
- [x] `test_net_worth_service` covers: LVCF across multi-day gaps, credit_card sign flip, archived exclusion, single-account single-snapshot, no snapshots at all, sparse multi-account scenario
- [x] All prior tests still pass

## Owns

Backend:

- `backend/app/services/net_worth_service.py` — new pure service module
- `backend/app/schemas/balance_snapshot.py` — append `NetWorthPoint { date: date, net_worth: float }` (DO NOT touch existing classes)
- `backend/app/routers/snapshots_router.py` — append a single new route `GET /api/net-worth` (alongside the existing `/net-worth/latest` from plan 06). Do NOT restructure the router.
- `backend/tests/test_net_worth_service.py` — new

Frontend:

- `frontend/src/api/snapshots.ts` — append `getNetWorthSeries(startDate?, endDate?)` (DO NOT modify existing exports)
- `frontend/src/pages/NetWorth.tsx` — modify (add chart section above the existing latest-balance table; add range picker state)
- `frontend/src/components/NetWorthChart.tsx` — new (extract the chart into its own component to keep `NetWorth.tsx` readable)
- `frontend/src/components/DateRangePicker.tsx` — new IF none exists already in the frontend; otherwise reuse. Quick-range buttons + start/end date inputs.

## Must not touch

- Anything in `backend/app/models/` — owned by plans `05` and `06`
- Migrations — none needed in this plan
- `backend/app/routers/account_router.py` — owned by plan `05`
- `POST /api/snapshots/batch` and `GET /api/net-worth/latest` route handlers — owned by plan `06`
- `frontend/src/pages/Accounts.tsx`, `frontend/src/components/AccountFormModal.tsx`, `frontend/src/components/SnapshotBatchModal.tsx` — owned by plans `05` and `06`
- The existing latest-balance table in `NetWorth.tsx` — only ADD the chart above it; do not refactor the table's rendering
- `mockup/`, legacy plans

## Defines interfaces

- `NetWorthPoint` Pydantic schema — consumed by frontend
- `GET /api/net-worth` REST contract — consumed by frontend in this plan; no future consumers expected
- `net_worth_service.compute_time_series` — internal; not consumed across plan boundaries

## Pattern exemplar

- **MUST follow the pattern in**: `backend/app/services/stats_service.py` — for a read-only aggregation service. Pure functions, takes `db: Session`, returns Pydantic-friendly dicts/dataclasses.
- **MUST follow the pattern in**: `backend/app/routers/stats_router.py` — for an aggregation-style read-only endpoint with optional date-range params.
- **MUST follow the pattern in**: `backend/tests/test_stats_api.py` or `backend/tests/test_forecast.py` — for service-level tests with synthetic snapshot fixtures (no HTTP).
- **MUST follow the pattern in**: `frontend/src/lib/math/` consumers (e.g. `frontend/src/pages/CoastFire.tsx` if it has a chart) — for Recharts setup with the analyzer's theme.
- **Follow the pattern in**: `frontend/src/components/calculators/` for component composition style.

## Tasks

Backend:

- [x] Create `services/net_worth_service.py` with:
   - `compute_time_series(db, start_date: date | None, end_date: date | None) -> list[NetWorthPoint]`
   - Internal: query all (account_id, type, is_archived) for non-archived accounts, all snapshots ordered by `as_of_date`. Build a per-account sorted-by-date list of (date, balance). For each day in `[start, end]`, walk each account's list with a pointer that advances while the next snapshot is ≤ current day; current contribution = last-seen balance or 0. Apply sign rule (`credit_card` subtracts). Sum.
   - Default range: if `start_date` is None → earliest snapshot's date; if `end_date` is None → today. If there are no snapshots → return `[]`.
- [x] Append `NetWorthPoint` to `schemas/balance_snapshot.py` (`{ date: date, net_worth: float }`)
- [x] Append `GET /api/net-worth` to `routers/snapshots_router.py`. Query params: `start_date: date | None`, `end_date: date | None`. Returns `list[NetWorthPoint]`.
- [x] Write `tests/test_net_worth_service.py`:
   - Single account, two snapshots ten days apart → chart shows correct LVCF for the gap
   - Multi-account: checking + credit_card with overlapping snapshot dates → verify credit_card subtracts
   - Account archived after taking snapshots → those snapshots are NOT in the result
   - Empty database → empty list
   - Single-day range with one snapshot → one point
   - Snapshots sparser than the chosen range → LVCF carries forward correctly across gaps

Frontend:

- [x] Append `getNetWorthSeries(startDate?, endDate?) -> NetWorthPoint[]` to `frontend/src/api/snapshots.ts`. Mirror the backend `NetWorthPoint` shape as a TypeScript type.
- [x] Create `frontend/src/components/DateRangePicker.tsx` (reuse if one already exists in the frontend or in `mockup/src/components/`):
   - Props: `start`, `end`, `onChange`
   - Quick-range buttons: 30d, 90d, 1y, all
   - Start/end inputs use `<input type="date">` for v1 simplicity (can swap to a fancy picker later)
- [x] Create `frontend/src/components/NetWorthChart.tsx`:
   - Props: `data: NetWorthPoint[]`, `loading: boolean`
   - Renders Recharts `<LineChart>` with `<Line>` series, `<XAxis dataKey="date">`, `<YAxis tickFormatter=USD>`, `<Tooltip>` formatted as currency
   - Stroke color: theme teal (`hsl(var(--primary))` or whatever the analyzer theme exposes — match what CoastFire/Mortgage charts use if they exist)
   - Empty state: when `data` is empty AND not loading, show a centered "No snapshots yet" message
- [x] Modify `frontend/src/pages/NetWorth.tsx`:
   - Add range-picker state (start, end), default both `null` (server uses earliest-snapshot/today defaults)
   - Add a React-Query call for `getNetWorthSeries(start, end)`
   - Render `<DateRangePicker>` and `<NetWorthChart>` ABOVE the existing latest-balance table — do not refactor the table itself
- [x] `npm run build` passes; manual smoke: with snapshots from plan 06, verify the chart line is correct visually (single line, sums everything with type-driven signs)

## Implementation notes

**LVCF efficiency**: don't query the database per day. Pull all snapshots once, group by account_id in memory, and walk linearly. The dataset is small (a handful of accounts, weeks/months of snapshots) — naive Python is fine.

**Date enumeration**: use `date(start.year, start.month, start.day) + timedelta(days=i)` for `i` in `range((end - start).days + 1)`. Inclusive on both ends.

**Sign rule placement**: do it inside `compute_time_series`, not in the route handler. The route is a thin shell.

**Range picker controlled values**: when start/end are null, the server determines actual range. The frontend can show "All time" as the picker's initial label and let the user override with "Start" / "End" date inputs.

**Empty database is normal at first run**. The chart's empty state copy should be friendly, not alarming.

**Do not add caching, memoization, or premature optimization**. The service is fast enough for v1.

**Existing analyzer chart conventions**: if `CoastFire.tsx` or `Mortgage.tsx` already render a Recharts line chart, mimic their wrapper styling (axis label color, tooltip background, stroke width). If not, set sensible defaults that match the dark teal theme tokens.
