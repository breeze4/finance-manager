# Step 4 handoff — Subscriptions page (Phase 3 of mockup-page port)

Plan: `docs/plans/2026-05-07-08-port-mockup-pages.md` §Phase 3 (all
checklist items done).

## What landed

- `frontend/src/api/subscriptions.ts` — typed client for the three
  subscription endpoints. Snake_case fields preserved at the API
  boundary (small resource, no camelCase adapter per plan).
- `frontend/src/pages/Subscriptions.tsx` — replaces the 3-line stub.
  Two tabs (Fixed / Recurring) backed by a single `listSubscriptions`
  query, partitioned client-side on `subscription_type`. Summary cards
  + category donut. "Re-detect" button in the page header wires the
  `/detect` mutation.

No changes to `App.tsx` (route already in place), `AppSidebar.tsx`,
shared infra, or any other API client / page.

## API endpoints used

| Method   | Path                          | Wrapper                   |
| -------- | ----------------------------- | ------------------------- |
| `GET`    | `/api/subscriptions`          | `listSubscriptions()`     |
| `POST`   | `/api/subscriptions/detect`   | `detectSubscriptions()`   |
| `PATCH`  | `/api/subscriptions/{id}`     | `updateSubscription(id, payload)` |

`updateSubscription` is exported but not yet called from the page —
the mockup has no inline category-edit / activate-toggle UI. Wiring
that is a future enhancement, not in scope for this slice.

## Mutation invalidation keys

- `detectSubscriptions` (Re-detect button) →
  `qc.invalidateQueries({ queryKey: ["subscriptions"] })`

The list query uses the bare `["subscriptions"]` key (no params), so
that single invalidation is sufficient.

## Field-name mismatches with mockup shape

The mockup invents a couple of fields the backend does not surface;
each was either remapped to the closest existing field or dropped.

| Mockup field              | Backend field                    | Resolution                          |
| ------------------------- | -------------------------------- | ----------------------------------- |
| `s.amount * frequencyMult`| `s.annual_estimate`              | Use server-computed annual directly |
| `s.lastCharge`            | `s.last_charge_date`             | Rename, render as-is (`YYYY-MM-DD`) |
| `s.category` (string)     | `s.category_name` (nullable)     | Fallback to `"Uncategorized"`       |
| `s.minAmount`/`s.maxAmount` (recurring tab) | `s.amount_min`/`s.amount_max` | Snake_case rename       |
| `s.avgAmount` (recurring) | (none — derive)                  | Replaced with `annual_estimate` column ("Annual"). Keeping a separate avg column would require dividing `annual_estimate` by frequency multiplier — redundant with the range column already shown. |
| `s.history[]` (sparkline) | (none)                           | **Trend column dropped.** Adding it would require a per-vendor history endpoint or an extra transactions fetch per row; deferred until there's a real signal it matters. |

The mockup splits subscriptions into two static arrays (`subscriptions`
and `recurringExpenses`); the backend keeps both kinds in one table
discriminated by `subscription_type` (`"fixed"` vs `"variable"`). The
page filters by that field — `fixed` = fixed tab, anything else = variable
tab. Inactive subscriptions (`is_active === false`) are excluded entirely;
the mockup had no inactive state.

## Gate result

```
$ cd frontend && npm run build
✓ built in 5.39s

$ cd frontend && npm test -- --run
Test Files  12 passed (12)
     Tests  281 passed (281)
```

281 tests / 12 files — same as the Step 3 baseline. No tests added
this step (page is a thin TanStack-Query wrapper around an already-
typed client, same justification as Overview).

## Notes / surprises

- The mockup hard-coded a recurring/avg-amount column based on
  `avgAmount` (mid-point of min/max). Backend doesn't expose an
  average — only `amount_min`, `amount_max`, and the derived
  `annual_estimate`. Replaced the "Average" column with "Annual"
  (already-computed, server-truth) and let the existing "Range" column
  carry the min/max signal. Same information, fewer redundant cells.
- Variable subscriptions are detected via coefficient of variation
  (`>= 0.05` per `subscription_service._FIXED_CV_THRESHOLD`). For these
  rows `s.amount` is `None` on the wire — the page guards it (`s.amount
  != null`) and uses `amount_min`/`amount_max` for display instead.
- `category_name` is nullable (a sub may have no category yet). The
  page renders `"Uncategorized"` in that case rather than an empty
  badge — keeps the table tidy without inventing a backend default.
- The detect button is **always** visible, not gated on "no subs yet"
  the way some apps do. Re-running detection is idempotent server-side
  (`subscription_service.detect_subscriptions` upserts), so exposing it
  as a routine action is safe; users with stale data may want to
  re-scan after a fresh transaction import.
- `updateSubscription(id, { is_active, category_id })` is exported but
  the page never calls it — kept in the client because the endpoint is
  part of the documented contract and a follow-up tweak (toggle
  inactive, recategorize) wouldn't need to extend the API layer.
- All Recharts containers are guarded on `pieData.length === 0` to
  avoid the warn-on-empty-data console spam (matches Overview's
  convention).
- `useState`-driven tab value from the mockup was simplified to
  `defaultValue="fixed"` — the page has no need to read tab state
  outside the component.

## Files touched

- `frontend/src/api/subscriptions.ts` (NEW)
- `frontend/src/pages/Subscriptions.tsx` (REPLACED — was a 3-line stub)
- `docs/handoff/step-4-subscriptions.md` (NEW — this file)
