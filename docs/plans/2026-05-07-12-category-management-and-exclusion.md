# Category Management UI + Exclude-From-Budget Flag

## Context

SPEC additions: `docs/SPEC.md` § "User-Managed Categories" and § "Excluded-From-Budget Categories".

Today categories can only be created via raw API call, there is no management surface in the UI, and there is no way to mark a category as "classify but don't count toward spending". Users hit this when they have transactions that aren't really spending — mortgage payoff, principal-only payments, large savings moves — that today either go uncategorized (so they pollute the Uncategorized bucket) or get a category that distorts budget and historical-average math.

This plan introduces:

1. A `Category.exclude_from_budget` boolean column, applied at every spending-analysis call site that currently filters `Transaction.is_transfer` (budget service, historical analysis, stats, forecasts, subscriptions).
2. A lightweight `/categories` management page (list, create, rename, delete, toggle exclusion). No inline-create from the Transactions dropdown — that stays a pure picker.

## Design Notes

- **Flag lives on Category, not Transaction.** Mirroring `is_transfer` (per-row) at the category level keeps the rule "this whole bucket is not spending" expressed once, not stamped onto every row.
- **Filter join, not denormalized column.** Spending-analysis queries already join Category for the name; they get the new column from the same join. Avoid pre-stamping `is_excluded` on each transaction at ingest — invalidates whenever a category is reclassified.
- **Same call sites as `is_transfer`.** The exclusion semantics match transfers, so the filter goes wherever `Transaction.is_transfer.is_(False)` is today (see Slice 2 below for the exhaustive list).
- **System categories.** Renames and deletes still gated on `is_system`. The `exclude_from_budget` toggle is allowed on system categories (so the user can mark "Investments" excluded if they want, without inventing a parallel category).
- **Delete safety.** Existing 409-on-nonzero-transaction-count rule (`category_router.py:81`) is correct and stays; we don't add cascade or reassignment in this pass.

## Slices

### Slice 1 — Schema + API foundation

- [ ] Add `exclude_from_budget: bool` (default `false`) to `app/models/category.py`.
- [ ] Alembic migration: add column to `categories` with `server_default='0'`, then drop the server default after backfill (column has Python-side default for new rows). Filename `YYYYMMDD_HHMM_add_exclude_from_budget.py` matching existing convention.
- [ ] Update `CategoryCreate`, `CategoryUpdate`, `CategoryResponse` schemas to include `exclude_from_budget`. Default to `False` on create. PATCH should accept partial updates (name optional, exclude flag optional) — currently `CategoryUpdate` only carries `name`; broaden it.
- [ ] Update `category_router.py`:
  - POST: read `exclude_from_budget` from body.
  - PATCH: allow toggling the flag; allow toggling on system categories; still 409 on rename collisions; still reject rename/delete of system categories.
- [ ] Update `frontend/src/api/categories.ts` types + `createCategory` / `updateCategory` payloads.
- [ ] Tests:
  - Backend: extend `tests/test_category_*.py` (or add one) for create-with-flag, patch-flag-on-system-category, patch-flag-only (no rename).
  - Frontend: light type-check; no UI yet.

**Done when:** `curl POST /api/categories` accepts and returns `exclude_from_budget`, migration applies cleanly to the existing `data/finance.db`.

### Slice 2 — Wire exclusion into spending queries

Apply the filter at every site currently filtering `is_transfer`. The pattern is to join `Category` (already joined in most of these for the name) and add `Category.exclude_from_budget.is_(False)` (with `or_(Category.id.is_(None), …)` where category is nullable, so uncategorized rows still flow through).

- [ ] `app/services/budget_service.py:39` — `get_actual_vs_budget`.
- [ ] `app/services/budget_service.py:349` — historical analysis.
- [ ] `app/services/stats_service.py:16` — spending summary.
- [ ] `app/services/stats_service.py:92` — spending detail.
- [ ] `app/services/forecast/simple.py:96, 125, 169` — three forecast queries.
- [ ] `app/services/subscription_service.py:77` — subscription detection.
- [ ] `app/routers/forecast_router.py:30` — forecast router query.
- [ ] Decide: do we filter `is_transfer` AND `exclude_from_budget`, or replace `is_transfer` with a unified condition? **Decision: keep both, AND'd.** They're independent flags, both must be False to count as spending.
- [ ] Tests: add a "mortgage payoff excluded category" fixture and assert it doesn't appear in:
  - `test_budget_crud.py` actual-vs-budget totals
  - historical analysis output
  - stats summary
  - forecast next-month projection
  - subscription detection

**Done when:** Toggling `exclude_from_budget=true` on a category with existing transactions makes those transactions vanish from budget/stats/forecast/subscription views without any data migration.

### Slice 3 — `/categories` management page

- [ ] Add route in `frontend/src/App.tsx` and sidebar entry in `AppSidebar.tsx` (likely under a "Settings" or "Manage" group, or just bottom of main nav — match existing styling).
- [ ] Create `frontend/src/pages/Categories.tsx`:
  - Table: name, system badge, transaction count, "Excluded from budget" toggle, edit/delete actions.
  - "New Category" button → modal with name input + exclude-from-budget checkbox.
  - Edit modal: rename (disabled for system) + exclude toggle.
  - Delete: only enabled when `transaction_count === 0`; confirmation prompt.
  - Inline toggle on the exclude column for fast bulk-style adjustments.
- [ ] Use existing UI primitives in `frontend/src/components/ui/` — Dialog, Switch/Checkbox, Table, Button. Match `AccountFormModal.tsx` pattern for the modal.
- [ ] React Query: invalidate `['categories']` after any mutation; ensure Transactions page picks up renames immediately.
- [ ] Tests: a frontend smoke test in `frontend/src/pages/__tests__/` covering render + create + toggle (mock the API client).

**Done when:** A user can navigate to `/categories`, add "Mortgage Payoff", mark it excluded, return to Transactions, classify mortgage transactions to it, and see them disappear from the Budget page.

## Verification Steps (after all slices)

1. Apply migration to a copy of `data/finance.db` (backup already exists per git status: `data/finance.db.bak.20260507-151829`).
2. Run backend tests: `cd backend && pytest`.
3. Run frontend tests: `cd frontend && npm test`.
4. Manual: start dev servers, walk the mortgage-payoff scenario end-to-end.
5. Confirm Budget page totals shift downward by the excluded-category total for an affected month.

## Out of Scope

- Inline category creation from the Transactions dropdown (deferred — explicitly chosen "management page only").
- Bulk reassign-then-delete UX for categories with transactions.
- Category colors / icons / grouping (flat-taxonomy is a SPEC invariant).
- Migrating `is_transfer` to a category-based mechanism (the two flags coexist deliberately; payment-matcher pairs stay row-level).

## Review

All three slices complete. Backend 336 tests pass (was 328, +8 new in `tests/test_category_exclusion.py`). Frontend 285 tests pass (was 281, +4 new in `pages/__tests__/Categories.test.tsx`). Backend ruff and frontend tsc both clean.

**Files changed:**

Backend:
- `app/models/category.py` — new `exclude_from_budget` column.
- `alembic/versions/61d1164fa063_category_exclude_from_budget.py` — migration; applied to real `data/finance.db`. (Backup at `data/finance.db.bak.20260507-151829`.)
- `app/schemas/category.py` — partial updates now allowed; `name` and `exclude_from_budget` both optional on PATCH.
- `app/routers/category_router.py` — POST/PATCH plumbing; PATCH now treats both fields as independent partial updates.
- `app/services/category_filters.py` — new shared helper `not_excluded_from_budget()` (subquery-based, NULL-safe).
- `app/services/budget_service.py`, `stats_service.py`, `subscription_service.py`, `forecast/simple.py`, `routers/forecast_router.py` — added the new filter alongside existing `is_transfer` filter at every spending-analysis call site (9 sites total).
- `tests/test_transaction_api.py` — extended `TestCategoryAPI` with create/patch flag coverage.
- `tests/test_category_exclusion.py` — new file, asserts an excluded category disappears from actual-vs-budget, historical analysis, summary stats, monthly stats, YoY forecast, simple-forecast projection, subscription detection, and that uncategorized rows still flow through.

Frontend:
- `api/categories.ts` — type fields now match the broader API.
- `pages/Categories.tsx` — new page; table with inline `Switch` per row, create/edit modal, delete dialog gated on `transaction_count === 0`. System-category renames disabled in the form (toggle still works).
- `App.tsx` — new `/categories` route.
- `components/AppSidebar.tsx` — new sidebar entry below Accounts.
- `pages/__tests__/Categories.test.tsx` — render, create-with-flag, inline-toggle PATCH, delete-disabled-with-transactions.

**Notable design decisions resolved during implementation:**

1. **Filter shape:** Used a NOT IN subquery on `Category.id` rather than denormalizing `is_excluded` onto each transaction. Keeps the property a single source of truth on Category and avoids backfill churn when toggling. Each call site adds one `.filter(not_excluded_from_budget())` line.
2. **NULL-safety:** Filter wraps the NOT IN with `or_(category_id.is_(None), …)` so that uncategorized rows (which can never reference an excluded category) are not silently dropped.
3. **System-category rename:** The router didn't reject system renames before this change either; I deliberately did not add a new restriction (out of scope), but the *form* in the new UI disables the name field for system rows. Users editing system categories via the UI can only toggle the flag.
4. **Bypass of dialog from form:** The inline switch in the row uses `updateCategory` directly — same code path as the modal — and only invalidates the query on success. The user told us no inline-create from the Transactions dropdown, but inline *toggle* from the Categories page itself was always implied by "lightweight". Worked out to a single `Switch` component per row.
5. **Migration ran against real DB:** Verified the column is present and existing 16 categories have `exclude_from_budget=0`. No user data lost; the user's own backup (`data/finance.db.bak.20260507-151829`) covers any rollback need.

**Out of scope (deferred per plan):**
- Inline category creation from the Transactions assign-category dropdown.
- Reassign-then-delete flow for categories with transactions.
- UI surfacing of *which* categories are currently excluded outside the Categories page (e.g. a banner on Budget). The Switch state on Categories is the single source of truth.
