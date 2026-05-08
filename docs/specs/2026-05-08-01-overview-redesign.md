# Overview Dashboard Redesign

## Problem Statement

When the user opens Finance Manager, the Overview page is the first surface
they see. Today it answers no clear question. Three different time windows are
mixed (all-time totals on the KPI cards, current-year on the spending bars,
last-200-rows on the income series and top-vendors list) and the most
actionable view in the app — the four-bucket Conscious Spending Plan
dashboard — is buried inside Set Budget.

The user's daily question is "Am I on track this month?" Today they have to
navigate to Budget → Set Budget to see CSP buckets, mentally map them to the
current month, eyeball Actual vs Budget for comparison, and notice along the
way that the Overview's monthly chart has no income series and that Top Vendors
is computed from a 200-row sample skewed toward the most recent week.

## Solution

Rebuild Overview as an execution-monitoring dashboard centered on the question
"Am I on track right now?" The page surfaces pace (actual MTD vs expected MTD)
for each CSP bucket and a single on-track headline summarizing all spending. A
range picker re-anchors the whole page to other windows (last 30 days, 3
months, YTD, 1 year, last calendar year, custom). Pace mode applies only when
the range is the in-progress current month; for any completed range the page
shows actual-vs-budget instead.

Replace the three ad-hoc fetches (summary, monthly, paginated transactions)
with three purpose-built endpoints whose only job is to feed this dashboard.
Other pages keep their existing narrow endpoints.

## User Stories

1. As a user, I want to see at a glance whether I'm spending faster or slower
   than expected this month, so I can correct early.
2. As a user, I want a single headline number that summarizes all spending
   pace, so I don't have to mentally aggregate four bucket cards.
3. As a user, I want each CSP bucket card to show actual MTD versus expected
   MTD by today, so I know which bucket is driving any over- or under-pace.
4. As a user, I want pace to be calendar-day-linear (e.g., day 8 of 31 →
   25.8% expected), so the math is transparent and predictable.
5. As a user, I want subscription charges that haven't hit yet to be excluded
   from "expected so far," so the discretionary pace number reflects what I
   actually choose to spend.
6. As a user, I want pre-tax categories (which never have transactions)
   excluded from pace calculations, so they don't read as artificially "on
   pace."
7. As a user, I want uncategorized transactions to still count toward actual
   MTD, so unclassified charges visibly push the headline over and nudge me
   to triage them.
8. As a user, I want to expand a bucket card inline to see each category's
   pace, so I can find exactly where the over/under is concentrated.
9. As a user, I want a "top movers" list — categories ranked by absolute
   variance from expected — so I can immediately see which are off track in
   either direction.
10. As a user, I want a six-month trend chart showing actual versus expected
    total spending per month, so I can tell whether this month is normal or
    unusual.
11. As a user, I want one number for "recurring charges still expected this
    month," with a click-through to the Subscriptions page, so I can
    anticipate remaining outflow without leaving the dashboard.
12. As a user, I want the last 10 non-transfer transactions across all
    accounts visible on Overview, so I can spot anomalies without opening the
    Transactions page.
13. As a user, I want a date-range picker at the top of the page (current MTD
    default; presets for last 30 days, 3 months, YTD, 1 year, last year;
    custom), so I can re-anchor the whole page to any window.
14. As a user, when I select a non-current-month range, I want the page to
    switch from pace mode to actual-vs-budget mode, because pace is
    meaningless for a completed period.
15. As a user, I want the trend chart to span the months covered by my
    selected range (12 bars for "1 year", 3 for "3 months", etc.), so the
    chart matches what I'm asking about.
16. As a user, I want the "remaining subscriptions" section hidden when I'm
    not viewing the in-progress current month, so I'm not staring at a
    number that doesn't apply.
17. As a user, I want recent transactions to filter to within the selected
    range, so the "what just happened" panel matches the rest of the page.
18. As a user, I do not want income status on Overview, because income is
    configured (I tell the app my take-home), not monitored — keep the page
    focused on spending pace.
19. As a user, I want bucket cards to drill down inline rather than navigate
    away, so Overview stays the single page I check each day.
20. As a developer, I want narrow purpose-built endpoints for the dashboard,
    so each piece is independently cacheable, testable, and replaceable.
21. As a developer, I want pace math to live in a single deep service module
    so the formula isn't duplicated across endpoints or layers.

## Data Flow

**Page load with default range (current MTD):**

1. Frontend reads picker state from the range hook (default = current MTD).
2. Frontend fires four queries in parallel:
   - `GET /api/stats/monthly-pace?date_from=&date_to=` →
     `{mode, headline, buckets[], categories[], top_movers[]}`
   - `GET /api/stats/spending-trend?date_from=&date_to=` →
     `{months: [{month, actual, expected}]}`
   - `GET /api/subscriptions/remaining?date_from=&date_to=` →
     `{total, count}` or 204 when range isn't in-progress current month
   - `GET /api/transactions?is_transfer=false&date_from=&date_to=&page_size=10&sort_by=date&sort_dir=desc`
     (existing endpoint)
3. Backend computes:
   - **Pace service** looks up effective per-category budgets via
     `budget_service`, gets active subscriptions via `subscription_service`,
     and for each category computes actual (sum of transactions in range,
     transfer-excluded, `exclude_from_budget`-excluded, pre-tax-excluded) and
     expected (linear by calendar days, with already-hit subs counted in full
     and not-yet-hit subs counted as zero), rolls up by CSP bucket. Decides
     response `mode`: `"pace"` when the range start is first-of-current-month
     and end ≥ today; else `"actual_vs_budget"`. Headline = sum of variances.
   - **Spending-trend extension** on `stats_service`: per-month over the
     range, totals actual (filtered as above) and expected (sum of effective
     budgets for that month with the same exclusions).
   - **Subscription-due helper**: for each active subscription with non-null
     non-pre-tax category, computes next-expected-charge date from
     `last_charge_date + frequency_period`. Hit-this-month detection: any
     non-transfer transaction with the same category and amount within ±5%
     within 7 days of the expected date in the current month. Sums "remaining"
     = active subs whose next-expected-charge falls within the range AND has
     not been matched. Returns 204 when range isn't in-progress current
     month.
4. Frontend composes the page from the four responses.

**Range change:** picker fires; all four queries re-run with the new
`date_from`/`date_to`. Subscriptions endpoint may return 204; UI hides that
card.

## Behavior

### Pace mode (range = in-progress current month)

- Headline reads "On pace — $X under expected" when total variance ≤ 0; "Over
  pace — $X over expected" when > 0. Variance = sum across spending categories
  of (actual MTD − expected MTD).
- Bucket cards show actual MTD, expected MTD, full-month budget, variance.
  Pace bar visually depicts actual against expected with full-month budget as
  the bar's max.
- Pseudocode for per-category expected MTD (the central algorithm):

  ```
  full_budget       = effective_monthly_budget(category, this_month)
  subs_due          = sum of active subs in this category, expected this month
  subs_already_hit  = sum of subs_due whose expected_date <= today AND matched
  subs_not_yet_hit  = subs_due - subs_already_hit
  discretionary     = max(0, full_budget - subs_due)
  pace_factor       = elapsed_days / days_in_month
  expected_mtd      = subs_already_hit + discretionary * pace_factor
  ```

- Bucket-level expected = sum across categories. Bucket-level actual = sum of
  category actuals.
- Pre-tax categories: skipped entirely. They have no transactions; they would
  otherwise read as exactly on pace and add noise.
- Uncategorized (`category_id IS NULL`): treated as a synthetic category with
  full_budget = 0, so any actual reads as raw over-pace. Surfaces in Top
  Movers as an "Uncategorized" row when transactions exist.

### Actual-vs-budget mode (any other range)

- Headline reads "Spent $X / Budgeted $Y / $Z under" or "Over by $Z."
  Variance = sum across spending categories of
  `(actual − Σ effective_monthly_budget for months_in_range)`.
- Bucket cards show actual / budget for the range. Progress bar fills against
  the range budget; no pace bar.
- Top movers ranked by `|actual − range_budget|`.
- Trend chart: per-month bars across months covered by the range. "Expected"
  for completed months = full-month effective budget.

### Range picker presets

- **Current month to date** (default): `[first-of-current-month, today]`.
  Pace mode.
- **Last 30 days**: `[today − 30d, today]`. Actual-vs-budget mode.
- **3 months**: `[today − 3 months, today]`. Actual-vs-budget mode.
- **YTD**: `[Jan 1 of current year, today]`. Actual-vs-budget mode.
- **1 year**: `[today − 1 year, today]`. Actual-vs-budget mode.
- **Last year**: `[Jan 1 prior year, Dec 31 prior year]`. Actual-vs-budget
  mode.
- **Custom**: user picks `date_from` and `date_to`. Pace mode iff range
  matches `[first-of-current-month, today]` exactly; otherwise
  actual-vs-budget.

### Cross-cutting rules

- All queries respect existing structural filters: `is_transfer = false` AND
  `categories.exclude_from_budget = false`.
- Pre-tax categories are excluded from all pace and actual-vs-budget math on
  this page.
- Uncategorized transactions count toward actual but not toward
  expected/budget.
- Subscriptions remaining: only meaningful in pace mode; hidden otherwise.
- Recent transactions: always filtered to range, transfer-excluded, last 10
  by date desc.
- Trend chart shows whole calendar months whose any day falls in the range.
  For "Last 30 days" the chart will show the 1–2 calendar months that
  overlap.

### What the dashboard owns vs. hides

- **Owns**: the pace formula (linear-by-calendar-days, subscription-aware),
  the mode discriminator, top-movers ranking, headline aggregation, and the
  composition of buckets+categories into a single response shape.
- **Hides**: which transactions count (existing transfer/excluded filtering
  rules already enforced by other services), per-category budget resolution
  (handled by `budget_service`), subscription detection (handled by
  `subscription_service`).
- **Exposes**: three narrow endpoints with `date_from`/`date_to` params and an
  explicit `mode` discriminator on the pace response.
- **Migration**: existing Overview page is rewritten end-to-end. The old
  query keys on Overview are dropped — those endpoints (`/stats/summary`,
  `/stats/monthly`) remain for other pages. No backend deletions.

## Modules

- **Pace service** — backend
  - Role: **defines** the dashboard response shape and computes its core
    math.
  - Interface: `compute_monthly_pace(db, date_from, date_to) → {mode,
    headline, buckets[], categories[], top_movers[]}`. Internal helpers for
    pace-mode vs actual-vs-budget-mode share filter rules (transfer
    exclusion, pre-tax exclusion, uncategorized handling).
  - Test: yes.

- **Subscription-due helper** — backend (function-level; lives near the pace
  service or as a small standalone module)
  - Role: **defines** the "has this subscription hit this month yet?"
    detection algorithm and the "remaining due" aggregation.
  - Interface: `subscriptions_remaining(db, date_from, date_to) → {total,
    count, subscriptions[]}`; `subscriptions_already_hit(db, year_month) →
    Map<category_id, hit_amount>` (consumed by pace service).
  - Test: yes.

- **Spending-trend extension** — backend (new function on the existing stats
  service)
  - Role: **defines** the per-month trend response shape.
  - Interface: `get_spending_trend(db, date_from, date_to) → [{month, actual,
    expected}]`. Consumes `budget_service` for effective budgets.
  - Test: yes.

- **Pace endpoints router** — backend
  - Role: **consumes** the three services above; handles HTTP shape and 204
    semantics for subs-remaining outside current month.
  - Interface: three GETs under `/api/stats/...` and `/api/subscriptions/...`.
  - Test: yes (integration tests with a real SQLite fixture).

- **Range hook** — frontend
  - Role: **defines** picker state shape (`{preset, date_from, date_to}`),
    preset-to-range mapping, and persistence behavior.
  - Interface: a hook returning `{range, setRange, presets[]}`. Persistence
    (URL vs localStorage) is a judgment call below.
  - Test: no — covered by integration testing of the rewritten page.

- **Overview page composition** — frontend
  - Role: **consumes** the three endpoints + recent transactions + the range
    hook; renders the new layout.
  - Interface: standalone page; child components are dumb, props-driven
    (PaceHeadline, BucketCard, SpendingTrendChart, TopMoversTable,
    RecurringRemainingCard, RecentTransactionsList).
  - Test: light component tests at most; visual smoke-test via dev server.

- **Overview API client** — frontend
  - Role: **consumes** backend pace/trend/remaining endpoints; types mirror
    the response schemas.
  - Interface: `getMonthlyPace(range)`, `getSpendingTrend(range)`,
    `getRemainingSubscriptions(range)`.
  - Test: no.

## Resolved Decisions

- **Primary question is "Am I on track this month?"** — chose execution
  monitoring over net-worth-first or categorization-first framings. The
  three-second answer is whether spending pace is healthy.
- **Pace lens, not allocation lens, on Overview** — Ramit-range allocation
  status stays on Set Budget where you plan; Overview is for execution.
  Avoids redundant CSP visualization in two places.
- **Pace formula is linear by calendar days, with subscriptions held out** —
  chose simplicity plus an accurate read on discretionary spend. Already-hit
  subs count fully toward expected MTD; not-yet-hit subs contribute zero.
  Rejected historical-curve modeling (too complex, thin data) and
  rollover-aware variants (out of v1).
- **Pre-tax excluded from pace; uncategorized counts toward actual only** —
  uncategorized visibly pushes pace over (data-hygiene nudge); pre-tax
  removed because synthetic categories always read on-pace and contribute no
  signal.
- **Bucket cards expand inline** — accordion drill-down rather than modal or
  navigation; keeps the daily check-in flow on a single page.
- **Top of page: single on-track headline + four bucket cards** — chose the
  simplest treatment. Income status explicitly omitted (income is
  configured, not monitored).
- **Rich page below the fold** — trend chart, top movers, subs-remaining,
  recent transactions, all anchored to the picker range.
- **Trend chart: actual vs expected total spending** — most direct read on
  whether this month's pace is normal. Range picker overrides the 6-month
  default to match the selected window.
- **Top movers ranked by absolute variance** — surfaces both over and under;
  rejected vendor-only and prior-month-comparison framings.
- **Subscriptions section: just total, click-through** — minimal display
  with click-through to Subscriptions page.
- **Recent transactions: last 10 non-transfer, all accounts, with category** —
  chose date-desc list over largest-of-month or uncategorized-triage
  framings.
- **Range picker with seven presets, full-page re-anchor** — current MTD
  (default), last 30 days, 3 months, YTD, 1 year, last year, custom. Pace
  mode only for in-progress current month; everything else is
  actual-vs-budget.
- **Two-mode response discriminated by `mode` field** — chose explicit mode
  field over silent semantic shift; frontend branches on it.
- **API shape: three narrow endpoints** — pace + buckets + categories share
  one endpoint because they share data; trend and subs-remaining are
  independent. Rejected fat `/api/overview` for caching, reuse, and house
  style.
- **Default range = current MTD** — use-case-aligned default.
- **Tested modules: pace service, subscription-due helper, spending-trend
  extension, route integration** — all four backend layers.
- **Picker state persistence: URL query param** — the picker writes its
  selection to the URL (e.g., `?range=ytd` or `?from=…&to=…`). Reloading or
  sharing the URL restores the view. A bare URL with no param defaults to
  current MTD. Chosen over ephemeral (loses state on reload), localStorage
  (sticky-by-surprise: a one-off "last year" check silently persists), and
  hybrid schemes.
- **Subscription hit-detection match window: ±5% on amount AND within 7
  days of the expected charge date, within the current calendar month** —
  forgives small fee fluctuations and weekend/holiday processing drift. Same
  rule applies to fixed and variable subscriptions uniformly. Tighter
  windows risk missing legitimately-drifted charges; looser ones risk
  attributing one-off charges to subs. If false-positive rate proves
  problematic in practice, tighten in a follow-up spec rather than
  complicating the algorithm now.
- **Custom-range mode rule: pace mode iff `date_from ==
  first-of-current-month` AND `date_to >= today`** — every other range
  (including custom windows that overlap today but don't align to the start
  of the current month) is actual-vs-budget. Keeps the pace math one-shape
  and the mode decision unambiguous; partial-month pace for arbitrary
  rolling windows is out of v1.
- **Top-movers row count: top 10** — matches the conventional "top vendors /
  top categories" framing used elsewhere. Gives enough signal without
  truncating meaningful entries. No expand control in v1.
- **Empty-bucket display: always render all four cards** — a bucket with no
  budgeted categories shows "$0 budgeted" with no pace bar. Layout stays
  identical for every user, and the empty state is itself a visible signal
  that a bucket is unconfigured. No CTA card in v1; just the consistent
  grid.

## Testing Decisions

- **Pace service**: unit tests for the pace formula (with and without
  subscription holdout), pre-tax exclusion, uncategorized handling, mode
  discriminator (in-progress current month vs completed range). Edge cases at
  month boundaries (day 1, last day of month, leap-year February, end-of-month
  overrides).
- **Subscription-due helper**: unit tests for next-expected-charge date
  arithmetic across all frequencies, hit-detection at the match-window edges,
  defensive handling of missing `last_charge_date`.
- **Spending-trend extension**: unit tests for month-boundary alignment
  (range starting mid-month), expected-budget summing across months with
  overrides, exclusion of pre-tax categories from totals.
- **Endpoint integration tests**: end-to-end with a real SQLite fixture per
  project convention. Verify response mode, headline math, bucket+category
  rollup correctness, and 204 semantics for subs-remaining outside current
  month.
- **Prior art**: existing tests at `backend/tests/test_csp_rollup_service.py`,
  `backend/tests/test_budget_pretax_actuals.py`,
  `backend/tests/test_paycheck_detection.py` use real-SQLite fixtures with
  factory-built transactions/budgets. Mirror those.
- **Frontend verification**: light component tests for the headline (mode
  discriminator → correct copy) and the bucket card (pace bar render). Page
  composition itself is verified by manual smoke-test against the dev server.
  Gap acknowledged: no end-to-end browser suite exists for Overview today;
  consistent with the rest of the frontend, not in scope to add here.

## Out of Scope

- Income monitoring on Overview ("paycheck arrived?" etc.). Income is
  configured via `net_income_periods`, not detected here.
- Net worth widget on Overview — covered by the dedicated Net Worth page.
- Forecast widget on Overview — covered by the Forecast page.
- Account filter on Overview — only date range is global to this page;
  account filter stays on Transactions.
- Sankey or cash-flow visualization — out of v1; deferred.
- Canonical `vendors` table — see `docs/FUTURE.md`.
- Replacing or sunsetting `/api/stats/summary` and `/api/stats/monthly` —
  these stay for other pages and as building blocks. Only Overview's calls
  change.
- Persisting picker selection across reloads — listed as a judgment call;
  v1 default is ephemeral until explicitly resolved otherwise.
- Pace math accounting for budget rollover — out of v1.
