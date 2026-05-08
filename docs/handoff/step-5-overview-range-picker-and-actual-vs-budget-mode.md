# Step 5 — Overview range picker + actual-vs-budget mode

The final Overview slice. Adds the URL-persisted range picker, extends
``pace_service`` with an actual-vs-budget branch, switches the
``/api/subscriptions/remaining`` endpoint to 204 outside current MTD, and
re-keys every Overview query against the picker.

## 1. Files created / modified

### Created

- `frontend/src/hooks/useOverviewRange.ts` — URL-persisted range hook;
  exports `useOverviewRange`, `RangePresetKey`, `RangeState`, and the
  `PRESETS` array.
- `frontend/src/hooks/__tests__/useOverviewRange.test.tsx` — 6 tests
  covering default current-MTD, preset resolution (ytd, last-year),
  custom-range parsing, and `setRange` write-side semantics.
- `frontend/src/components/overview/RangePicker.tsx` — preset
  `<Select>` + the existing `<DateRangePicker>` for custom-range entry.
- `frontend/src/components/overview/__tests__/PaceHeadline.test.tsx`
  — 6 tests covering pace-mode + AvB-mode copy and labels.
- `frontend/src/components/overview/__tests__/BucketCard.test.tsx`
  — 4 tests covering pace-mode label, AvB-mode "within / over budget"
  label, and the empty-state placeholder.

### Modified

- `backend/app/services/pace_service.py` — extracted the Step-1 pace-mode
  body into `_compute_pace_mode` and added `_compute_actual_vs_budget_mode`
  in parallel. New top-level `compute_monthly_pace` accepts an optional
  `today` kwarg for test-friendly time injection. `_validate_range` is
  gone; `_is_pace_range` is the new discriminator. The pace-mode math is
  bit-for-bit identical (only the function name changed).
- `backend/app/routers/stats_router.py` — dropped the 400 guards on
  `monthly_pace`. Genuinely invalid ranges (`date_to < date_from`) still
  raise `ValueError` in the service and become 400.
- `backend/app/routers/subscription_router.py` — `get_remaining` returns
  `Response(status_code=204)` when the range isn't current-MTD. Imports
  `Response` from FastAPI.
- `backend/tests/test_pace_service.py` — added a `_pace` test helper that
  forwards `today=` via the new kwarg, retrofitted existing pace tests to
  pass an explicit anchor, and added 8 new AvB-mode tests (3-month range,
  completed last month, year-boundary crossing, override-in-middle-month,
  pre-tax exclusion, uncategorized synthetic row, transfer exclusion,
  headline math). The mode-discriminator tests now assert both branches.
- `backend/tests/test_stats_api.py` — flipped the two old 400 tests to
  200/AvB-mode tests, kept a 400 test for genuinely invalid ranges, and
  added 5 spending-trend tests covering 1-year (12 bars), 3-month, last-
  30-days spanning a month boundary, last-year (12 bars), and YTD partial
  year.
- `backend/tests/test_subscriptions.py` — rebuilt the `TestRemainingEndpoint`
  to construct ranges aligned to wall-clock today (so 200 cases land in
  the in-progress current-MTD window), and added three 204 tests
  (completed last month, last-30-days, current-month sub-window with
  date_to before today).
- `frontend/src/pages/Overview.tsx` — wired the picker, piped its
  `dateFrom`/`dateTo` into all four queries, mode-aware headline +
  bucket card, conditional rendering of the subs-remaining card on 204.
- `frontend/src/components/overview/PaceHeadline.tsx` — new `mode` prop;
  branches between pace and AvB copy. Breakdown line label switches
  Expected ↔ Budgeted.
- `frontend/src/components/overview/BucketCard.tsx` — new `mode` prop;
  pace bar in pace mode, simple progress fill in AvB mode. Per-category
  drill-down rows mirror the same split. Status copy adapts
  ("on pace / over pace" → "within budget / over budget").
- `frontend/src/components/overview/RecentTransactionsList.tsx` —
  accepts optional `dateFrom` / `dateTo` props, passes them into
  `listTransactions`, embeds them in the query key.

Must-not-touch list was respected: no edits to `budget_service.py`,
`subscription_due_service.py`, `csp_rollup_service.py`,
`stats_service.py:get_spending_trend`, or any pre-Overview existing
endpoint behavior.

## 2. URL contract (deep-linkable surface)

The Overview page accepts these query-string forms; reloading or
sharing the URL restores the view exactly:

- `?range=current-mtd` — first-of-current-month → today (pace mode)
- `?range=last-30-days` — today − 30 days → today
- `?range=3-months` — today − 3 calendar months → today
- `?range=ytd` — Jan 1 of current year → today
- `?range=1-year` — today − 1 calendar year → today
- `?range=last-year` — Jan 1 prior year → Dec 31 prior year
- `?from=YYYY-MM-DD&to=YYYY-MM-DD` — custom range
- bare URL (no query) — defaults to `current-mtd` (NOT written back to
  the URL on initial mount)

A URL with both `?range=...` and `?from=...&to=...` is undefined-but-
benign: the `range` key wins (matches the resolution order). Writing a
preset always clears `from`/`to`, and writing custom always clears
`range`.

## 3. Mode discriminator (exact)

```python
def _is_pace_range(date_from: date, date_to: date, today: date) -> bool:
    return (
        date_from == date(today.year, today.month, 1)
        and date_to >= today
    )
```

Both anchors matter:

- `date_from` must equal first-of-*today's*-month (so a completed
  prior-month range doesn't accidentally match — first-of-April is
  first-of-its-month, but it's not first-of-this-month when today is in
  May).
- `date_to` must be on/after today (so an in-progress sub-window like
  `[May 1, May 4]` when today is May 8 is treated as a completed
  partial range, not pace mode).

`compute_monthly_pace(...)` accepts an optional `today: date | None`
kwarg (defaults to `date.today()`) so tests can pin a deterministic
anchor without monkeypatching. Production callers (the router) omit the
kwarg.

## 4. AvB-mode field semantics on `CategoryPaceRow`

The wire shape is unchanged from Step 1; only the field semantics shift.

| Field          | Pace mode meaning                                    | Actual-vs-budget mode meaning                                   |
|----------------|------------------------------------------------------|-----------------------------------------------------------------|
| `actual_mtd`   | Σ in-month outflow magnitudes through `date_to`      | Σ in-range outflow magnitudes                                   |
| `expected_mtd` | `subs_already_hit + discretionary × pace_factor`     | `range_budget` (Σ effective monthly budgets for months in range)|
| `full_budget`  | Effective monthly budget for the current month       | `range_budget` (same value as `expected_mtd` in this mode)      |

`expected_mtd == full_budget` in AvB mode is intentional. The bucket
card uses `full_budget` for the progress fill; the top-movers ranking
uses `|actual_mtd - expected_mtd|`, which yields the spec's
`|actual − range_budget|` ranking unchanged.

The synthetic Uncategorized row keeps its Step-1 semantics across both
modes: `actual_mtd = sum of uncategorized in-range outflows`,
`expected_mtd = 0`, `full_budget = 0`, `bucket = None`, not in any
bucket's category list.

`BucketPaceRollup` rolls up the same field semantics across its
categories: in AvB mode, `bucket.expected == bucket.budget` for every
non-empty bucket.

## 5. Final Overview.tsx section order

Top-to-bottom inside `<div className="space-y-6">`:

1. `<RangePicker range={range} setRange={setRange} presets={presets} />`
2. `<PaceHeadline headline={...} mode={...} />`
3. Four-column `<BucketCard>` grid (canonical order: fixed,
   investments, savings, guilt_free; each with `mode` prop)
4. `<Card><CardHeader><CardTitle>Spending Trend</CardTitle>...</Card>`
   wrapping `<SpendingTrendChart>`
5. `<RecurringRemainingCard>` — rendered iff
   `remainingQ.isLoading || remainingQ.data !== undefined`. When the
   server returns 204, `_client.ts` resolves `data` to `undefined`; the
   card is omitted from the DOM in that case.
6. `<TopMoversTable categories={...} />` — unchanged from Step 2; the
   sort key works for both modes by virtue of AvB reusing
   `actual_mtd`/`expected_mtd`.
7. `<RecentTransactionsList dateFrom={...} dateTo={...} />`

Loading and error states for the pace query gate (2)–(7); the
`<RangePicker>` always renders (it has no async dependency).

## 6. Smoke-test results

Not run — test gates only:

- `make test` → 494 passed (was 476, +18: 8 new pace-service AvB
  tests, 5 new spending-trend preset tests, 3 new 204 tests, 2
  retrofitted mode-discriminator integration tests).
- `cd frontend && npm test -- --run` → 318 passed (was 302, +16: 6
  hook tests, 6 PaceHeadline tests, 4 BucketCard tests).
- `cd frontend && npm run build` → clean (no new TS errors; existing
  bundle-size warning is pre-existing).
- `make lint` → clean.

The dev-server smoke test in the prompt would verify URL round-tripping
and visual mode switching; the test suite covers the wire contract and
component branches but not the integrated visual experience. Worth a
manual eyeball when the user next runs `make dev`.

## 7. Deviations from the plan

- **`compute_monthly_pace` gained a `today` keyword argument** (not
  called out in the plan but explicitly mentioned in the prompt as the
  recommended approach since `freezegun` isn't in deps). The router
  doesn't pass it; production behavior uses wall-clock today. Tests use
  a `_pace(...)` helper that forwards a frozen `_TODAY = date(2026, 5, 8)`
  by default.
- **Effective-monthly-budget helper duplication** — left as-is per the
  Step-3 handoff's "option 2" (don't promote to a shared module unless
  it's genuinely cleaner). The AvB branch reuses `pace_service`'s
  private `_effective_budget` directly; the third copy in `stats_service`
  remains untouched. Three call sites is the threshold to revisit; we
  didn't cross it this slice.
- **Non-pace 400 cases** — the plan called for keeping a `try/except
  ValueError → 400` for genuinely invalid ranges. That's preserved (the
  service raises `ValueError` only on `date_to < date_from`); the router
  still handles it. The previous "wrong date_from" / "date_to in past"
  400 cases are now 200/AvB-mode responses, as intended.
- **`RecurringRemainingCard` is hidden via parent rendering**, not via a
  prop on the component itself. The component remains dumb. Step 4's
  handoff anticipated exactly this approach (the `!isLoading && data ===
  undefined` distinguisher).

## 8. Known follow-ups (out of scope)

- **Trend-chart x-axis density at long ranges.** With the 1-year preset
  the chart renders 12 bars; with very wide custom ranges it could grow
  larger. The bars themselves render fine but the X-axis labels may
  overlap visually on narrow viewports. Defer to a polish slice; the
  spec doesn't mandate label rotation.
- **Picker preset → range resolution lives client-side.** The hook
  resolves presets against the JS `Date` (`new Date()`) which uses the
  browser's local timezone. The mode discriminator on the backend uses
  `date.today()` against the server's local timezone. For a single-user
  local-first app these are the same machine; for any future multi-host
  deployment this is a coupling point worth recording.
- **`RangePicker` doesn't validate custom from/to ordering.** If the
  user picks `from > to` the backend returns 400 (the
  `compute_monthly_pace` check). Currently the picker just passes
  through; the page surfaces the API error in the standard "Failed to
  load overview" banner. A friendlier inline warning would be polish.
- **No date-range integration test for `RangePicker`.** The hook tests
  cover URL writing and the parent (`Overview.tsx`) composition is
  validated by the page render under `MemoryRouter` if needed; explicit
  end-to-end picker-to-query plumbing was deemed unnecessary given the
  hook + child-component test coverage. The prompt explicitly listed
  this as skippable.
- **Empty AvB rows.** Categories with `range_budget == 0` and zero
  actuals are dropped (same gate as pace-mode "no signal" rows). For a
  range with no budgeted categories this means the bucket cards render
  empty (`$0 budgeted`). Acceptable per the spec's empty-bucket rule.
