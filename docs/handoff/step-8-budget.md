# Step 8 handoff — Budget page (Phase 7 of mockup-page port)

Plan: `docs/plans/2026-05-07-08-port-mockup-pages.md` §Phase 7 (all
checklist items done).

## What landed

- `frontend/src/api/budget.ts` — NEW. Camel-case public surface, snake-case
  wire types kept private. Exposes `getBudgets`, `getHistorical`,
  `getActualVsBudget`, `getSuggestions`, `setBudget`, `setMonthlyOverride`,
  `deleteMonthlyOverride` and the public types listed below.
- `frontend/src/pages/Budget.tsx` — REPLACED the 3-line stub. Four tabs
  (Historical, Set Budget, Actual vs Budget, Flex) wired through three
  TanStack queries (`["budget", { year }]`, `["budget", "historical"]`,
  `["budget", "actual", { year }]`) plus a per-row drilldown query
  (`["transactions", "for-budget-drilldown", { categoryId, monthKeyStr }]`).

No changes to `transactions.ts`, `categories.ts`, `_client.ts`, `format.ts`,
`App.tsx`, `AppSidebar.tsx`, the mockup, or any other API client / page. No
new top-level deps.

## Public types (`@/api/budget`)

```ts
BudgetEntry: { categoryId, categoryName, baselineMonthly, rolloverMode,
               monthlyOverrides: Record<"YYYY-MM", number> }
BudgetState = Record<categoryName, BudgetEntry>

CategoryHistoricalStats: camelCase mirror of CategoryHistoricalStatsResponse.
  monthlyTotals: Record<"YYYY-MM", number>; trend narrowed to
  "increasing" | "decreasing" | "stable" (anything else falls back to "stable").

ActualVsBudgetEntry: { categoryId, categoryName, month, budgetTarget,
                       actualSpend, difference, percentage }
MonthlyRollup: { month, totalBudgeted, totalActual, difference, percentage }
ActualVsBudgetResult: { entries, monthlyRollups }

BudgetSuggestion: { categoryId, categoryName, baselineMonthly,
                    monthlySuggestions: Record<number, number> /* coerced from string keys */,
                    basis: string }
```

## Adapter strategy

- Read path (`getBudgets(year)`):
  `BudgetResponseRaw[]` → `Record<categoryName, BudgetEntry>`. Each
  `monthly_overrides[]` entry becomes `monthlyOverrides[YYYY-MM] = amount`,
  with the year baked in from the query param. `category_name` falls back
  to `"Category {id}"` defensively (the column is nullable on the wire).
- `getHistorical(year?)`:
  `CategoryHistoricalStatsRaw[]` → camelCase. Trend constrained to the
  union the page renders.
- `getActualVsBudget(year)`:
  full result mapped to camelCase. Effective budget per category-month is
  taken straight from `entry.budgetTarget` — rollover math is server-side.
- `getSuggestions(year)`:
  `monthly_suggestions: Record<string, number>` (Pydantic int-keyed dicts
  become strings on the wire) → `Record<number, number>` via `Number(k)`.
- Write paths:
  - `setBudget(categoryId, year, { monthlyAmount, rolloverMode })` →
    `PUT /api/budget/{categoryId}/{year}`
  - `setMonthlyOverride(categoryId, year, month, amount)` →
    `PUT /api/budget/{categoryId}/{year}/{month}`
  - `deleteMonthlyOverride(categoryId, year, month)` →
    `DELETE /api/budget/{categoryId}/{year}/{month}` (204)

The page does not try to merge mutation return values into cached data;
every mutation invalidates `["budget"]` and TanStack Query refetches.

## Flex-tab grouping decision

Backend has no fixed/flex/non-monthly classification (verified by reading
`backend/app/services/budget_service.py` end-to-end — no such column or
field anywhere). Derived client-side in `classifyBucket(stat)`:

- **non-monthly** ← `stat.seasonalMonths.length > 0` (cost only lands in
  some months; matches the mockup's Utilities-with-Winter-spike intent)
- **fixed** ← `stat.coefficientOfVariation <= 0.15` (tight month-to-month;
  rent, insurance, fixed subscriptions)
- **flexible** ← otherwise

The 0.15 CoV threshold is an editorial pick — backend hasn't formalised
this anywhere. Documented in code comments above `classifyBucket` so it's
greppable when someone wants to tune it. If backend adds a category-type
column later, replace `classifyBucket` with a direct read of that field.

The Flex tab uses `actual.monthlyRollups` for the current month's rollup
(falling back to the latest available month if the current month isn't in
the dataset, e.g. when viewing a prior year), and `actual.entries` for
per-category figures keyed by `(categoryId, month)`.

## Mutation list with invalidation keys

| Mutation                  | Invalidation                  |
| ------------------------- | ----------------------------- |
| `setBaselineMutation`     | `["budget"]` (broad prefix)   |
| `setOverrideMutation`     | `["budget"]`                  |
| `clearOverrideMutation`   | `["budget"]`                  |
| `suggestMutation`         | `["budget"]`                  |

Broad `["budget"]` prefix matches all three queries
(`["budget", { year }]`, `["budget", "historical"]`,
`["budget", "actual", { year }]`). Drilldown queries live under
`["transactions", ...]`, untouched by budget mutations — drilldowns are
read-only relative to the budget surface.

## Suggest-budgets accept flow

`suggestMutation.mutationFn`:

1. `await getSuggestions(year)` — returns `BudgetSuggestion[]`
2. For each suggestion, fan out in parallel:
   - One `setBudget(categoryId, year, { monthlyAmount: baselineMonthly,
     rolloverMode: <existing> })` to set/refresh the baseline. If a budget
     row already exists for the category, its `rolloverMode` is preserved;
     otherwise defaults to `false`.
   - For each `(month, amt)` in `monthlySuggestions` where
     `|amt - baselineMonthly| > 0.01`, fire a `setMonthlyOverride(...)`.
     Months where the suggestion equals the baseline get no override —
     baseline already covers them.
3. `Promise.all` and `onSuccess` invalidates `["budget"]`.

Empty-state ergonomics: when the user has no budgets yet, the Set Budget
tab shows a single "Suggest Budgets" CTA instead of an empty table —
suggesting becomes the seed action.

## Drilldown query strategy

Per-row expand in Actual-vs-Budget tab triggers
`<CategoryDrilldown categoryId={r.categoryId} monthKeyStr={selectedMonth} />`.
That component runs:

```ts
listTransactions({
  categoryId,
  dateFrom: "YYYY-MM-01",
  dateTo:   "YYYY-MM-<lastDay>",
  isTransfer: false,
  pageSize: 200,
  sortBy: "date",
  sortDir: "asc",
})
```

`lastDay` is computed via `new Date(year, mo, 0).getDate()` (mo as the
1-indexed month → JS `Date` rolls back to the prior month's last day, the
canonical trick). Outflows are filtered client-side
(`t.amount < 0`); display shows date, vendor, and `formatCurrency(Math.abs(t.amount))`.

Transactions client returns camelCase `Transaction` (from Step 6) — used
directly, no boundary translation in the page. Query is keyed on
`{ categoryId, monthKeyStr }` so re-expanding a row hits the cache.

## Drops from mockup

- `mockBudgetData.computeStats` — replaced with `getHistorical()` (which
  the backend already computes). The historical table renders directly off
  `CategoryHistoricalStats[]`.
- `currentMonth = "2026-02"` — replaced with
  `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`.
- `pastMonths` / `allMonths2026` constants — replaced with
  `pastAndCurrentMonthsForYear(year)` and `allMonthsForYear(year)`. For
  the current year, `pastAndCurrentMonthsForYear` returns Jan…current
  (inclusive); for past years, all 12.
- `categoryTransactions` (mockup's seeded fake-transaction generator) —
  replaced with the real-data drilldown query above.
- `getRolloverBudget` (mockup's client-side rollover math) — gone.
  `actual.entries[*].budgetTarget` is the effective budget per month
  with rollover already applied by `budget_service.get_actual_vs_budget`.
- `targetPeriod: "monthly" | "yearly"` and the period toggle — dropped.
  Backend stores `monthly_amount` only; "yearly" was a mockup-only nicety.
- `unlockedMonths: Record<string, boolean>` — dropped along with the
  yearly mode (only made sense as a partner to it).
- `flexBudgetData` (mockup's hard-coded fixed/flex/non-monthly table) —
  replaced with `classifyBucket(stat)` + the live `actual` data.
- `monthlyIncome = 7700` constant — dropped. The Flex tab's "remaining"
  calculation now uses `flexBudget − flexSpent` (flexible-only) instead of
  income-minus-everything; the income figure has no source in the current
  backend.

## Gate result

```
$ cd frontend && npm run build
✓ built in 5.19s

$ cd frontend && npm test -- --run
Test Files  12 passed (12)
     Tests  281 passed (281)
```

281/281, same baseline as Steps 6 and 7. No tests added — page is a thin
TanStack-Query wrapper around the typed client, same justification as
prior page slices.

## Notes / surprises

- Backend `BudgetResponse.category_name` is `Optional[str]` even though it's
  populated from `b.category.name` in the router. The adapter falls back
  to `"Category {id}"` rather than letting the page render
  `"undefined"`. In practice this branch never fires (all rows have a
  category), but it's the cheapest defence.
- `BudgetSuggestionResponse.monthly_suggestions: dict[int, float]` arrives
  on the wire with **string** keys (Pydantic serialises int dict keys as
  strings). The adapter coerces back via `Number(k)`. Same trick as the
  Forecast YoY adapter from Step 7.
- The mockup's `ActualVsBudgetView` re-derived rollover carryover by
  iterating prior months client-side. The backend already does that — and
  more carefully, since it carries forward sequentially per category. The
  page reads `entry.budgetTarget` directly and only computes
  `carryover = budgetTarget - baseBudget` for the rollover annotation
  (display-only). Removing the client-side rollover loop dropped ~30
  lines and eliminated a class of off-by-one bugs.
- The mockup hard-coded a "filter out Housing" (`filter(r => r.category !==
  "Housing")`) in the variance chart. That was a mockup convenience — the
  port shows all categories. If a user wants Housing excluded, they can
  hide it via category mgmt or a future filter; not encoding category-
  specific business rules in page layout.
- Set Budget tab uses local `drafts` state for inline edits, committing on
  blur. Without a draft buffer, every keystroke would fire a mutation;
  with one, edits batch to the field's natural commit point. Pattern
  matches the inline-edit UX in the Transactions page.
- Period selector dropped, so the "Yearly = $X / 12" annotation in the
  mockup's Set Budget table is also gone. The historical-avg column
  remains as the user's reference point.
- Mode toggle (Fixed ↔ Rollover) fires `setBudget(...)` with the existing
  `monthlyAmount` to preserve the baseline value while flipping
  `rolloverMode`. The backend's `set_budget` is upsert-style so a
  no-op-on-amount call is fine.
- The mockup's drilldown rendered an inline waterfall against the budget
  zones. The port uses a simpler "list of transactions by date" layout —
  the waterfall added visual complexity without giving the user
  additional information beyond what's already in the per-row variance
  bar above it.
- Flex tab's "Remaining" message reframed slightly: mockup said
  "left to spend this month" using `monthlyIncome - fixed - flex`, which
  doesn't make sense without a known income figure. The port shows
  "Flexible spending remaining" using `flexBudget - flexSpent`, which is
  meaningful from data we actually have.
- The Set Budget table sorts category names alphabetically
  (`Object.keys(budgets).sort()`) for stable row order across re-renders.
  The mockup relied on insertion order from `initialSetBudgets`.
- TanStack Query's broad `["budget"]` prefix invalidation refetches all
  three budget queries in parallel; in practice this is fine because each
  endpoint returns at most a few hundred rows. If the historical query
  becomes expensive, splitting into more granular keys would be the
  optimisation.

## Files touched

- `frontend/src/api/budget.ts` (NEW)
- `frontend/src/pages/Budget.tsx` (REPLACED — was 3-line stub)
- `docs/handoff/step-8-budget.md` (NEW — this file)
