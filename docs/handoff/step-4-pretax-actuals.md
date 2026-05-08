# Step 4 Handoff — Pre-Tax Actuals and Actual vs Budget CSP Integration

## Backend

### `budget_service.get_actual_vs_budget` change

Single surgical branch added inside the per-category month loop in
`backend/app/services/budget_service.py`. Affected lines now read:

```python
if is_pre_tax:
    actual = round(target, 2)
else:
    actual = actual_map.get((budget.category_id, month), 0.0)
```

(Previously the line was unconditionally `actual = actual_map.get(...)`.)

Also pulled three values from the loaded `Budget.category` once per
category (outside the inner loop): `cat_name`, `cat_bucket`, `is_pre_tax`.

Decision documented in code: pre-tax categories with no `Budget` row
do NOT appear at all in the result — same behaviour as unbudgeted
non-pre-tax categories. The plan considered emitting a budget=0 entry
and rejected it for consistency.

### `ActualVsBudgetEntry` new fields

`backend/app/services/budget_service.py`:

```python
csp_bucket: str | None = None
is_pre_tax: bool = False
```

Mirrored in the wire schema `backend/app/schemas/budget.py` so the GET
`/api/budget/actual/{year}` payload carries them. The frontend's
`ActualVsBudgetEntry` adapter in `frontend/src/api/budget.ts` adds
`cspBucket: string | null` and `isPreTax: boolean`.

### `get_actuals_rollup`

```python
# backend/app/services/csp_rollup_service.py
def get_actuals_rollup(db: Session, month_yyyymm: int) -> ActualsRollup
```

Implementation summary:
- Reuses `budget_service.get_actual_vs_budget(db, year=year)` to get
  per-month per-category effective budgets and synthetic pre-tax
  actuals.
- Per-bucket numerator: sum of `actual_spend` from entries that fall
  in the requested month. Pre-tax categories already contribute
  `actual=target` from the budget service modification — the rollup
  does NOT add their baseline a second time.
- Denominator: same composition as planning (`take_home + pre_tax_total`).
- Calls `get_planning_rollup(db, month_yyyymm)` to fetch each bucket's
  planned percentage; populates `BucketRollup.planned_percentage` and
  derives `tracking_status` via the `_tracking_status` helper.
- Reuses `_baseline`, `_classify`, `_build_bucket`, `_BUCKET_ORDER`, and
  `_INTENTIONALLY_NULL_BUCKET_NAMES` from the planning path.

`ActualsRollup` dataclass shape mirrors `PlanningRollup` (same fields).

### `BucketRollup` new fields

```python
planned_percentage: Decimal | None = None
tracking_status: str | None = None  # "on-track" | "over-plan" | "under-plan"
```

Both default to `None`; populated only on the actuals path so the
shared dataclass works for both modes without a separate
`ActualsBucketRollup`.

### Tracking-status tolerance

`_TRACKING_TOLERANCE_PTS = Decimal("2")`. Boundary semantics:
- `actual - plan > 2` → `over-plan`
- `actual - plan < -2` → `under-plan`
- otherwise (including exactly `±2`) → `on-track`

Centralised in `_tracking_status(actual_pct, planned_pct)` helper at
the bottom of `csp_rollup_service.py`.

### Router dispatch shape (post-change)

`backend/app/routers/csp_router.py` now reads:

```python
if mode == "planning":
    rollup = csp_rollup_service.get_planning_rollup(db, month_int)
    return _planning_to_response(rollup, month_str=month)

if mode == "actuals":
    actuals = csp_rollup_service.get_actuals_rollup(db, month_int)
    return _actuals_to_response(actuals, month_str=month)

raise HTTPException(status_code=400, detail=f"Unknown mode: {mode!r}")
```

`response_model=PlanningRollupResponse` was removed from the route
decorator so FastAPI accepts either pydantic class. New
`ActualsRollupResponse` mirrors `PlanningRollupResponse`. The shared
`BucketRollupResponse` carries the optional `planned_percentage` and
`tracking_status` fields (default `None`).

## Frontend

### `Budget.tsx` regions modified

| Region | Change |
|---|---|
| File header docblock | Added a paragraph describing the new Actual vs Budget layout (bucket cards across the top + per-bucket variance charts). |
| Imports (csp.ts) | Added `getActualsRollup`, `ActualsRollup`, `TrackingStatus`. |
| `BucketDashboardCard` (~line 455) | Untouched — Step 3 owned it. Step 4 added a sibling `ActualsBucketCard` next to it (target/actual/delta + tracking-status badge). |
| `trackingStatusBadge` helper (new) | Mirrors `bucketStatusBadge` shape but renders the `TrackingStatus` variant ("on track" / "over plan" / "under plan"). |
| `ActualsBucketCard` (new, ~line 491) | Reads `b.planned_percentage`, `b.tracking_status`; renders target % / actual % / delta pts / status badge. |
| `ActualVsBudgetView` (~line 1257) | Rewritten — see below. |
| `ACTUAL_BUCKET_ORDER` constant (new) | Canonical bucket render order. |
| Main `Budget()` component | (a) hoisted `actualSelectedMonth` state up from `ActualVsBudgetView` so the actuals-rollup query can refetch when the user switches months; (b) added `actualsRollupQ` keyed on `["csp", "actuals", actualSelectedMonth]`; (c) `invalidateBudget` now also invalidates the actuals key; (d) passes `actualsRollup`, `selectedMonth`, `onSelectedMonthChange` props through. |

### `ActualVsBudgetView` redesign

The function now:
1. Renders the `MonthSelector` (unchanged).
2. Renders the four-bucket actuals rollup card row (one
   `ActualsBucketCard` per bucket from `actualsRollup.buckets`).
   Falls back to a "set a take-home amount" hint when
   `has_net_income === false`.
3. Splits the `rowsWithBucket` array (each row tagged with its
   `csp_bucket` from the augmented `ActualVsBudgetEntry`) into four
   bucket groups + an "other" fallback bucket.
4. Renders one `<Card>` per non-empty bucket group, each containing
   a `BudgetVarianceChart` for that bucket's rows. The card header
   shows `BUCKET_LABEL[bucket]` + bucket totals + category count.
5. Renders an "Unbucketed" card for any rows with NULL `csp_bucket`
   (defensive — should be empty in normal use).

The previous single "Total of X of Y" Card and the
`BudgetVarianceChart` wrapper Card are gone (replaced by the bucket
cards + per-bucket variance Cards). `BudgetVarianceChart` itself was
not modified — it just receives a smaller subset of rows per call.

### `csp.ts` additions

- New `TrackingStatus` type alias (`"on-track" | "over-plan" | "under-plan"`).
- `BucketRollup` extended with `planned_percentage: number | null` and
  `tracking_status: TrackingStatus | null`.
- New `ActualsRollup` type alias (= `PlanningRollup` since wire shape
  is identical).
- New `getActualsRollup(month: string): Promise<ActualsRollup>`.

### `budget.ts` additions

`ActualVsBudgetEntry` now exposes:
- `cspBucket: string | null`
- `isPreTax: boolean`

The `ActualVsBudgetEntryRaw` wire type and `toActualVsBudget` adapter
were updated to match.

## Tests

### `backend/tests/test_budget_pretax_actuals.py` (new, 7 cases)

- `test_pretax_actual_equals_budget_with_no_transactions`
- `test_pretax_actual_tracks_monthly_override`
- `test_pretax_with_rollover_mode_carries_zero_surplus`
- `test_pretax_with_no_budget_does_not_appear`
- `test_non_pretax_unaffected_by_change`
- `test_csp_bucket_and_is_pretax_pass_through`
- `test_monthly_rollup_includes_pretax_synthetic_actual`

### `backend/tests/test_csp_rollup_service.py` (extended)

Existing `test_router_actuals_returns_501` was retitled to
`test_router_actuals_returns_200_with_tracking_fields` and asserts
the new wire fields. Nine new actuals cases added at the bottom of
the file:

- `test_actuals_basic_sums_per_bucket`
- `test_actuals_pretax_contributes_no_double_count`
- `test_actuals_respects_per_month_override`
- `test_actuals_respects_rollover_carry`
- `test_actuals_excluded_categories_invisible`
- `test_actuals_tracking_status_on_track`
- `test_actuals_tracking_status_over_plan`
- `test_actuals_tracking_status_under_plan`
- `test_actuals_unbucketed_warning_matches_planning`

### Counts

- **Backend**: 414 passed (was 398 in Step 3 → +16 new cases:
  7 in `test_budget_pretax_actuals.py`, 9 in
  `test_csp_rollup_service.py`).
- **Frontend tests**: 286 passed (unchanged — no new test files;
  manual smoke recommended on the redesigned tab).
- **Frontend build**: succeeds, 1018 KB bundle.
- **Lint**: `make lint` clean. (One pre-existing E501 in
  `app/models/net_income.py` was auto-formatted to clear the gate.)

## Pattern decisions / non-obvious choices

- Picked **shared `BucketRollup` dataclass** over a sibling
  `ActualsBucketRollup`. The two new fields default to `None` and are
  only populated on the actuals path; this avoids duplicating the
  router's response-shape glue.
- Picked **alias `type ActualsRollup = PlanningRollup`** on the
  frontend since the wire shape is structurally identical. The bucket
  records inside differ only by which optional fields are populated.
- Picked **drop the `response_model` decorator argument** on the
  router rather than `Union[PlanningRollupResponse,
  ActualsRollupResponse]` — Pydantic union dispatch in FastAPI's
  serializer is fiddly and the shape difference is just two fields.
- Picked **±2 percentage-point tolerance band** for tracking_status
  with **inclusive** boundary on `on-track`. Documented in code at
  `_TRACKING_TOLERANCE_PTS` and in the helper docstring.
- The actuals rollup calls `get_planning_rollup` to pull planned
  percentages — one extra in-process query, fine for the dashboard's
  request rate; option (a) from the plan.

## Deferred / not done

- Manual smoke test of the redesigned Actual vs Budget tab against
  the live backend — recommended before merging. The plan's checklist
  calls for verifying the rollup card matches per-category sums,
  bucket grouping, pre-tax actual = budget, and the expandable
  transaction rows. Automated coverage is end-to-end on the backend
  but the frontend's per-bucket grouping has not been added to the
  vitest suite (existing tests in `frontend/src/pages/__tests__/`
  cover Mortgage and CoastFire only).
