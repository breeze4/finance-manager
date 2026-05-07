# Step 9 handoff — Cleanup + final verification (Phase 8 of mockup-page port)

Plan: `docs/plans/2026-05-07-08-port-mockup-pages.md` §Phase 8 (all
checklist items done).

## What landed

- Verified zero `mockData` / `mockBudgetData` references remain in
  `frontend/src/`.
- Verified `Home.tsx` is gone; all six target pages
  (Overview, Subscriptions, Payments, Transactions, Forecast, Budget)
  plus the four pre-existing pages (Accounts, CoastFire, Mortgage,
  NetWorth) and `NotFound.tsx` are present.
- Verified each ported page is a full implementation (well above the
  100-line gate).
- Verified all 10 routes in `App.tsx` point at non-stub pages.
- Verified `AppSidebar.tsx` matches `docs/SPEC.md` §Navigation order
  for the eight spec items (Coast FIRE + Mortgage from the prior
  calculator pipeline are correctly retained, per orchestrator note).
- Appended a `## Review` section to
  `docs/plans/2026-05-07-08-port-mockup-pages.md` covering each
  phase and the surprises worth carrying forward.

No source files were modified — sidebar already matches the spec, no
drift to fix.

## Verification results

### 1. `grep -r "mockData\|mockBudgetData" frontend/src/`

```
$ grep -rn "mockData\|mockBudgetData" frontend/src/
(no output, exit 1)
```

Pass — zero hits.

### 2. `ls frontend/src/pages/`

```
Accounts.tsx
Budget.tsx
CoastFire.tsx
Forecast.tsx
Mortgage.tsx
NetWorth.tsx
NotFound.tsx
Overview.tsx
Payments.tsx
Subscriptions.tsx
Transactions.tsx
__tests__
```

Pass — `Home.tsx` absent; all six target pages plus four pre-existing
pages plus `NotFound.tsx` present.

### 3. `wc -l` of the six ported pages

```
 373 frontend/src/pages/Overview.tsx
 350 frontend/src/pages/Subscriptions.tsx
 315 frontend/src/pages/Payments.tsx
 442 frontend/src/pages/Transactions.tsx
 468 frontend/src/pages/Forecast.tsx
1406 frontend/src/pages/Budget.tsx
```

Pass — all six ≥100 lines.

### 4. `cd frontend && npm run build && npm test -- --run`

```
$ npm run build
✓ built in 5.06s

$ npm test -- --run
Test Files  12 passed (12)
     Tests  281 passed (281)
```

Pass — clean build, 281/281 tests pass (same baseline as Steps 2-8).
Vite emits the chunk-size advisory note (>500 kB) it has emitted since
Step 1; not a regression.

### 5. `App.tsx` route inspection

All 10 routes wired to non-stub pages:

| Path           | Element       |
| -------------- | ------------- |
| `/`            | `Overview`    |
| `/transactions`| `Transactions`|
| `/subscriptions`| `Subscriptions` |
| `/budget`      | `Budget`      |
| `/forecast`    | `Forecast`    |
| `/payments`    | `Payments`    |
| `/coast-fire`  | `CoastFire`   |
| `/mortgage`    | `Mortgage`    |
| `/accounts`    | `Accounts`    |
| `/net-worth`   | `NetWorth`    |
| `*`            | `NotFound`    |

Pass.

## Sidebar check

`docs/SPEC.md` §Navigation lists the eight spec items in this order:

1. Overview
2. Net Worth
3. Transactions
4. Subscriptions
5. Budget
6. Forecast
7. Payments
8. Accounts

`frontend/src/components/AppSidebar.tsx` `navItems` order:

1. Overview (`/`)
2. Net Worth (`/net-worth`)
3. Transactions (`/transactions`)
4. Subscriptions (`/subscriptions`)
5. Budget (`/budget`)
6. Forecast (`/forecast`)
7. Payments (`/payments`)
8. Coast FIRE (`/coast-fire`) — from prior calculator pipeline
9. Mortgage (`/mortgage`) — from prior calculator pipeline
10. Accounts (`/accounts`)

Pass — no drift on the eight spec items. Coast FIRE and Mortgage are
the two calculator entries the orchestrator note explicitly excludes
from the spec gate. Labels match the spec verbatim. No edit needed.

## Plan Review section

Appended `## Review` to `docs/plans/2026-05-07-08-port-mockup-pages.md`
(replaced the placeholder). Confirmed by Edit operation; covers a
1-2 sentence per-phase summary, the surprises list pulled from each
prior handoff's "Notes / surprises" section, and a carry-forward /
followups list of backend gaps to revisit.

## Final gate result

```
$ cd frontend && npm run build
✓ built in 5.06s

$ npm test -- --run
Test Files  12 passed (12)
     Tests  281 passed (281)
```

Pass — clean.

## Notes

- No follow-up bugs surfaced during verification. Sidebar labels and
  order are clean; no edits to `AppSidebar.tsx` were required.
- The Vite `>500 kB` chunk-size advisory has been present since Step 1
  (Phase 0) and is not introduced by any of Phases 2-7.
- `frontend/src/pages/__tests__/` directory exists but contains only
  the prior calculator-pipeline `CoastFire.test.tsx`. The six ported
  pages added in this pipeline are deliberately not covered by tests
  — each per-page handoff documents the same justification (thin
  TanStack-Query wrappers around already-typed API clients; an
  integration-test pass is out of scope).
- `mockup/` directory is untouched, per the plan's "stays in place as
  the styling reference" rule.

## Files touched

- `docs/plans/2026-05-07-08-port-mockup-pages.md` (EDIT — replaced the
  Review placeholder)
- `docs/handoff/step-9-cleanup.md` (NEW — this file)

No frontend source changes.
