# Calculator Port — Coast FIRE & Mortgage Payoff

Bring the sibling `legacy-vue-calc` project's two calculators into Finance Analyzer as first-class features. The calculator project is Vue 3 + Pinia + Chart.js with localStorage persistence; this spec defines how those capabilities become part of the React-based analyzer with backend persistence.

## Goals

- Two new top-level features in the analyzer: **Coast FIRE** and **Mortgage Payoff**, each with its own sidebar entry.
- Preserve the calculator project's existing math correctness, tooltip-driven educational UX, and chart visualizations.
- Replace browser localStorage with backend persistence so scenarios survive across devices/sessions and multiple named scenarios per calculator can be saved.
- Single coherent React app — the calculators integrate with the analyzer's dark teal theme, sidebar navigation, and global UI conventions (monospace numerics, color coding).

## Non-Goals (V1)

- Not porting the calculator's standalone `HomePage.vue` landing page; the analyzer already has its own Overview.
- No new calculators beyond the two existing ones.
- No multi-user or auth — single-user model carries over.
- No import/export of scenarios, no sharing, no permalinks.

## Source Project Inventory

What gets carried over from `legacy-vue-calc/`:

- **Math library** (`src/utils/math/`): `coastFire.ts`, `mortgage.ts`, `compound.ts`, `validation.ts`, `charts.ts`, `index.ts` — pure functions, framework-agnostic, ported as-is to the analyzer's frontend.
- **Math formatters** (`src/utils/mathFormatters.ts`): pure TS string-formatting helpers for tooltip content — ported as-is.
- **Tests**: `tests/math/*`, `tests/mathFormatters.test.ts`, store calculation tests where they exercise math logic — ported and kept passing. Vue-specific test plumbing dropped.
- **Type definitions** for chart data shapes (`src/types/chart.ts`) — adapted to Recharts.
- **Calculator UIs** (`src/views/CoastFireCalculator.vue`, `src/views/MortgagePayoffCalculator.vue`): rewritten as React components; layout, field grouping, copy, and tooltip placement preserved.
- **MathTooltip**: rewritten as a React component; CSS/animation behavior preserved.

What is NOT carried over:

- Pinia stores and `pinia-plugin-persistedstate` — replaced by analyzer-side state management + backend persistence.
- vue-router / `NavBar.vue` — analyzer's existing sidebar handles navigation.
- Vue ChartJS wrappers — replaced by analyzer's Recharts components.
- `HelloWorld.vue`, calculator's own `style.css`, calculator's color palette — analyzer theme wins.

## Frontend Architecture

### Stack

The analyzer's frontend (currently scaffolded as `mockup/`) becomes the canonical app: React 18 + Vite + TypeScript + shadcn/ui + Tailwind + Recharts + react-router-dom. A new `frontend/` directory mirrors this stack (the existing Makefile already references `frontend/`).

### Module layout for calculators

Within the analyzer frontend:

```
frontend/src/
├── lib/math/                    # ported pure-function library (coastFire, mortgage, compound, validation, charts, formatters)
├── components/calculators/
│   ├── MathTooltip.tsx          # React port of MathTooltip.vue
│   ├── CoastFireForm.tsx        # input groupings
│   ├── MortgageForm.tsx
│   └── shared/                  # shared inputs, result tiles, scenario picker
├── pages/
│   ├── CoastFire.tsx
│   └── Mortgage.tsx
├── hooks/
│   ├── useCoastFireScenario.ts  # loads/saves scenario via API; replaces Pinia store
│   └── useMortgageScenario.ts
└── api/
    └── calculators.ts           # typed client for calculator endpoints
```

State management: scenario data is server state owned by React Query; transient input state lives in component state or a lightweight reducer per calculator. No Redux/Zustand required for V1.

### Charts

Recharts replaces Chart.js. The math library's existing chart-data generators (`generateCoastFireProjectionChart`, `generateBalanceChartData`, etc.) currently emit Chart.js dataset shapes. Two options for adapter layer:

- **Adapter functions** that translate the existing generator output to Recharts-friendly arrays of `{ x, y, ... }` rows. Keeps math library untouched.
- **Rewrite generators** to emit Recharts-friendly shapes directly.

V1 adopts the adapter approach to minimize math-library churn and let tests on the original generators continue to pass.

### Theming

- Use analyzer's dark-first teal theme. Calculator's blue/green/red palette is dropped.
- Chart series colors come from analyzer's 8-color chart palette.
- All currency/numeric outputs use the analyzer's monospace numeric convention.
- Color semantics align with analyzer: green = positive/income/savings, red = negative/cost, amber = warning. Mortgage "interest saved" is green; "interest paid" is red.

### MathTooltip port

The Vue `MathTooltip.vue` component is reimplemented in React using a Radix-based primitive (e.g. `@radix-ui/react-hover-card` or `@radix-ui/react-tooltip`, both already in the mockup deps). Behavior preserved:

- Desktop: hover reveals tooltip with formula, substituted values, step-by-step breakdown, educational explanation.
- Mobile: tap opens a modal/sheet with the same content.
- Help-cursor indicator on the trigger element.
- Tooltip content built from a template-string substitution model; the formatter helpers from `mathFormatters.ts` provide values.

### Validation & error display

Validation continues to be pure functions in `lib/math/validation.ts`. Each form maintains a `errors` object keyed by field name; field components display per-field error messages. Submit/recalculate is debounced (consider 300ms) to avoid recompute thrash on every keystroke.

## Calculators

### Coast FIRE

Carry over the calculator's existing scope unchanged:

- Inputs: `currentAge`, `retirementAge`, `currentSavings`, `expectedReturnRate`, `targetRetirementAmount`, `monthlyExpenses`, `yearlyExpenses`, `withdrawalRate`, `inflationRate`, `useRealReturns`.
- Bidirectional sync between `monthlyExpenses` ⇄ `yearlyExpenses` ⇄ `targetRetirementAmount`. Last-edited field wins.
- Computed result tiles, each with a math tooltip:
  1. Years to retirement
  2. Real return rate (when `useRealReturns` and inflation > 0)
  3. Future value of current savings
  4. Coast FIRE number at current age
  5. Additional savings needed now
  6. Coast FIRE ready (boolean badge)
  7. Coast FIRE age (when not ready)
  8. Monthly spending available (when shown)
- Charts:
  - **Projection chart**: savings growth from current age to retirement age, with target line.
  - **Required savings by age**: bar/line of present-value-needed at each starting age.
- Validation: age range 18–100, return rates 0–30%, retirement age > current age, no negatives where disallowed.

### Mortgage Payoff

- Inputs: `principal`, `yearsLeft`, `interestRate`, `monthlyPayment`, `additionalMonthlyPayment`, `lumpSumPayment`, `investmentReturnRate`, `investmentTaxRate`.
- Computed result tiles with tooltips:
  1. Monthly interest rate
  2. Base payoff time
  3. Accelerated payoff time
  4. Base total interest
  5. Accelerated total interest
  6. Interest saved
  7. Total contributions (extra payments)
  8. Investment gross return
  9. Investment net return (after tax)
  10. Strategy recommendation (`'payoff' | 'invest'`)
- Charts:
  - **Balance over time**: standard vs accelerated balance lines.
  - **Cumulative interest comparison**: standard vs accelerated.
  - **Mortgage equity vs investment value**: shows crossover month if any.
- Tooltips for mortgage tiles are listed as "PLANNED" in the calculator project; this port treats them as in-scope. The `mathFormatters.ts` extensions (`formatAmortizationSteps`, `formatInvestmentCompoundingSteps`, `formatTaxCalculationSteps`, `formatPayoffComparisonSteps`) are part of the work — defined in the spec, not yet present in source.

## Persistence

### Multi-scenario model

Each calculator type supports multiple named scenarios per user (single-user app, but multiple scenarios are useful for "compare A/B"). One scenario is marked the active/default for that calculator and loads automatically.

- Each scenario stores a name, the full input snapshot, and timestamps.
- A scenario picker appears in the calculator page header: dropdown of saved scenarios, "New Scenario" action, rename, duplicate, delete.
- "Save" and "Save As" actions persist the current input state. Auto-save can be enabled per scenario (debounced) or kept manual — V1 uses manual save with a dirty-state indicator.

### Data model

Two new tables:

```
coast_fire_scenarios
  id, name, is_active, current_age, retirement_age, current_savings,
  expected_return_rate, target_retirement_amount, monthly_expenses,
  yearly_expenses, withdrawal_rate, inflation_rate, use_real_returns,
  last_edited_field, created_at, updated_at

mortgage_scenarios
  id, name, is_active, principal, years_left, interest_rate,
  monthly_payment, additional_monthly_payment, lump_sum_payment,
  investment_return_rate, investment_tax_rate,
  created_at, updated_at
```

Constraints:

- At most one row per table has `is_active = true` (enforced via partial unique index).
- `name` is unique per table.

A separate generic `kv_settings` table is **not** used — calculator scenarios are structured enough to deserve dedicated tables, matching the pattern already used for `budgets`, `subscriptions`, etc.

### API endpoints

New routers under `backend/app/routers/`:

`calculator_router.py` (or split into `coast_fire_router.py` + `mortgage_router.py` — TBD during planning):

```
GET    /api/calculators/coast-fire/scenarios           list
POST   /api/calculators/coast-fire/scenarios           create
GET    /api/calculators/coast-fire/scenarios/active    fetch active
GET    /api/calculators/coast-fire/scenarios/{id}      fetch one
PUT    /api/calculators/coast-fire/scenarios/{id}      update
POST   /api/calculators/coast-fire/scenarios/{id}/activate   set active
DELETE /api/calculators/coast-fire/scenarios/{id}      delete

(same shape for /api/calculators/mortgage/scenarios)
```

Computed/derived values (future value, payoff time, etc.) are **not** persisted and **not** computed server-side. The frontend remains the source of truth for math; backend stores inputs only. Rationale: the math library is already a tested TypeScript artifact; duplicating in Python doubles maintenance and risks divergence. If server-side computation is needed later (e.g., for a mobile client or report export), revisit then.

### Migration strategy

- New Alembic migration adds the two scenario tables.
- First-run UX: if no active scenario exists for a calculator, page seeds inputs with the calculator project's existing defaults (`currentAge: 30`, `retirementAge: 65`, etc.) and offers a "Save as scenario" action.
- No localStorage migration logic — calculator project users are not assumed to be migrating data.

## Navigation & Routing

Two new sidebar entries added to the analyzer's navigation, at the bottom of the existing list (which today is Overview, Transactions, Subscriptions, Budget, Forecast, Payments):

7. **Coast FIRE** — route `/coast-fire`
8. **Mortgage** — route `/mortgage`

Both use the analyzer's collapsible-sidebar pattern with appropriate Lucide icons (e.g. `TrendingUp`, `Home`). Tooltips when collapsed.

Global filters (date range, account) in the top bar do not apply to calculators — the bar either hides those controls on calculator pages or shows them disabled with explanation.

## Testing

- Math library tests (`coastFire.test.ts`, `mortgagePayoff.test.ts`, `mathFormatters.test.ts`) are ported and must pass with the same coverage. Target: keep the existing 171-test count as a floor.
- Add new tests:
  - Recharts data-adapter functions (translation correctness for projection, balance, comparison datasets).
  - API endpoint tests (FastAPI TestClient) for scenario CRUD, active-scenario uniqueness invariant, input validation.
  - React Query hook tests for `useCoastFireScenario` and `useMortgageScenario` (load, save, switch active).
- The MathTooltip React component gets snapshot/interaction tests for hover, mobile-modal, and template substitution.
- E2E coverage of the two pages is out of scope for V1 (analyzer doesn't have an E2E harness yet).

## Out of Scope / Future Iterations

- Scenario import/export (JSON, CSV).
- Comparing two scenarios side-by-side in a single view.
- Scenario sharing via URL.
- Additional calculators (retirement withdrawal, investment allocation, debt snowball).
- Server-side computation of derived values for non-React clients.
- Pulling current savings or mortgage balance from the analyzer's transaction data automatically (could feed `currentSavings` from a designated investment account, or `principal` from a tracked loan account — interesting but its own spec).

## Open Questions

- Should "Coast FIRE Number at current age" surface anywhere in the analyzer's Overview dashboard? Not in V1, but worth noting.
- Whether calculators get their own settings (e.g., default withdrawal rate, default return rate) at the user level, or always per-scenario. V1: per-scenario only.
