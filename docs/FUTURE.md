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


## Payments page is useless

Missing most of the payments, doesn't give a good view of credit card balance over time and payoff

Side-by-side bar-chart might be most useful here? Show months, quarters, years

Data quality needs to be better - lets say this: for a credit card account, the payments will be all the negative transactions. So maybe we do that first and then only use the matching transactions across credit card and checking to link them together. Does that make sense? I need to use 1 side of the payment equation, not both here because the negative transactions on the CC will be the source of truth.


## Budgets page tweaks

Spending by category would be nice with a legend always shown on it, maybe show it as a stacked line/area graph instead of stacked vertical bars

Might want to be able to tweak historical budgets - some mistakes got made and now they're showing up weird, I want to be able to fix those to get accurate data and fix the app's algorithms

## Currency display

Generally stick with no cents shown for dollar amounts, precision should be to 0, not decimals