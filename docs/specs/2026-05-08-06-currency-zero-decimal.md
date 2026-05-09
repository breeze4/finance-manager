# Currency Display: 0 Decimals by Default

## Problem

Dollar amounts across the app render with 2 decimals of precision (cents). The user only wants cents on the Transactions list (where reading exact amounts matters); everywhere else — summary cards, chart axes, chart tooltips, budget rollups, Net Worth, Overview, etc. — should render at 0 decimals for cleaner reading.

The frontend has two `formatCurrency` helpers:

- `lib/format.ts` → defaults to 2 decimals via `Intl.NumberFormat`. This is the app-wide formatter used in roughly 23 source files.
- `lib/math/mathFormatters.ts` → defaults to 0 decimals, parametrized. Used in calculator pages.

## Solution

- Change the default in `lib/format.ts` from 2 → 0 decimals. Add a `decimals?: number` parameter so callers can opt back into 2 decimals.
- At the Transactions list amount column (the only known site that should keep cents), pass `decimals: 2` explicitly.
- Don't touch `lib/math/mathFormatters.ts`. Don't merge the two helpers.

## Data Flow

1. `lib/format.ts → formatCurrency(amount, decimals = 0)` — `Intl.NumberFormat` is constructed with `minimumFractionDigits: decimals` and `maximumFractionDigits: decimals`.
2. The Transactions list amount column passes `decimals: 2`.
3. All other call sites pick up the new default automatically — no per-site changes needed unless a site was relying on the 2-decimal default and shouldn't.
4. Chart tooltips and axes formatted via this helper render at 0 decimals automatically.

## Behavior

- Default precision: 0 decimals. `formatCurrency(1234.56)` → `"$1,235"`.
- Opt-in precision: `formatCurrency(1234.56, 2)` → `"$1,234.56"`.
- Negative values continue to follow `Intl.NumberFormat` conventions (typically a leading minus sign or accounting-style parens depending on existing style options).
- Calculator pages using `lib/math/mathFormatters.ts` are unaffected — that helper already defaults to 0 and stays as-is.
- Existing `toLocaleString()` and `toFixed()` ad-hoc formatting (e.g., in `NetWorthChart.tsx`, `SnapshotBatchModal.tsx`) is converted to use the centralized helper at 0 decimals as part of the sweep, so the 0-decimal default is consistent.

## Judgment Calls

- [ ] **Other "should keep cents" sites discovered during the sweep**: the only confirmed site that keeps 2 decimals is the Transactions list amount column. If during the audit other sites turn out to need cents (e.g., per-transaction expandable detail rows, edit modals showing exact amounts), they each need an explicit `decimals: 2`. The plan should treat the Transactions-list expanded-detail and any per-transaction modal as candidates and decide each on inspection.
  - Resolution: treat as a checklist during the implementation plan; default to 0 unless a clear "user reads exact cents here" rationale exists.
