# Step 2 — Overview top movers + recent transactions

Adds the two UI-only sections beneath the Step 1 bucket grid: a top-movers
table sourced from the existing pace response, and a recent-transactions
list driven by the existing `listTransactions` client.

## 1. Files created / modified

### Created
- `frontend/src/components/overview/TopMoversTable.tsx` — pure
  presentation component. Props: `{ categories: CategoryPaceRow[] }`.
  Sorts and slices client-side; no query.
- `frontend/src/components/overview/RecentTransactionsList.tsx` — owns
  its own TanStack Query against `listTransactions`. No new endpoint.
- `frontend/src/components/overview/__tests__/TopMoversTable.test.tsx`
  — 6 render-asserts tests (ranking, slice, tiebreaker, sign +
  color, Uncategorized synthetic row, "Guilt-Free" label).
- `frontend/src/components/overview/__tests__/RecentTransactionsList.test.tsx`
  — 3 tests (URL params, row rendering with color rules, empty state).

### Modified
- `frontend/src/pages/Overview.tsx` — imports and mounts the two new
  components below the bucket grid. The Step 1 headline + bucket grid
  are untouched.

Must-not-touch list was respected: no edits to backend, no edits to
`frontend/src/api/overview.ts`, `PaceHeadline.tsx`, `BucketCard.tsx`,
or `frontend/src/api/transactions.ts`.

## 2. Section order in Overview.tsx after this step

Top-to-bottom, inside the `<div className="space-y-6">` parent:

1. `<PaceHeadline ... />` (Step 1, frozen)
2. Four-column `<BucketCard>` grid in canonical order — fixed,
   investments, savings, guilt_free (Step 1, frozen)
3. `<TopMoversTable categories={data.categories} />` — new this step
4. `<RecentTransactionsList />` — new this step

Step 3 (spending trend chart) should append to this list. The natural
home for the chart is between (2) and (3) — i.e., bucket grid → trend
chart → top movers → recent transactions — but this is a Step 3 call;
the spec doesn't constrain that ordering. If Step 3 chooses to insert
between (2) and (3), the `space-y-6` parent makes that a one-line edit.

## 3. Top-movers sort key (exact)

```
primary:   Math.abs(actual_mtd - expected_mtd)  DESC
secondary: category_name                        ASC   (stable tiebreaker)
filter:    absVariance > 0    (rows with zero variance never appear)
slice:     first 10 after sort
```

Implemented in `rankRows` inside `TopMoversTable.tsx`. The synthetic
Uncategorized row (`category_id === null`, `bucket === null`) flows
through the same path — it ranks alongside real categories on absolute
variance, exactly per the plan/spec.

Pre-tax categories are pre-excluded by Step 1's backend; this component
does no extra filtering.

## 4. Recent-txns query key and call shape

```ts
queryKey: ["overview", "recent-transactions"]   // const tuple
queryFn:  listTransactions({
  isTransfer: false,
  page: 1,
  pageSize: 10,
  sortBy: "date",
  sortDir: "desc",
})
```

Step 5 will need to:

1. Extend the query key with a range marker so the cache re-keys when
   the user changes the picker, e.g.
   `["overview", "recent-transactions", { dateFrom, dateTo }]`.
2. Pass `dateFrom` / `dateTo` into the `listTransactions(...)` call.

Both changes live entirely inside `RecentTransactionsList.tsx`; no
other file needs to know.

## 5. Cross-section coupling that matters for Step 5

- **Recent-txns query has no `dateFrom`/`dateTo` yet.** Step 5 must
  add them to the `listTransactions(...)` call AND extend the query
  key (see §4). Acceptance criterion in plan-2 was deliberately
  "last 10 across all accounts with no range filter" — Step 5 changes
  that.
- **Top-movers iterates `data.categories[]` from the pace response.**
  When Step 5 introduces actual-vs-budget mode for arbitrary ranges,
  whatever shape the new categories list takes (`actual_mtd`/
  `expected_mtd` may get renamed, or a new "actual_range" field may
  appear), this component will need to update its sort-key field
  references. The variance formula stays the same:
  `actual_for_range - expected_for_range`. If Step 5 keeps the field
  names, this component needs no change.
- **Bucket label map is duplicated between TopMoversTable and
  BucketCard** (the latter uses verbose labels like "Fixed Costs",
  the former uses short labels like "Fixed" because the badge is
  small). If Step 5 wants a single source of truth for bucket labels,
  hoist to `@/api/overview` or a shared `@/lib/csp` helper — not
  required, just a heads-up. Step 2 deliberately did NOT touch
  BucketCard.

## 6. Test infra notes for Step 3+

The TanStack Query test harness for `RecentTransactionsList.test.tsx`
mirrors `frontend/src/pages/__tests__/Categories.test.tsx`: spy on
`globalThis.fetch`, return canned `Response` objects, render inside a
`<QueryClientProvider>` with retries off and `gcTime: 0`. Use the
same pattern for any new Step-3/4 tests that need to mock fetch.

## 7. Smoke test status

Not run — verified via test gates only (459 backend tests + 295 vitest
tests + clean `npm run build`). Worth a manual eyeball once Step 3
lands and the page has more vertical content.

## 8. Deviations from the plan

None. Implementation followed the plan and the prompt's inlined
context exactly. The "—" Uncategorized badge in the recent-txns list
mirrors the warning-outline treatment used on the Transactions page
(per the prompt's instruction); for the top-movers table the synthetic
Uncategorized row uses a plain `outline` badge per the prompt's
"matches the existing '—' no-category badge style" guidance for the
ranked table.
