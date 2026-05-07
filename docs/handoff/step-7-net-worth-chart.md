# Step 7 handoff — Net worth chart

Plan: `docs/plans/2026-05-06-07-net-worth-chart.md` (all acceptance criteria checked).

## What landed

A pure aggregation service for net-worth-over-time, one new GET endpoint,
and a Recharts line chart rendered above the existing latest-balance table
on the Net Worth page. No model, schema, or migration changes.

## Backend

### `net_worth_service.compute_time_series` signature

```py
# backend/app/services/net_worth_service.py
def compute_time_series(
    db: Session,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[dict]:
    """Returns [{"date": date, "net_worth": float}, ...] for every day in
    the inclusive range. Returns [] when the database holds no snapshots."""
```

Aggregation rules (matching the spec exactly):

- LVCF per account (per-account pointer walk; no per-day DB query).
- Sign rule applied inside the service: `credit_card` subtracts; all other
  account types add.
- Archived accounts excluded entirely (filter by `Account.is_archived ==
  False` before grouping snapshots).
- Default range: `start_date` defaults to earliest `BalanceSnapshot.as_of_date`,
  `end_date` defaults to `date.today()`. Empty DB returns `[]` immediately.
- Net worth values rounded to 2 decimal places.

### Route

Appended after `GET /api/net-worth/latest` in
`backend/app/routers/snapshots_router.py`:

```py
@router.get("/net-worth", response_model=list[NetWorthPoint])
def get_net_worth_series(
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
):
    return net_worth_service.compute_time_series(
        db, start_date=start_date, end_date=end_date
    )
```

The existing `POST /api/snapshots/batch` and `GET /api/net-worth/latest`
handlers were not modified.

### `NetWorthPoint` schema (Pydantic)

Appended to `backend/app/schemas/balance_snapshot.py`:

```py
class NetWorthPoint(BaseModel):
    date: date
    net_worth: float
```

Existing classes (`SnapshotBatchEntry`, `SnapshotBatchRequest`,
`SnapshotBatchResponse`, `LatestBalanceResponse`) were not touched.

## Frontend

### `NetWorthPoint` TS mirror + fetcher

Appended to `frontend/src/api/snapshots.ts`:

```ts
export interface NetWorthPoint {
  date: string;       // ISO YYYY-MM-DD from the backend
  net_worth: number;
}

export function getNetWorthSeries(
  startDate?: string | null,
  endDate?: string | null
): Promise<NetWorthPoint[]>;
```

Existing exports (`ApiError`, `request`, snapshot/latest types and
helpers) were not touched.

### Components

- `frontend/src/components/NetWorthChart.tsx` — Recharts `LineChart` with
  single series, currency-formatted Y-axis (compact: `$1.2M`, `$45k`,
  `$300`), tooltip uses `Intl.NumberFormat(USD)` with 2 decimals and a
  human-readable date label, line stroke is `hsl(var(--chart-1))` to match
  `MortgageResults.tsx` / `ComparisonLineChart.tsx`. Handles loading and
  empty states without rendering an empty Recharts container.
- `frontend/src/components/DateRangePicker.tsx` — two `<input type="date">`
  fields + 30d / 90d / 1y / All quick-range buttons (using shadcn
  `<Button variant="outline" size="sm">`). Quick-range buttons set explicit
  ISO date strings; "All" sets both back to `null` so the server falls
  back to earliest-snapshot/today.

### `NetWorth.tsx`

The existing latest-balance shadcn `Table` and its surrounding card render
were **not** modified. Added:

- Two new `useState` hooks: `rangeStart`, `rangeEnd` (both `string | null`,
  default `null`).
- A new React Query call keyed
  `["net-worth", "series", { start, end }]`. The `saveMut.onSuccess`
  invalidates both `LATEST_KEY` and the `["net-worth", "series"]` prefix.
- A new `<div className="rounded-lg border ... p-4 shadow-sm">` card
  inserted between the page `<header>` and the latest-balance card, with
  the section heading "Net worth over time", the `<DateRangePicker>` on
  the right, and the `<NetWorthChart>` below.

## Chart styling conventions (for future plans to mirror)

- **Primary line stroke**: `hsl(var(--chart-1))` (analyzer teal). For
  multi-series charts, layer additional colors as
  `hsl(var(--chart-2))`, etc., matching `ComparisonLineChart.tsx`.
- **Stroke width**: `2`. `dot={false}`. `isAnimationActive={false}`.
- **Grid**: `CartesianGrid strokeDasharray="3 3"
  className="stroke-border"`.
- **Y-axis tick formatter**: compact currency (`$1.2M` / `$45k` / `$300`)
  for net-worth-scale values; raw `Intl.NumberFormat(USD)` for tooltip
  display. `width={80}` reserves enough space for the formatted ticks.
- **Tooltip**: backend dates arrive as `YYYY-MM-DD` strings; render via
  `new Date(`${iso}T00:00:00`).toLocaleDateString(...)` to avoid TZ drift.

## Test counts

- Backend: 306 passed (was 294 before this step → +12 from
  `test_net_worth_service.py`).
- Frontend: 281 passed (unchanged, no new frontend tests added; smoke
  coverage is via `npm run build` + the existing tsc gate).

## Final gate

`make test && make lint && (cd frontend && npm run build && npm test -- --run)` — all green.

## Notes / surprises

- The `archived account after taking snapshots` test asserts the daily
  net-worth value is `0` for the entire range (because the only account
  is archived → excluded → no contributions). The series is still
  non-empty because the earliest-snapshot lookup happens against
  `BalanceSnapshot` directly without filtering on `Account.is_archived`,
  which is intentional: the spec defines the default range from "the
  earliest snapshot in the database", not "the earliest snapshot for an
  active account". Frontend renders this as a flat-zero line, which is
  honest given the user has no active accounts contributing.
- `compute_time_series` currently returns `list[dict]` (not `list[NetWorthPoint]`)
  because FastAPI coerces dicts via the `response_model` annotation and
  the service stays Pydantic-free for testing convenience. If a future
  plan needs the dataclass return type, swap in the Pydantic class — no
  caller change required.
- Recharts didn't need any axis-label workarounds for ISO date strings;
  `XAxis dataKey="date"` plus `minTickGap={32}` produces sensible tick
  density for typical ranges.
