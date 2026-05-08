# Conscious Spending Plan (CSP)

## Problem Statement

Today's Budget page treats every category equally and offers no high-level lens that maps spending into the four buckets the user actually plans against (fixed costs, investments, savings, discretionary). The existing **Flex Budget** tab attempts a similar grouping (Fixed / Flexible / Non-Monthly) via a `classifyBucket()` heuristic, but the buckets don't match the user's planning model and the heuristic produces inconsistent assignments.

The user wants the budget-setting workflow driven by Ramit Sethi's Conscious Spending Plan: see the four bucket percentages implied by their current per-category baselines, compare against Ramit's recommended ranges, and tweak categories until the plan fits. The existing per-month overrides and rollover behavior must keep working.

## Solution

CSP becomes the planning lens for the Budget page:

- The existing **Set Budget** tab is rewritten as a CSP-flavored page: a net income block at the top, a four-bucket dashboard showing baseline-implied percentages versus Ramit's ranges, and a per-category list grouped by bucket where the user edits baseline targets inline.
- The **Flex Budget** tab is removed entirely. Its `classifyBucket()` heuristic is deleted.
- The **Actual vs Budget** tab gains a four-bucket rollup card at the top (this-month actuals versus planned bucket percentages) and re-groups its category list under bucket headers.
- Two fields are added to the Category model: `csp_bucket` (enum) and `is_pre_tax` (boolean). Pre-tax categories like 401(k) and HSA carry a budget without transactions; their budget amount counts toward both the bucket numerator and the net income denominator.
- A step-function `net_income` table tracks monthly take-home over time. The initial value is suggested from paycheck pattern detection; the user updates it with "this month and going forward" semantics.

Per-category dollar amounts remain the source of truth. CSP percentages are read-only feedback computed from category baselines. Bucket guideline ranges follow Ramit's textbook defaults (Fixed 50–60%, Investments 10%, Savings 5–10%, Guilt-Free 20–35%) and are not user-editable in v1.

## User Stories

### Setup

1. As a new user, I want the app to suggest a starting net income from my paycheck history, so I don't look up the number myself.
2. As a user with no budget yet, I want to see historical averages alongside each empty category target, so I can use my own data as the starting point.
3. As a user, I want every spending category to belong to a CSP bucket, so the app can roll my spending into the four buckets.
4. As a user, I want existing system categories pre-assigned to sensible default buckets, so I don't classify them from scratch.
5. As a user, I want to override the default bucket for any category, so I can match the framework to my own thinking.
6. As a user, I want to mark a category as pre-tax (401(k), HSA), so I can budget for contributions whose money flow doesn't appear in transactions.

### Planning

7. As a user, I want a four-bucket dashboard at the top of the Set Budget tab, each card showing my baseline percentage and Ramit's recommended range.
8. As a user, I want each bucket card to indicate under / in-range / over relative to Ramit's range, so I see which buckets need attention.
9. As a user, I want to edit a category's baseline target inline, so I can tweak my plan without leaving the page.
10. As a user, I want bucket percentages to update live as I edit category targets, so I see the effect immediately.
11. As a user, I want categories grouped by CSP bucket on the Set Budget tab, so I can focus on one bucket at a time.
12. As a user, I want to set per-month overrides on a category (e.g., bump Shopping in December), so I can plan known seasonal variation.
13. As a user, I want to enable rollover mode on any category, so unspent budget carries forward.
14. As a user, I want bucket dashboard percentages to reflect baseline targets only — not rollover surplus or per-month overrides — so the planning view shows what I committed to, not what was deferred.
15. As a user, I want to update my net income with "this month and going forward" semantics, so I can model raises and job changes without rewriting history.
16. As a user, I want to see a history of net income changes, so I can verify what the system used in any given month.
17. As a user, I want a tooltip on the net income block explaining that the denominator includes pre-tax contributions, so the math isn't surprising.

### Tracking

18. As a user, I want the Actual vs Budget tab to group categories by CSP bucket, so the tracking view is visually consistent with planning.
19. As a user, I want a four-bucket rollup card on the Actual vs Budget tab showing this-month actuals versus planned bucket percentages, so I see whether the plan is holding.
20. As a user, I want pre-tax categories to show actual = budget on tracking views, so they don't appear "unspent" just because they have no transactions.
21. As a user, I want categories outside the budget (income, transfers, `exclude_from_budget`) to be invisible to CSP rollups, so bucket math reflects only real spending.

### Validation

22. As a user, I want a warning if any spending category lacks a CSP bucket, so I can fix the gap before it skews percentages.

## Data Flow

**Set Budget tab load:**
1. Frontend requests: category list (with `csp_bucket`, `is_pre_tax`, baseline budget, override and rollover indicators), net income for the current month, historical averages per category, CSP planning rollup.
2. CSP rollup service computes per-bucket totals (sum of category baselines + sum of pre-tax budgets in that bucket) and the denominator (net income + sum of all pre-tax budgets). Returns four `(bucket, dollars, percentage, ramit_range, status)` records.
3. Frontend renders the net income block, the four bucket cards, and the bucket-grouped category list.

**Edit category baseline:**
1. User edits inline → frontend PUTs to existing budget endpoint.
2. Frontend re-requests CSP rollup; bucket cards update.

**Edit net income:**
1. User opens net income editor, picks effective month and amount.
2. Frontend PUTs to net income endpoint with `(effective_month, take_home_amount)`.
3. Backend writes new row to the step-function table; subsequent reads of any month ≥ effective_month return the new value.
4. Frontend re-requests rollup; denominator updates.

**Actual vs Budget tab load:**
1. Frontend requests: existing actuals (per category, per month), CSP actuals rollup.
2. CSP rollup service computes per-bucket actuals (sum of category transaction-actuals + pre-tax category budgets) and denominator (same as planning denominator).
3. Frontend renders four-bucket rollup card and bucket-grouped category list.

**First-time net income suggestion:**
1. Frontend requests paycheck detection suggestion.
2. Service runs recurring-pattern detection over income transactions, returns suggested monthly amount or NULL.
3. Frontend pre-fills the net income editor with the suggestion; user confirms or overrides.

## Behavior

### Inclusion rules

- Every spending category MUST have a non-NULL `csp_bucket`.
- `csp_bucket` is NULL if and only if the category is income, transfer-only, or `exclude_from_budget=true`.
- The CSP rollup excludes: income categories, `is_transfer=true` transactions, and `exclude_from_budget=true` categories. These never contribute to bucket numerators or denominators.

### Pre-tax categories

- `is_pre_tax=true` categories never receive transactions. Frontend prevents assignment; backend rejects attempts.
- For all rollup math (planning and actuals): `actual := budget`. The category's budget amount is its bucket contribution.
- The pre-tax budget amount is added to the net income denominator. Total denominator = `take_home_for_month + sum(pre_tax_budgets_for_month)`.
- A tooltip on the net income block surfaces the denominator composition.

### Net income step-function

- Stored as rows of `(effective_month, take_home_amount)`.
- For any month M, the effective net income is the row with the latest `effective_month` ≤ M.
- If no row exists for M (i.e., M predates all entries), the value is treated as zero or NULL — UI shows a "set net income" prompt; rollup percentages are suppressed for that month.
- Updating net income writes a new row at the user-chosen effective month. Existing rows are not altered. Setting a value for a month that already has an entry overwrites that entry.
- A history view lists all entries with effective month and amount.
- Initial value comes from paycheck detection, displayed as a suggestion in the editor; user must accept or override before the first save.

### Bucket dashboard math

- **Set Budget tab cards:** numerator = sum of baseline budgets in that bucket + sum of pre-tax budgets in that bucket. Per-month overrides and rollover surplus are NOT included. This is the planning view.
- **Actual vs Budget tab card:** numerator = sum of actual transaction spend in that bucket for the displayed month + sum of pre-tax budgets in that bucket. Per-month overrides ARE reflected (because they affect the budget side of the comparison). Rollover surplus IS reflected (because it affects effective budget for the month). Mirrors the existing Actual vs Budget computation, just rolled up.
- Status indicator: `under` (below Ramit range minimum), `in-range`, `over` (above maximum). For investments where Ramit's number is "10% or more," over is informational, not a problem — UI labels it as "over (ok)".

### Existing budget mechanics

- Baseline target, per-month overrides, rollover toggle: all retained. CSP layers on top without changing behavior.
- The `Budget` model continues to store the same per-category data. No schema change to budgets themselves.

### What this feature owns

- The `csp_bucket` and `is_pre_tax` fields on Category and their semantics.
- The net income step-function table and its lookup logic.
- Paycheck pattern detection for net income suggestion.
- The CSP bucket rollup computation (planning + actuals).
- Ramit's range constants and the in-range / over / under classifier.

### What this feature hides

- The paycheck detection algorithm details.
- The denominator inflation logic for pre-tax categories.
- The step-function lookup mechanics.

### What this feature exposes

- `GET /api/csp/rollup?month=...&mode=planning|actuals` → list of four bucket records.
- `GET /api/net-income?month=...` → effective net income for that month plus history.
- `PUT /api/net-income` with `(effective_month, take_home_amount)` → upsert into the step-function table.
- `GET /api/paycheck-detection/suggest` → suggested monthly net income or NULL.
- Two new fields on `CategoryResponse` and `CategoryUpdate`: `csp_bucket` and `is_pre_tax`.

### Caller migration

- **Set Budget tab (frontend):** rewrite to consume the rollup endpoint and edit categories grouped by bucket. Net income editor added.
- **Actual vs Budget tab (frontend):** modify to consume rollup actuals and group categories by bucket.
- **Flex Budget tab (frontend):** delete entirely.
- **Categories management page (frontend):** add bucket dropdown column and pre-tax toggle.
- **`budget_service` (backend):** when computing actuals for a category with `is_pre_tax=true`, return the budget amount instead of summing transactions. All other actuals paths unchanged.
- **`SPEC.md`:** remove the Flex Budget section. Add a Conscious Spending Plan section to the Budget chapter referencing this spec.

### One-time data migration

- Alembic migration adds the two columns. `csp_bucket` is nullable at the column level (because income / transfer / excluded categories are NULL).
- A separate data-migration step (executed by an agent pass after the schema migration lands) assigns `csp_bucket` to every existing category. The agent reads category names and source categories, picks the best bucket per Ramit's defaults, and produces a SQL or Alembic data migration. User reviews the proposed assignments before commit.

## Modules

- **Category model extension** — adds `csp_bucket` (enum) and `is_pre_tax` (boolean) fields.
  - Role: **defines** schema consumed by budget service, CSP rollup, and frontend.
  - Interface: two new fields on the Category model and its read/write schemas; data migration seeds initial values.
  - Test: yes — migration correctness, default behavior, NULL semantics for income / transfer / excluded categories.

- **Net income service** — owns the step-function table.
  - Role: **defines** lookup interface.
  - Interface: `get_for_month(month)`, `set_from_month(month, amount)`, `get_history()`.
  - Test: yes — high priority. Date-effective lookup, gap behavior (no entry yet), boundary months, overwrite semantics.

- **Paycheck detection** — recurring-pattern detection on income transactions.
  - Role: **consumes** transaction model; **defines** suggestion shape.
  - Interface: `suggest_monthly_net()` returning monthly amount or NULL.
  - Test: yes — common patterns (weekly, bi-weekly, semi-monthly, monthly), insufficient data behavior.

- **CSP rollup service** — pure computation of bucket totals and denominator.
  - Role: **defines** rollup response shape consumed by frontend.
  - Interface: `get_planning_rollup(month)`, `get_actuals_rollup(month)`.
  - Test: yes — high priority. Bucket math, exclusion rules, pre-tax denominator inflation, range classifier (under / in-range / over), Investments "over is ok" labeling.

- **Budget service modification** — pre-tax actuals branch.
  - Role: **consumes** Category schema.
  - Interface: existing `get_actual_vs_budget`; `actual` derivation now branches on `is_pre_tax`.
  - Test: yes — regression test that pre-tax categories report actual = budget; non-pre-tax paths unchanged.

- **API routes** — new endpoints for rollup, net income, paycheck suggestion.
  - Role: **defines** HTTP contract.
  - Interface: REST endpoints listed in *What this feature exposes*.
  - Test: no in v1 — covered transitively by service tests.

- **Set Budget tab redesign** — frontend rewrite.
  - Role: **consumes** rollup, net income, category, budget endpoints.
  - Interface: net income block, four-bucket dashboard, bucket-grouped category list.
  - Test: no — manual smoke testing and agent-browser screenshots.

- **Actual vs Budget tab updates** — frontend modify.
  - Role: **consumes** existing actuals plus rollup.
  - Interface: four-bucket rollup card, bucket-grouped category list.
  - Test: no — manual.

- **Flex Budget tab removal** — deletion.
  - Role: deletion only. Removes UI, the heuristic, and the spec section.
  - Test: no — verify nothing else references the deleted code via build.

- **Categories management page update** — bucket dropdown and pre-tax toggle.
  - Role: **consumes** Category schema.
  - Interface: form fields on category edit row.
  - Test: no — manual.

- **Net income editor component** — modal with effective-month picker.
  - Role: **consumes** net income endpoints.
  - Interface: form with current value, override input, effective month, history drilldown.
  - Test: no — manual.

## Resolved Decisions

- **CSP replaces the Set Budget and Flex Budget tabs; Historical and Actual vs Budget remain.** Considered: collapsing all four tabs into one CSP page (rejected as too aggressive once the planning-versus-tracking distinction was clarified). Considered: keeping all current tabs and adding CSP as a fifth (rejected as bloat).
- **Per-category dollars are the source of truth; CSP percentages are read-only feedback.** Considered: bucket-only targets with category targets derived (rejected as too rigid). Considered: editable bucket percentages with proportional category redistribution (rejected — magic redistribution misleads the user about which categories actually changed).
- **`csp_bucket` is a required enum for spending categories, NULL only for income / transfer / excluded.** Considered: an "Unassigned" sentinel value (rejected as more confusing than NULL — every spending category has a bucket; categories that aren't in CSP at all have NULL).
- **`is_pre_tax` boolean on Category, with `actual = budget` semantics.** Considered: a separate `pre_tax_contributions` table (rejected — one model is simpler; pre-tax behavior fits cleanly as a flag).
- **Net income denominator = take-home + sum(pre-tax budgets).** Considered: take-home only (rejected — bucket totals would exceed 100%, breaking the visual). Tooltip on the net income block explains the synthetic figure.
- **Net income is a step function over time.** Considered: a single fixed value (rejected — user's income will vary over the next year or two). Considered: per-month explicit entries (rejected — too much typing for steady periods). Step function with "this month and going forward" updates matches the user's mental model.
- **Savings is a single bucket; no sub-goals in v1.** Considered: first-class savings-goal model with target balances and ETAs (rejected for v1 — user doesn't think in terms of goal-tracking jars; can revisit if needs change).
- **Suggestions are passive, per-row hints (no wizard, no bulk-fill button).** Considered: one-time onboarding wizard (rejected as inflexible after life changes). Considered: a "Suggest from history" button that fills all rows at once (rejected — user prefers reading the historical column and typing manually).
- **Existing budget mechanics retained: baseline + per-month overrides + rollover.** Considered: dropping rollover (rejected — user actively uses it). Considered: simplifying to baseline-only with going-forward overrides (rejected — per-month overrides matter for known seasonal spikes like December gift spending).
- **Bucket dashboard on Set Budget shows baseline targets only, ignoring rollover and per-month overrides.** Rationale: rollover surplus is "bonus spend," not part of the planned allocation; the planning view should reflect what was committed. The Actual vs Budget rollup card does include overrides and rollover because that surface tracks effective state for the displayed month.
- **Actual vs Budget tab gets full CSP bleed-through: rollup card + bucket grouping.** Considered: leaving Actual vs Budget untouched (rejected — defeats the point of bucket targets). Considered: visual grouping only without rollup card (rejected as a half-measure).
- **Bucket guideline ranges = Ramit's textbook defaults (Fixed 50–60%, Investments 10%, Savings 5–10%, Guilt-Free 20–35%).** Hardcoded in v1. User customization deferred.
- **Bucket reassignment editable on both the Categories management page and inline on the Set Budget tab.** Both surfaces stay in sync via the same Category schema.
- **Money Dials are out of scope.** Values-tagging concept, not budget math.
- **Net income block lives on the Set Budget tab in v1.** May relocate later (Settings, Overview) but lives there now because it is the planning denominator and CSP is the planning surface.
- **One-time agent classification pass seeds `csp_bucket` for existing categories** after the schema migration. Defaults follow Ramit's standard mappings; user reviews proposed assignments before the data migration is committed.

## Testing Decisions

Tested modules:
- **Net income service** — date-effective lookup, gap handling, overwrite semantics, history ordering.
- **CSP rollup service** — bucket math, exclusion rules (income / transfer / excluded NULL bucket), pre-tax handling, denominator inflation, range classifier, planning vs actuals shapes.
- **Paycheck detection** — common paycheck patterns, insufficient data, multiple income streams.
- **Budget service modification** — pre-tax actual = budget regression; non-pre-tax paths unchanged.
- **Category model migration** — schema correctness, default seed values.

Untested modules: API routes (covered transitively); all frontend modules (manual smoke testing + agent-browser screenshots).

Prior art: existing service tests under `backend/tests/` (e.g., `test_category_exclusion.py`, `test_transaction_api.py`). Follow the same fixture and assertion patterns.

Frontend verification gap to surface: four frontend modules are added or modified (Set Budget rewrite, Actual vs Budget update, Categories page update, Flex Budget removal) with no automated test coverage beyond build. Manual smoke-testing required after each frontend module lands; agent-browser screenshots recommended for the Set Budget redesign and the Actual vs Budget rollup card.

## Out of Scope

- **Savings sub-goals.** Single Savings bucket only. No goal balances, ETAs, or jar-style tracking.
- **Money Dials / values tagging.** Not part of CSP math.
- **User-customizable bucket ranges.** Ramit's textbook ranges are hardcoded in v1. A future iteration may add user-editable ranges.
- **Automatic detection of pre-tax categories.** User manually flags categories as pre-tax. No heuristic.
- **CSV import of net income history.** v1 supports paycheck detection plus manual entry only.
- **Bulk bucket reassignment workflows.** User reassigns one category at a time.
- **Bucket-level alerts or notifications.** User reads the dashboard cards on demand.
- **Pre-tax categories receiving transactions.** Pre-tax categories explicitly do not accept transactions; UI prevents it and backend rejects it.

## Dependency Strategy

In-process, with one external dependency:

- **Net income service:** owns its own table; no external systems. Pure database.
- **CSP rollup service:** pure computation over Category, Budget, Transaction, and the net income table. Easy to test directly with in-memory or SQLite-backed fixtures.
- **Paycheck detection:** pure computation over Transaction. Reuses or shares logic with `subscription_service.py`'s recurring-pattern detection — investigate during planning whether to extract a shared module.
- **Budget service modification:** in-process branch. No new dependencies.

No mocks needed; all tests can run against real SQLite fixtures using existing test infrastructure.
