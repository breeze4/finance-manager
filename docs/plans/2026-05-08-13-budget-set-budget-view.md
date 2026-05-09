# SetBudgetView extraction + NetIncomeEditor dedup

## Parent spec

`docs/specs/2026-05-08-03-budget-page-split.md`

## What to build

Move the `SetBudgetView` component out of `pages/Budget.tsx` into its own
file at `frontend/src/components/budget/SetBudgetView.tsx`. The component
remains pure-presentational (props in, callbacks out, local UI state for
drafts + collapsed buckets + selected month).

Hoist `<NetIncomeEditor />` to render exactly once inside `pages/Budget.tsx`,
above the conditional rendering of `SetBudgetView` versus the zero-budget
fallback. Today it renders in two places (inside `SetBudgetView` at line
~774 AND in the zero-budget fallback path at line ~1642). After this
slice it renders once and the duplication is gone.

The `SetBudgetView` interface (the existing `SetBudgetViewProps`) stays
exactly the same. The component receives `year`, `budgets`, `stats`,
`categories`, `rollup`, and the four mutation callbacks
(`onSetBaseline`, `onSetOverride`, `onClearOverride`, `onSuggest`,
`isSuggestPending`). No prop changes.

The internal helpers (`renderRow`, `commitBaseline`, `commitOverride`,
`toggleBucket`, `driverKey`, `draftValue`, `denominatorTooltip`) and the
`useState` hooks (`selectedMonth`, `drafts`, `collapsedBuckets`) move with
the component. The `useMemo` blocks (`categoryById`, `budgetsByBucket`)
also move with the component.

No new tests in this slice. `SetBudgetView` is a 339-line component
combining inline editing, draft management, and bucket-grouped table
rendering — testing it well requires either provider scaffolding or a
mocking layer that this codebase doesn't have for budget endpoints. Per
the spec, component tests for `SetBudgetView` are out of scope; the
existing pattern is to verify visually via smoke check.

## Type

AFK

## Blocked by

- Blocked by `2026-05-08-11-budget-shared-primitives.md` — uses
  `MonthSelector`, `BucketDashboardCard`, `BUCKET_LABEL`,
  `BUCKET_DESCRIPTION`, `bucketRangeLabel`, the date helpers.

## Spec sections addressed

- "Solution" — point 1 (co-locate by feature) for the Set Budget tab
- "Behavior" → "What `components/budget/` owns" — `SetBudgetView.tsx`
- "Behavior" → "What's deleted" — duplicate `<NetIncomeEditor />` render
  in the zero-budget fallback path
- "Out of Scope" — no `setBudgetViewModel.ts`; no `SetBudgetView` tests

## Acceptance criteria

- [ ] `frontend/src/components/budget/SetBudgetView.tsx` exists and
      exports `SetBudgetView` along with its `SetBudgetViewProps`
      interface (or just the component, with props inlined). Match the
      file style of the components in plan `2026-05-08-11`.
- [ ] `pages/Budget.tsx` no longer contains the `SetBudgetView`
      definition or the `SetBudgetViewProps` interface. The single
      render site inside `<TabsContent value="set">` (around line
      ~1645) imports the component from the new path.
- [ ] `<NetIncomeEditor />` renders exactly once in `pages/Budget.tsx`,
      above the `SetBudgetView` vs zero-budget conditional. Verify with
      a grep: `grep -c "<NetIncomeEditor" frontend/src/pages/Budget.tsx`
      returns `1`.
- [ ] `SetBudgetView` no longer renders `<NetIncomeEditor />` itself.
      Verify with a grep on the new file:
      `grep -c "<NetIncomeEditor" frontend/src/components/budget/SetBudgetView.tsx`
      returns `0`.
- [ ] The Set Budget tab renders identically to before — same bucket
      cards, same bucket-grouped table, same inline editor behavior, same
      Suggest button behavior. Net-income editor still renders in the
      same visual position above the bucket cards (since it's hoisted
      directly above the `SetBudgetView`).
- [ ] The zero-budget fallback path also renders `<NetIncomeEditor />`
      because it's now hoisted above the conditional — the prior
      duplicate render is gone but the visual is preserved.
- [ ] `npm run lint`, `npm run typecheck`, `npm run test` all pass.
- [ ] Manual smoke check: open `/budget`, click the Set Budget tab.
      Verify the editor renders, baseline edits commit on blur, override
      badges work, rollover toggle works, suggest button works. Repeat
      with an empty-budget account if available; verify the
      `NetIncomeEditor` still appears.

## Owns

- `frontend/src/components/budget/SetBudgetView.tsx` — new file
  (carries `SetBudgetView`, the `SetBudgetViewProps` interface, and all
  internal helpers and state hooks listed in the section above).
- `frontend/src/pages/Budget.tsx` — modified. Specific sections:
  - Delete `SetBudgetViewProps` interface (lines ~561–572).
  - Delete `SetBudgetView` component (lines ~574–913).
  - Add an import for `SetBudgetView` from
    `@/components/budget/SetBudgetView`.
  - Hoist `<NetIncomeEditor />` to render once above the
    `<TabsContent value="set">` conditional (around line ~1640):
    today the editor renders inside `SetBudgetView` (at line ~774,
    moving with the extraction) and inside the zero-budget fallback
    block (line ~1642). Replace the zero-budget render and remove
    the inside-SetBudgetView render at the same time so the tab content
    is `<NetIncomeEditor />` followed by the conditional.
  - Verify the Suggest-error banner location stays correct (it lives
    inside `<TabsContent value="set">` already).

## Must not touch

- `HistoricalView` — already extracted by plan `2026-05-08-12`.
- `ActualVsBudgetView`, `BudgetVarianceChart`, `CategoryDrilldown`,
  `mapToZonePosition`, `getTierColors`, `VarianceRow`,
  `actualVsBudgetViewModel` — owned by plan `2026-05-08-14`.
- `frontend/src/components/NetIncomeEditor.tsx` — used as-is, no
  modifications.
- The `Budget` default-export component's queries, mutations, the
  `useQueryClient()` setup, the four `useMutation` calls, the
  `actualSelectedMonth` state, and the tab markup. Only the imports, the
  removed `SetBudgetView` block, and the conditional-rendering structure
  change.
- The four mutation callbacks (`setBaselineMutation`,
  `setOverrideMutation`, `clearOverrideMutation`, `suggestMutation`) and
  their `invalidateBudget()` `onSuccess` handler. Wiring is preserved.
- All shared primitives in `components/budget/` — imported as-is.

## Defines interfaces

- `SetBudgetViewProps` (or the inline prop type) in
  `frontend/src/components/budget/SetBudgetView.tsx` — consumed only by
  `pages/Budget.tsx`. No downstream plan depends on it.

## Pattern exemplar

- **MUST follow the pattern in**:
  `frontend/src/components/overview/BucketCard.tsx` for component-file
  shape (top JSDoc, single component, named export, lucide + shadcn
  imports).
- **Follow the pattern in**:
  `frontend/src/components/budget/HistoricalView.tsx` (created in plan
  `2026-05-08-12`) for the local style of the new directory.

## Tasks

- [ ] Create `frontend/src/components/budget/SetBudgetView.tsx`. Top
      JSDoc explains the component's role: bucket-grouped baseline + per-
      month-override editor for the CSP planning surface.
- [ ] Move `SetBudgetViewProps` (lines ~561–572 of `Budget.tsx`) into
      the new file. Either keep as a named exported interface or inline
      it on the function signature — match the choice in
      `HistoricalView.tsx` from plan `2026-05-08-12` for consistency.
- [ ] Move `SetBudgetView` (lines ~574–913) into the new file. This
      includes:
      - The three `useState` hooks (`selectedMonth`, `drafts`,
        `collapsedBuckets`).
      - The two `useMemo` hooks (`categoryById`, `budgetsByBucket`).
      - The local helpers `driverKey`, `draftValue`, `commitBaseline`,
        `commitOverride`, `toggleBucket`, `denominatorTooltip`,
        `renderRow`.
      - The JSX render block.
- [ ] Update the new file's imports. Import from the shared modules
      created in plan `2026-05-08-11`:
      - `MonthSelector` and `MonthAnnotation` from
        `./MonthSelector`.
      - `BucketDashboardCard` from `./BucketDashboardCard`.
      - `BUCKET_LABEL`, `BUCKET_DESCRIPTION` from `./bucket-copy`.
      - `allMonthsForYear`, `currentMonthKey`, `currentYear`, `monthKey`
        from `./date-helpers`.
      Verify each import against actual usage and drop unused.
- [ ] Remove the `<NetIncomeEditor />` render from the new file (it
      currently lives at line ~774 inside `SetBudgetView`'s JSX). Drop
      the `NetIncomeEditor` import from the new file.
- [ ] In `Budget.tsx`:
      - Delete `SetBudgetViewProps` (lines ~561–572).
      - Delete the `SetBudgetView` body (lines ~574–913).
      - Add `import { SetBudgetView } from "@/components/budget/SetBudgetView";`
        (or default import — match new-file export style).
      - Restructure the `<TabsContent value="set">` block so that
        `<NetIncomeEditor />` renders ONCE above the
        `hasBudgets ? <SetBudgetView ...> : <SuggestSeedHint .../>`
        conditional. Drop the duplicate `<NetIncomeEditor />` render
        from the zero-budget fallback path (currently at line ~1642).
- [ ] Verify with `grep -c "<NetIncomeEditor" frontend/src/pages/Budget.tsx`
      that the count is exactly `1`.
- [ ] Run `npm run lint`, `npm run typecheck`, `npm run test`. Fix any
      unused-import warnings (especially in `Budget.tsx` after the
      deletion, since `Fragment` / `useMemo` may no longer be needed
      there).
- [ ] Smoke check: dev server, `/budget`, Set Budget tab. Edit a
      baseline; verify mutation fires and the bucket card percentage
      refreshes. Toggle a bucket-section collapse. Click a month
      override; verify the override badge appears and the clear button
      works. Click Suggest Budgets; verify it fires. Repeat smoke check
      against an empty-budgets state if a fixture is available;
      otherwise reason that the conditional rendering is preserved by
      diffing the `Budget.tsx` change.

## Implementation notes

### Hoisting `<NetIncomeEditor />`

Today (sketch):

```tsx
<TabsContent value="set" className="space-y-6">
  {suggestMutation.error && <ErrorBanner />}
  {hasBudgets ? (
    <SetBudgetView ...>            // contains its own <NetIncomeEditor />
  ) : (
    <>
      <NetIncomeEditor />          // duplicate render
      <SuggestSeedHint .../>
    </>
  )}
</TabsContent>
```

After:

```tsx
<TabsContent value="set" className="space-y-6">
  {suggestMutation.error && <ErrorBanner />}
  <NetIncomeEditor />               // single canonical render
  {hasBudgets ? (
    <SetBudgetView ...>             // no longer renders NetIncomeEditor
  ) : (
    <SuggestSeedHint .../>
  )}
</TabsContent>
```

Confirm visually that the new render position above the bucket cards
matches the old position (which was inside `SetBudgetView` at the very
top of its JSX). It should — `<TabsContent>` already renders content in
top-down order and the editor is simply moved up one level.

### State hooks stay where they are

`SetBudgetView`'s three `useState` hooks (`selectedMonth`, `drafts`,
`collapsedBuckets`) move with the component. They are local UI state, not
data fetching or cross-component coordination. The view continues to own
them.

### Drafts: `Record<string, number>` typing

The `drafts` state has a string-keyed shape. Preserve the exact key
format (`${categoryId}-${scope}`) — the inline editing relies on it.

### `commitOverride` month parsing

Today, `commitOverride` parses the month integer out of a string like
`"2026-05"`:

```ts
const month = parseInt(monthKeyStr.split("-")[1], 10);
```

Preserve this exactly.

### Imports in `Budget.tsx` after the change

After the deletion, `Budget.tsx` may no longer need `Fragment` (used only
inside `SetBudgetView`'s JSX), `useMemo` (used only inside `SetBudgetView`),
or some lucide icons. Run `npm run lint --fix` (or equivalent) and verify
nothing breaks.
