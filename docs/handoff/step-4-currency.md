# Step 4 — Currency: 0-decimal default + Transactions opt-in

Plan: `docs/plans/2026-05-09-06-currency-zero-decimal.md`
Spec: `docs/specs/2026-05-08-06-currency-zero-decimal.md`

## New `formatCurrency` signature

`frontend/src/lib/format.ts`:

```ts
export function formatCurrency(amount: number, decimals: number = 0): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}
```

Default precision is now 0. Callers that need cents pass `decimals: 2`.

## Sites that received `decimals: 2`

| File | Symbol / location | Why |
|------|-------------------|-----|
| `frontend/src/pages/Transactions.tsx` (line ~137) | `SimilarTransactions` row amount cell | Per-transaction exact-amount display |
| `frontend/src/pages/Transactions.tsx` (line ~428) | Main transactions-table row amount cell | Per-transaction exact-amount display |

The expanded detail row (line ~474–503) shows raw description / type / post date / source — no amount, no change needed.
There is no edit modal in `Transactions.tsx`; the inline `<Select>` is for category, not amount. Nothing else in this page needs cents.

## Ad-hoc dollar formatters converted

| File | Before | After |
|------|--------|-------|
| `frontend/src/components/SnapshotBatchModal.tsx` | local `formatHintAmount(n)` returning `n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })`, used as `` `last: $${formatHintAmount(last.balance)}` `` | `last: {formatCurrency(last.balance)}`; the `formatHintAmount` helper is deleted; imports `formatCurrency` from `@/lib/format` |
| `frontend/src/pages/NetWorth.tsx` | `formatBalance` built `` `$${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` `` and prepended `−` for credit cards | `formatBalance` returns `formatCurrency(balance)` (or `formatCurrency(-balance)` for `credit_card`); imports `formatCurrency` from `@/lib/format` |
| `frontend/src/components/NetWorthChart.tsx` | Local `CURRENCY` (0-decimal) and `CURRENCY_PRECISE` (2-decimal) `Intl.NumberFormat` instances; `formatYAxis` fell back to `CURRENCY.format(value)`; tooltip used `CURRENCY_PRECISE.format(value)` | Both helper instances removed; `formatYAxis` falls back to `formatCurrency(value)`; tooltip uses `formatCurrency(value)`; imports `formatCurrency` from `@/lib/format` |

## Tests added

`frontend/src/lib/format.test.ts` — covers:
- 0-decimal default: `formatCurrency(1234.56) === "$1,235"`
- Explicit `decimals: 2`: `formatCurrency(1234.56, 2) === "$1,234.56"`
- Zero: `formatCurrency(0) === "$0"`
- Negatives: contains `-` and `$50`
- Large value: contains `$1,000,000`

## Existing tests updated to match new default

These component tests asserted exact 2-decimal strings against components that consume `formatCurrency`. Updated to the new 0-decimal output:

- `frontend/src/components/overview/__tests__/PaceHeadline.test.tsx` (5 assertions: `$150.00`→`$150`, `$250.00`→`$250`, `$200.00`→`$200`, `$300.00`→`$300`, `$100.00`→`$100`, `$400.00`→`$400`)
- `frontend/src/components/overview/__tests__/BucketCard.test.tsx` (2 assertions: `$250.00`→`$250`, `$1,000.00`→`$1,000`)
- `frontend/src/components/overview/__tests__/TopMoversTable.test.tsx` (3 assertions: `+$50.00`→`+$50`, `-$60.00`→`-$60`, `+$75.00`→`+$75`)
- `frontend/src/components/overview/__tests__/RecentTransactionsList.test.tsx` (2 assertions: `-$42.50`→`-$43` (rounded), `$2,500.00`→`$2,500`)
- `frontend/src/components/overview/__tests__/RecurringRemainingCard.test.tsx` (1 assertion: `$94.50`→`$95` (rounded))

## Out-of-scope `toLocaleString` / `toFixed` left in place

These are not dollar amounts and are explicitly NOT in scope per the spec/plan:

- `frontend/src/lib/format.ts:11` — `formatPercent` uses `value.toFixed(1)` for percent rendering. Not a dollar amount.
- `frontend/src/components/NetWorthChart.tsx:31-32` — `formatYAxis` uses `(value / 1_000_000).toFixed(1)` and `(value / 1_000).toFixed(0)` for k/M abbreviation. The shared helper has no k/M mode; these are unit-scaled abbreviations, not raw dollar formatting. Left as-is.
- `frontend/src/components/overview/SpendingTrendChart.tsx:44-45` — same k/M abbreviation pattern. Left as-is.
- `frontend/src/pages/Budget.tsx:476,537,543,552` — `.toFixed(1)` on percentages and `pts` (delta points). Not dollar amounts. Also explicitly out-of-scope per the plan (Budget is owned by other steps).
- `frontend/src/lib/math/mathFormatters.ts` and `frontend/src/components/calculators/**` — calculator-only, explicitly preserved per the plan.

## Judgment calls

1. **Negative styling for credit-card balances.** The previous `formatBalance` rendered `−$X.XX` using U+2212 minus sign. The new code uses `formatCurrency(-balance)` which yields `-$X` (U+002D hyphen-minus, what `Intl.NumberFormat` returns for negatives). The plan/spec said "preserve `Intl.NumberFormat` conventions" and not to change negative styling — Intl's leading hyphen-minus is its convention. Net effect: visual character changes from typographic minus to ASCII hyphen-minus, plus loss of cents. Acceptable given the spec.
2. **`NetWorthChart` tooltip dropped from 2 decimals to 0.** The previous code had a parallel "precise" formatter (`CURRENCY_PRECISE`) used only in the tooltip. The spec is explicit that everywhere except the Transactions list amount column should be 0 decimals — the chart tooltip is hover-info on a chart, not "user reads exact transaction amounts". Converted to `formatCurrency(value)` (0 decimals).
3. **Transactions sub-component (`SimilarTransactions`) treated as 2-decimal.** The plan explicitly identified line ~137 inside `SimilarTransactions` and called it out as a per-transaction display surface, so it gets `decimals: 2` like the main row.

## Gates

- `cd frontend && npm run build` — pass (tsc + vite both clean; 1.0 MB JS, no chunking change)
- `cd frontend && npm test -- --run` — pass (323/323; 5 new format tests, 13 existing tests updated to new default)
- `cd backend && uv run ruff check .` — pass (no backend changes)
- `cd backend && uv run ruff format --check .` — pass
- `cd backend && uv run pytest -q` — pass (494/494)
