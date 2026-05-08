# Step 2 handoff — Net income step-function and paycheck detection

## Alembic head

- **New head**: `c7e4d9b21f3a` (file: `backend/alembic/versions/c7e4d9b21f3a_net_income_periods.py`)
- **down_revision**: `4810a336d8d4`
- Creates the `net_income_periods` table; no data is seeded.

## Schema

Table `net_income_periods`:

| column            | type                | notes                                       |
|-------------------|---------------------|---------------------------------------------|
| `id`              | INTEGER PK auto     |                                             |
| `effective_month` | INTEGER, unique     | encoded as `YYYYMM` (e.g. `202605`)         |
| `take_home_amount`| NUMERIC(12, 2)      |                                             |
| `created_at`      | DATETIME, server default `CURRENT_TIMESTAMP` |                  |

Unique constraint `uq_net_income_effective_month` and index
`ix_net_income_effective_month` both on `effective_month`.

Model: `backend/app/models/net_income.py` — class `NetIncomePeriod`. Also
exported from `app.models.__init__`.

## Service signatures

`backend/app/services/net_income_service.py`:

```python
def get_for_month(db: Session, month_yyyymm: int) -> Decimal | None
def get_period_for_month(db: Session, month_yyyymm: int) -> NetIncomePeriod | None
def set_from_month(db: Session, effective_month: int, take_home_amount: Decimal) -> NetIncomePeriod
def get_history(db: Session) -> list[NetIncomePeriod]

# Helpers for conversion between integer storage and "YYYY-MM" display:
def yyyymm(year: int, month: int) -> int
def to_yyyymm_string(value: int) -> str
def parse_yyyymm_string(value: str) -> int
def current_month_yyyymm() -> int
```

`backend/app/services/paycheck_detection.py`:

```python
def suggest_monthly_net(db: Session) -> Decimal | None
```

`set_from_month` upserts: if a row with the same `effective_month` already
exists, its `take_home_amount` is overwritten in place (same `id`).

## Shared helper extracted from subscription_service

New module `backend/app/services/recurring_detection.py` exposes:

```python
PERIODS: list[tuple[str, int]]          # subscription set, no semi-monthly
PAYCHECK_PERIODS: list[tuple[str, int]] # paycheck set, includes semi-monthly
TOLERANCE: float = 0.30
def classify_frequency(median_interval, intervals, periods=None) -> str | None
```

`subscription_service` no longer defines `_PERIODS`, `_TOLERANCE`, or
`_classify_frequency`; it imports `classify_frequency` from this new
module (aliased to `_classify_frequency` to keep call sites unchanged).
The default behavior of `classify_frequency` is the legacy 5-period set,
so subscription detection is bit-identical (verified by re-running
`tests/test_subscriptions.py` — all 19 tests still pass).

`classify_frequency` was upgraded from "first match" to "closest match"
to handle the overlap between bi-weekly's tolerance band ([9.8, 18.2])
and semi-monthly's ([10.5, 19.5]). When two periods both qualify, the
one whose nominal length is closest to the observed median wins. This
is a no-op for subscription detection (its band list has no overlapping
periods) and correctly distinguishes 14-day from 15-day cadences for
paycheck detection.

## Router endpoints

Registered in `backend/app/main.py` (one new import,
`net_income_router`, and two `include_router` lines).

`/api/net-income`:
- `GET ?month=YYYY-MM` → `NetIncomeForMonthResponse`
- `PUT` body `{effective_month: "YYYY-MM", take_home_amount: float}` → `NetIncomePeriodResponse`
- `GET /history` → `list[NetIncomePeriodResponse]`

`/api/paycheck-detection`:
- `GET /suggest` → `{"suggested_monthly_net": float | null}`

Decimal handling at the boundary: amounts are serialized as `float`
(matching `budget_router`); the model column itself is `Numeric(12, 2)`
so DB precision is preserved end-to-end.

## Frontend

- API module: `frontend/src/api/net-income.ts`
  - exports: `getNetIncome`, `setNetIncome`, `getNetIncomeHistory`,
    `suggestMonthlyNet`, `currentMonthKey`
  - types: `NetIncomePeriod`, `NetIncomeForMonth`, `NetIncomeSetPayload`,
    `PaycheckSuggestion`
- Component: `frontend/src/components/NetIncomeEditor.tsx` — exported
  `NetIncomeEditor` (named export). Renders a static block; opens a
  Dialog modal for editing.

### Interim mount in Budget.tsx

- Import added at `frontend/src/pages/Budget.tsx` line 71:
  ```ts
  import { NetIncomeEditor } from "@/components/NetIncomeEditor";
  ```
- Render: `<NetIncomeEditor />` is the first child of
  `<TabsContent value="set" className="space-y-6">` at line ~1352. No
  other edits to `Budget.tsx`.

React-query keys:
- `["net-income", monthKey]` — current-month lookup
- `["net-income", "history"]` — history list (lazy-fetched)
- `["paycheck-suggest"]` — detection result

Saving invalidates `["net-income"]` and `["paycheck-suggest"]`.

## Tests

- `backend/tests/test_net_income_service.py` — 14 tests covering empty
  lookups, set-then-get, before-first / after-last lookups, multi-period
  step-function semantics, overwrite semantics, history ordering,
  YYYYMM helper round-trips, malformed-input rejection, and router
  smoke tests.
- `backend/tests/test_paycheck_detection.py` — 12 tests covering
  no-data, single/two-transaction floors, weekly / bi-weekly /
  semi-monthly / monthly cadences, multi-paycheck summation,
  irregular-noise rejection, transfer exclusion, outflow exclusion, and
  router smoke tests.

Backend total: 369 tests pass (was 343 + 26 new).
Frontend total: 286 tests pass (unchanged — no new tests added; manual
smoke only).

## Test failures encountered and resolution

1. **Subscription test broke after naive `semi-monthly` addition.** Adding
   semi-monthly to the shared `PERIODS` list reclassified one real-CSV
   charge as semi-monthly (it had been bi-weekly), tripping
   `test_detect_from_real_csvs`. Fix: keep the subscription `PERIODS`
   list at 5 entries; expose a separate `PAYCHECK_PERIODS` list and
   thread it through `classify_frequency`'s new `periods` parameter.
2. **Semi-monthly fixture misclassified as bi-weekly.** With both bands
   active, a 15-day median fell inside bi-weekly's band first under
   the old "first-match" loop. Fix: switch `classify_frequency` to
   "closest-match" — pick the period whose nominal length is closest
   to the observed median when multiple bands qualify.

## Deviations from the plan

None of substance. The plan suggested either adding semi-monthly to the
shared `_PERIODS` or treating it as bi-weekly; we chose a third option
(separate `PAYCHECK_PERIODS` constant) so subscription behavior stays
bit-identical while paycheck detection gets proper 15-day support.
