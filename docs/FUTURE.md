# FUTURE

Scratchpad for ideas, friction, and "we should probably fix this someday" items
discovered during day-to-day work. Not a spec, not a plan — just a holding
pen. Promote items to `docs/specs/` when they're ready to be designed.

Format: short heading, a few lines of context. Newest at top is fine; reorder
later if it grows.

---

## Canonical `vendors` table

Today vendor identity is split awkwardly:

- `transactions.vendor` is a free-text string copied from the import.
- `classification_rules.vendor_pattern` + `vendor_display_name` is where
  "rename this vendor" and "categorize this vendor" live, but it's a
  pattern-matcher, not a vendor record.

There is no single row that represents "Trader Joe's" — only N transactions
with that string and possibly a rule that rewrites it. Consequences:

- No place to attach vendor-level metadata (website, notes, default category,
  merchant category code, logo).
- Renaming a vendor is an indirect side-effect of a classification rule.
- Subscriptions key off `vendor` strings, so detection is fragile to
  rename/normalization drift.

Likely shape: a `vendors` table with `(id, canonical_name, default_category_id,
notes, ...)`, `transactions.vendor_id` FK, and classification rules either
target a vendor directly or continue to pattern-match raw descriptions but
resolve to a `vendor_id`. Migration needs a backfill that groups existing
transactions by current vendor string (post-rule) into vendor rows.

## Forecast vs Budget

The forecasts should be based on the set budgets for upcoming months and this should be incorporated into the historical budget screen. Work on this after the latest budget page revisions.


_Promoted 2026-05-08:_
- Payments page redesign → `docs/specs/2026-05-08-04-payments-redesign.md`
- Budget tweaks (chart, historical edits, sub-nav routing) → `docs/specs/2026-05-08-05-budget-tweaks.md`
- Currency display (0 decimals default) → `docs/specs/2026-05-08-06-currency-zero-decimal.md`