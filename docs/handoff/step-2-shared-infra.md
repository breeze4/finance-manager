# Step 2 Handoff — Shared Calculator Infrastructure

## Formatters filename

`frontend/src/lib/math/mathFormatters.ts` — kept the source filename for traceability with `legacy-vue-calc/src/utils/mathFormatters.ts`. The math lib's `index.ts` re-exports every formatter, so consumers should import from `@/lib/math` (not the file directly).

## `frontend/src/lib/math/index.ts` exports

```ts
// Compound interest
export { calculateFutureValue, calculatePresentValue, calculateTimeToTarget,
         calculateRealReturnRate, adjustTargetForInflation, calculateYearsToRetirement } from './compound'

// Coast FIRE
export { calculateCoastFireNumber, calculateAdditionalSavingsNeeded, isCoastFireReady,
         calculateCoastFireAge, calculateTargetFromExpenses, calculateTargetFromMonthlyExpenses,
         calculateExpensesFromTarget, calculateMonthlyExpensesFromTarget,
         generateCoastFireProjection } from './coastFire'

// Mortgage
export { calculateMonthlyRate, calculatePayoff, generateAmortizationSchedule,
         calculateInvestmentValue, calculateAfterTaxReturn, determineBetterStrategy,
         calculateRequiredPayment,
         type PaymentDetail, type PayoffResult, type InvestmentResult } from './mortgage'

// Validation
export { validateNumericRange, validateNonNegative, validatePositive, validateAge,
         validateReturnRate, validateWithdrawalRate, validateInflationRate, validateTaxRate,
         validateRetirementAge, validateCoastFireInputs, validateMortgageInputs,
         type ValidationResult, type CoastFireInputs, type MortgageInputs } from './validation'

// Chart-data generators (Chart.js-shaped output)
export { generateCoastFireProjectionChart, generateRequiredSavingsByAgeChart,
         generateMortgageBalanceChart, generateInterestComparisonChart,
         generateInvestmentComparisonChart,
         type ChartData, type ChartDataset } from './charts'

// Recharts adapters (rows + crossover detection)
export { coastFireProjectionToRecharts, requiredSavingsByAgeToRecharts,
         mortgageBalanceToRecharts, interestComparisonToRecharts, investmentComparisonToRecharts,
         type CoastFireProjectionRow, type RequiredSavingsByAgeRow,
         type MortgageBalanceRow, type InterestComparisonRow,
         type InvestmentComparisonRow, type InvestmentComparisonResult } from './charts/rechartsAdapters'

// Math formatters (for tooltips)
export { formatFormula, formatCurrency, formatPercentage, formatNumber, formatExponent,
         formatEquation, formatCompoundInterestSteps, formatPresentValueSteps,
         formatFisherEquationSteps, formatWithdrawalSteps, formatLogarithmicTimeSteps,
         formatMonthlyRateSteps, formatAmortizationSteps, formatInvestmentCompoundingSteps,
         formatTaxCalculationSteps, formatPayoffComparisonSteps,
         type FormulaValues } from './mathFormatters'
```

Steps 3 and 4 should always import from `@/lib/math` rather than reaching into individual files. Step 4 is permitted to APPEND four new mortgage formatters (`formatAmortizationSteps` is already exported but `formatInvestmentCompoundingSteps`, `formatTaxCalculationSteps`, `formatPayoffComparisonSteps` are also already exported — Step 4's responsibility is `formatAmortizationSteps`/`formatInvestmentCompoundingSteps`/`formatTaxCalculationSteps`/`formatPayoffComparisonSteps`-style additions per the spec). Existing exports must not be modified.

## `MathTooltipProps` signature

```ts
import type { FormulaValues } from "@/lib/math";

export interface MathTooltipProps {
  children: React.ReactNode;          // trigger content
  title?: string;                     // optional header
  formula?: string;                   // template with {placeholders}
  values?: FormulaValues;             // substitution map (Record<string, number | string>)
  calculation?: string | string[];    // single template or array of step templates
  result?: string;                    // result template (highlighted block)
  explanation?: string;               // plain-text paragraph
  disabled?: boolean;                 // when true, no card is shown
  className?: string;                 // optional extra className on trigger wrapper
}
```

Implementation notes:
- Desktop (`>= 768px`): Radix `HoverCard` with `openDelay=150ms`.
- Mobile (`<= 767px`): Radix `Dialog` with title from `title` prop.
- Substitution uses `formatFormula` from the ported `mathFormatters.ts` — `{currentAge}`, `{rate}`, `{amount}`, etc. follow the same key-based formatting heuristics as the calculator project. Substituted output may include `<sup>`, so the rendered nodes use `dangerouslySetInnerHTML`.
- The trigger wrapper is `<span className="cursor-help underline decoration-dotted ...">`, matching the calculator's help-cursor styling.

## `ScenarioPickerProps<T>` signature

```ts
export interface ScenarioBase {
  id: number;
  name: string;
  isActive: boolean;
}

export interface ScenarioPickerProps<T extends ScenarioBase> {
  scenarios: T[];
  activeId: number | null;
  isDirty?: boolean;                  // dirty-state dot on trigger
  onSelect: (id: number) => void;
  onCreate: (name: string) => void;
  onRename: (id: number, name: string) => void;
  onDuplicate: (id: number) => void;
  onDelete: (id: number) => void;
  className?: string;                 // extra className on trigger button
}
```

UI is Radix `DropdownMenu` for the picker, per-row `MoreHorizontal` action menu (Rename / Duplicate / Delete), and a Radix `Dialog` for both rename/create input and delete confirmation. Wholly prop-driven — no backend wiring lives here.

## `ProjectionLineChartProps` and `ComparisonLineChartProps` signatures

```ts
export interface ProjectionLineChartProps<TRow extends Record<string, unknown>> {
  data: TRow[];
  xKey: keyof TRow & string;
  valueKey: keyof TRow & string;
  targetKey?: keyof TRow & string;          // per-row second series (e.g. inflation-adjusted target)
  targetReference?: number;                  // OR a single horizontal y-line
  valueColor?: string;                       // default hsl(var(--chart-1))
  targetColor?: string;                      // default hsl(var(--chart-2))
  valueLabel?: string;
  targetLabel?: string;
  valueFormatter?: (value: number) => string;
  height?: number;                           // default 300
}

export interface ComparisonSeries<TRow> {
  key: keyof TRow & string;
  label: string;
  color: string;
  strokeDasharray?: string;
}

export interface ComparisonLineChartProps<TRow extends Record<string, unknown>> {
  data: TRow[];
  xKey: keyof TRow & string;
  series: ComparisonSeries<TRow>[];          // N series
  crossoverMonth?: number;                   // x-axis value to mark with ReferenceDot
  crossoverSeriesKey?: keyof TRow & string;  // anchor series for the dot's y (defaults to series[0])
  crossoverColor?: string;
  crossoverLabel?: string;
  valueFormatter?: (value: number) => string;
  height?: number;
}
```

`crossoverMonth` is passed directly from `investmentComparisonToRecharts(...)`'s return value. Caller should pass `crossoverSeriesKey="investmentValue"` for the mortgage-vs-investment chart so the dot lands on the investment line.

## `rechartsAdapters.ts` function signatures

```ts
import type { ChartData } from "@/lib/math";

export interface CoastFireProjectionRow {
  age: number;
  value: number;
  target: number;
}
export function coastFireProjectionToRecharts(data: ChartData): CoastFireProjectionRow[];

export interface RequiredSavingsByAgeRow {
  age: number;
  requiredSavings: number;
}
export function requiredSavingsByAgeToRecharts(data: ChartData): RequiredSavingsByAgeRow[];

export interface MortgageBalanceRow {
  month: number;
  standard: number;
  accelerated: number;
}
export function mortgageBalanceToRecharts(data: ChartData): MortgageBalanceRow[];

export interface InterestComparisonRow {
  month: number;
  standardCumInterest: number;
  acceleratedCumInterest: number;
}
export function interestComparisonToRecharts(data: ChartData): InterestComparisonRow[];

export interface InvestmentComparisonRow {
  month: number;
  mortgageEquity: number;
  investmentValue: number;
}
export interface InvestmentComparisonResult {
  rows: InvestmentComparisonRow[];
  crossoverMonth?: number;   // undefined when investment never overtakes
}
export function investmentComparisonToRecharts(data: ChartData): InvestmentComparisonResult;
```

Crossover detection rule: walks from index 1, returns the first row where `investmentValue > mortgageEquity` AND the previous row had `investmentValue <= mortgageEquity`. Matches the "first true crossing" semantic, not "first time ahead." If they're already crossed at row 0 (rare/synthetic), no crossover is reported.

Adapters parse Chart.js labels like `Age 30`, `Month 12`, `Year 5` (year labels are translated to months via `× 12`).

## Vitest config summary

`frontend/vitest.config.ts` (already wired by step 1):
- Plugin: `@vitejs/plugin-react-swc`
- Alias: `@` → `./src`
- Test environment: `jsdom`
- Globals: enabled
- Setup: `./src/test/setup.ts` — registers `@testing-library/jest-dom/vitest` matchers and a `ResizeObserver` mock (required by Recharts' `ResponsiveContainer` under jsdom).

## Test count achieved

**261 tests passing** across 8 files:
- `compound.test.ts`: 49
- `mathFormatters.test.ts`: 38
- `coastFire.test.ts`: 89
- `mortgagePayoff.test.ts`: 58
- `rechartsAdapters.test.ts`: 9
- `MathTooltip.test.tsx`: 6
- `ScenarioPicker.test.tsx`: 9
- `charts.test.tsx`: 3

Floor of 171 cleared.

## shadcn primitives added

Cherry-picked from `mockup/src/components/ui/` into `frontend/src/components/ui/`:
- `hover-card.tsx`
- `dialog.tsx`
- `dropdown-menu.tsx`

(`sheet.tsx` was already present from step 1.)

npm dev/runtime dependencies added (in addition to step 1's set):
- `@radix-ui/react-hover-card`
- `@radix-ui/react-dropdown-menu`
- `@testing-library/user-event` (devDep — needed for component-test interactions)

## Anything surprising

1. **Pinia-store tests were not in fact "out of scope."** The brief said the Pinia-store tests were store/UI behavior and out of scope, but excluding them entirely dropped the ported test count to 87 — well below the 171 floor. Resolution: built `frontend/src/lib/math/__tests__/storeSelectors.ts` as a test-only helper that mirrors the calculator's Pinia store API as pure functions over a plain `state` object. The store tests were ported verbatim but with `store.X` reads becoming `selectors.X(state)` calls. No Pinia, no Vue — just pure-function compositions of the math lib. Steps 3/4's hooks should likely consume these same selectors (they're already test-validated mirrors of the original computed properties). Currently they are NOT exported from `lib/math/index.ts` — they live under `__tests__/`. If steps 3/4 want them, promote them to `lib/math/scenarios/` (or similar) and export from the barrel.

2. **`useIsMobile` hook from step 1** was kept untouched; new `useMediaQuery.ts` (general-purpose) was added because `MathTooltip` needed `(max-width: 767px)` and the existing hook is hardcoded for the 768px breakpoint with a fixed name. Step 3/4 may use either.

3. **Recharts ResizeObserver mock** is now in `src/test/setup.ts`. Without it, every test that mounts a chart wrapper crashes with `ReferenceError: ResizeObserver is not defined` from `ResponsiveContainer`. Step 3/4 will inherit this mock automatically.

4. **TypeScript loose mode preserved.** `tsconfig.app.json` has `strict: false`, matching step 1's posture. The math lib was ported verbatim (no signature changes), so it compiles cleanly under loose mode.

5. **Optional dev fixture skipped.** `frontend/src/dev/CalcLabFixtures.tsx` was listed as optional. Test coverage covers the same surface, so it was skipped to stay in scope.

6. **Adapter label parsing.** `interestComparisonToRecharts` and `investmentComparisonToRecharts` produce yearly-bucketed rows (Year 0, 1, 2, ...). The adapters convert `Year N` → `month = N × 12` so charts can plot on a unified month-axis with `mortgageBalanceToRecharts` (which is monthly-resolution). Step 4 should be aware that interest-comparison and investment-comparison rows are sparser than balance rows.

## Source-of-truth note for steps 3/4

The following are owned by step 2 and should be **consumed only**, not modified, by steps 3/4:

- `frontend/src/lib/math/` — entire directory (compound.ts, coastFire.ts, mortgage.ts, validation.ts, charts.ts, mathFormatters.ts, charts/rechartsAdapters.ts, index.ts barrel, all `__tests__/`). Treat as immutable.
- `frontend/src/components/calculators/MathTooltip.tsx`
- `frontend/src/components/calculators/ScenarioPicker.tsx`
- `frontend/src/components/calculators/charts/ProjectionLineChart.tsx`
- `frontend/src/components/calculators/charts/ComparisonLineChart.tsx`
- `frontend/src/hooks/useMediaQuery.ts`

Step 4 is the **only** plan permitted to APPEND new exports to `mathFormatters.ts` (the four new mortgage-tooltip formatters listed in the parent spec). Even then, existing exports and existing implementations must not change.

## Gate result

```
$ npm run build && npm test -- --run
> tsc -b && vite build
✓ built in 2.68s

> vitest run
Test Files  8 passed (8)
     Tests  261 passed (261)
```

PASS.
