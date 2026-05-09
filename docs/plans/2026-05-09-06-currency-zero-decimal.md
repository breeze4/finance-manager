# Currency: 0-Decimal Default + Transactions-List Opt-Out

## Parent spec

`docs/specs/2026-05-08-06-currency-zero-decimal.md`

## What to build

End-to-end vertical slice that flips the default currency precision from 2 decimals to 0 across the app while preserving 2-decimal display only at the Transactions list amount column. The shared `formatCurrency` helper in `lib/format.ts` gains a `decimals?: number` parameter (default 0). The Transactions list passes `decimals: 2` explicitly. Ad-hoc `toLocaleString()` / `toFixed()` calls that format dollar amounts are routed through the helper at 0 decimals so the rule is consistent. The calculator-specific helper in `lib/math/mathFormatters.ts` is untouched.

## Type

AFK

## Blocked by

None — can start immediately. Independent of the Payments and Budget plans (they pick up the new default automatically).

## User stories addressed

Whole spec (no user-story numbering in the lightweight spec).

## Acceptance criteria

- [ ] `lib/format.ts` `formatCurrency(amount, decimals = 0)` — default precision is 0; `decimals` param is honored
- [ ] `formatCurrency(1234.56)` returns `"$1,235"` (or locale-equivalent rounding)
- [ ] `formatCurrency(1234.56, 2)` returns `"$1,234.56"`
- [ ] Transactions list amount column passes `decimals: 2` and renders 2-decimal amounts
- [ ] All other call sites of `formatCurrency` render 0-decimal amounts (no per-site changes needed beyond the audit)
- [ ] Ad-hoc `toLocaleString()` / `toFixed(2)` calls that format dollar amounts in non-calculator code (e.g., `NetWorthChart.tsx`, `SnapshotBatchModal.tsx`) are converted to use the centralized helper at 0 decimals
- [ ] `lib/math/mathFormatters.ts` is unchanged
- [ ] Calculator pages render unchanged (still use mathFormatters and their own precision rules)
- [ ] Type-check, lint, frontend build all pass
- [ ] Visual smoke check: Overview, Net Worth, Budget tabs, Payments page render whole-dollar amounts; Transactions list still shows cents

## Owns

- `frontend/src/lib/format.ts` — `formatCurrency` signature + default change
- `frontend/src/pages/Transactions.tsx` (or whichever component renders the transaction-row amount cell) — pass `decimals: 2`
- `frontend/src/components/NetWorthChart.tsx` — replace `toLocaleString()` dollar formatting with helper
- `frontend/src/components/.../SnapshotBatchModal.tsx` — replace `toLocaleString()` dollar formatting with helper
- Any other source file that formats dollar amounts via `toLocaleString()` or `toFixed(2)` (audit during the work)
- New unit tests for `formatCurrency` covering 0-decimal default, explicit-decimal opt-in, negatives, and large values

## Must not touch

- `frontend/src/lib/math/mathFormatters.ts` — explicitly preserved
- Calculator pages and their formatters — unchanged
- Backend-side rendering (no backend renders currency strings; not in scope regardless)
- Percentage / rate formatting via `toFixed()` in calculator code — those aren't dollar amounts

## Defines interfaces

- `formatCurrency(amount: number, decimals?: number)` — the new signature. Consumed everywhere; backwards-compatible (no required new arg) and the only behavioral change is the default precision.

## Pattern exemplar

- **MUST follow the pattern in**: the existing `frontend/src/lib/format.ts` — same `Intl.NumberFormat` idiom, just parametrize `minimumFractionDigits` and `maximumFractionDigits` from the `decimals` arg with default 0.
- **Soft reference**: `frontend/src/lib/math/mathFormatters.ts` already does this — match its parameterization style for the `decimals` arg.

## Tasks

- [ ] Update `formatCurrency` in `lib/format.ts`: add `decimals?: number = 0`; pass through to `Intl.NumberFormat` options
- [ ] Add unit tests covering: default 0-decimal output, explicit `decimals: 2`, negatives, zero, large numbers
- [ ] Inventory: grep for every `formatCurrency(` call site to confirm all pick up the new default cleanly (no caller depends on 2-decimal default)
- [ ] Inventory: grep for `toLocaleString` and `toFixed(2)` in `frontend/src/` (excluding `lib/math/` and `pages/calc*` or wherever calculators live) to find ad-hoc dollar formatting
- [ ] Update Transactions list amount cell to call `formatCurrency(amount, 2)`
- [ ] Convert each non-calculator ad-hoc dollar formatter to call `formatCurrency(value)` (0-decimal default)
- [ ] Visual smoke check across Overview, Net Worth, Budget (all tabs), Payments, Transactions, Subscriptions
- [ ] Run frontend type-check and build

## Implementation notes

- **Negatives**: `Intl.NumberFormat` with `style: "currency"` handles negatives — preserve whatever leading-minus / parens style is currently configured. Don't change negative styling as part of this plan.
- **Calculator boundary**: anything imported from `lib/math/mathFormatters.ts` is out of bounds. If a calculator page also imports from `lib/format.ts`, leave that import alone — switching it to mathFormatters is a separate cleanup.
- **Transactions list candidate sites**: the **row amount cell** is the confirmed 2-decimal site. The expandable detail row, edit modals, and any per-transaction display are also candidates — audit each and treat 2-decimal as the rule for "user reads exact amounts" surfaces, 0-decimal everywhere else.
- **No dollar-string parsing changes**: this plan is display-only. Form input fields that accept currency (e.g., budget editor) keep whatever input rules they have; this plan does not change input handling.
