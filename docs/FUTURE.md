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
