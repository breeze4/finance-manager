# Shared Calculator Infrastructure

## Parent spec

`docs/specs/2026-05-06-01-calculator-port.md`

## What to build

The reusable foundation both calculators sit on: pure-function math library, math-tooltip React component, Recharts chart adapter primitives, and a generic scenario-picker UI component (props-driven, no backend wiring yet).

This plan ports the calculator project's `src/utils/math/`, `src/utils/mathFormatters.ts`, and tests into the analyzer's `frontend/src/lib/math/`. It builds a React `MathTooltip` component matching the Vue version's hover/mobile behavior using Radix primitives. It builds Recharts wrapper components that consume the existing chart-data generators via thin adapter functions. It builds a generic `ScenarioPicker` component that takes a list of scenarios and callbacks — Plans 3 and 4 will wire it to API hooks.

Deliverable is testable but not user-facing: math tests pass, MathTooltip renders in a Storybook-less test fixture, chart wrapper renders sample data, scenario picker renders from props.

## Type

AFK

## Blocked by

- Blocked by `2026-05-06-01-frontend-shell-calculator-routes.md`

## User stories addressed

From the parent spec:

- §"Source Project Inventory" — math lib + formatters + tests carried over as-is
- §"MathTooltip port" — React port with Radix hover-card + mobile modal
- §"Charts" — Recharts adapter approach (keep math lib untouched)
- §"Persistence → Multi-scenario model" (UI half only — picker component, no API yet)
- §"Validation & error display" — pure-function validation lib in place

## Acceptance criteria

- [x] All files under `legacy-vue-calc/src/utils/math/` are ported to `frontend/src/lib/math/` with no behavioral changes
- [x] `legacy-vue-calc/src/utils/mathFormatters.ts` ported to `frontend/src/lib/math/formatters.ts` (or kept as `mathFormatters.ts` — match source)
- [x] All tests from `legacy-vue-calc/tests/math/`, `tests/mathFormatters.test.ts`, and the math-exercising portions of `tests/coastFire.test.ts` / `tests/mortgagePayoff.test.ts` are ported and passing under Vitest in `frontend/`. Test count floor: 171 passes.
- [x] `frontend/src/components/calculators/MathTooltip.tsx` renders trigger + content with: formula display, value substitution, step-by-step list, educational explanation
- [x] MathTooltip behaves correctly: desktop hover (Radix `HoverCard`), mobile tap-to-open modal/sheet (Radix `Dialog` or shadcn `Sheet`), help-cursor on trigger
- [x] MathTooltip accepts a template-string content model so calculator pages can pass data dynamically (matches the calculator's `tooltipData` computed pattern)
- [x] Recharts chart wrappers exist:
  - `frontend/src/components/calculators/charts/ProjectionLineChart.tsx` — line + target-line overlay
  - `frontend/src/components/calculators/charts/ComparisonLineChart.tsx` — multi-series with optional crossover annotation
- [x] Chart-data adapter functions: `frontend/src/lib/math/charts/rechartsAdapters.ts` translating the existing Chart.js-shaped output of `generateCoastFireProjectionChart`, `generateBalanceChartData`, `generateInterestComparisonData`, `generateInvestmentComparisonData`, `generateRequiredSavingsByAgeChart` into Recharts-friendly row arrays
- [x] Adapter functions are unit-tested (input shape → output shape)
- [x] `frontend/src/components/calculators/ScenarioPicker.tsx` renders: dropdown of scenario names, "New scenario" action, rename, duplicate, delete. Driven entirely by props (`scenarios`, `activeId`, `onSelect`, `onCreate`, `onRename`, `onDuplicate`, `onDelete`)
- [x] ScenarioPicker has a dirty-state indicator slot (the trigger badge or icon)
- [x] Component tests for MathTooltip (interaction) and ScenarioPicker (prop-driven rendering)
- [x] No imports from `mockup/`, no Vue/Pinia/vue-router code makes it through the port

## Owns

- `frontend/src/lib/math/` — entire directory: `coastFire.ts`, `mortgage.ts`, `compound.ts`, `validation.ts`, `charts.ts`, `formatters.ts` (or `mathFormatters.ts`), `index.ts` barrel
- `frontend/src/lib/math/charts/rechartsAdapters.ts` — adapter layer
- `frontend/src/components/calculators/MathTooltip.tsx`
- `frontend/src/components/calculators/ScenarioPicker.tsx`
- `frontend/src/components/calculators/charts/ProjectionLineChart.tsx`
- `frontend/src/components/calculators/charts/ComparisonLineChart.tsx`
- `frontend/src/lib/math/__tests__/` (or co-located `.test.ts` files matching source convention)
- `frontend/vitest.config.ts` — set up Vitest for the frontend if not already present
- Add new shadcn/Radix primitives to `frontend/src/components/ui/` if needed for tooltip/sheet behavior: `hover-card`, `dialog`, `sheet`, `dropdown-menu`. Cherry-pick from `mockup/src/components/ui/`
- `frontend/package.json` — add deps: `@radix-ui/react-hover-card`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`

## Must not touch

- `frontend/src/pages/CoastFire.tsx`, `frontend/src/pages/Mortgage.tsx` — owned by plans `2026-05-06-03` and `2026-05-06-04` (still placeholder content from plan 1)
- `frontend/src/hooks/useCoastFireScenario.ts`, `useMortgageScenario.ts` — owned by plans `2026-05-06-03` and `2026-05-06-04`
- `frontend/src/api/` — owned by plans `2026-05-06-03` and `2026-05-06-04`
- `backend/` — no backend changes in this plan
- `frontend/src/components/AppSidebar.tsx`, `Layout.tsx`, `TopBar.tsx` — owned by plan 1
- `mockup/` — leave intact

## Defines interfaces

- `MathTooltipProps` in `frontend/src/components/calculators/MathTooltip.tsx` — consumed by plans `2026-05-06-03`, `2026-05-06-04`
- `ScenarioPickerProps<T>` (generic over scenario shape) in `frontend/src/components/calculators/ScenarioPicker.tsx` — consumed by plans `2026-05-06-03`, `2026-05-06-04`
- `ProjectionLineChartProps`, `ComparisonLineChartProps` — consumed by plans `2026-05-06-03`, `2026-05-06-04`
- All exports from `frontend/src/lib/math/index.ts` (math + formatters + adapters) — consumed by plans `2026-05-06-03`, `2026-05-06-04`
- `CoastFireInputs`, `MortgageInputs`, `ValidationResult` types in `frontend/src/lib/math/validation.ts` — consumed by plans `2026-05-06-03`, `2026-05-06-04`

## Pattern exemplar

The math library is being ported wholesale; treat the source as the spec.

- **MUST follow the pattern in**: `../legacy-vue-calc/src/utils/math/` — port file structure, function signatures, JSDoc, and test cases verbatim. Only adapt imports.
- **MUST follow the pattern in**: `../legacy-vue-calc/src/utils/mathFormatters.ts` — port verbatim
- **MUST follow the pattern in**: `../legacy-vue-calc/src/components/MathTooltip.vue` — match behavior (hover desktop, modal mobile, template substitution, help cursor) but reimplement in React
- **Follow the pattern in**: `mockup/src/components/ui/` — shadcn primitive style, file conventions, `cn()` use
- **Follow the pattern in**: `../legacy-vue-calc/tests/math/coastFire.test.ts` — test organization, edge-case coverage style. Vitest API is already used in source.

## Tasks

- [x] Configure Vitest in `frontend/` with jsdom environment (matches calculator project)
- [x] Port `compound.ts`, `validation.ts`, `coastFire.ts`, `mortgage.ts`, `charts.ts`, `index.ts` from calculator → `frontend/src/lib/math/`
- [x] Port `mathFormatters.ts` to `frontend/src/lib/math/formatters.ts` (or keep filename — match calculator)
- [x] Port the math test suite — adjust import paths only, no logic changes
- [x] Run tests; fix only import-related failures. Target: 171-test floor passes
- [x] Cherry-pick shadcn primitives `hover-card`, `dialog`, `sheet`, `dropdown-menu` from `mockup/src/components/ui/`
- [x] Build `MathTooltip.tsx`:
  - Trigger: any child wrapped with help-cursor styling
  - Desktop content: Radix HoverCard with formula header, substituted-values block, step list, explanation
  - Mobile detection: e.g. `useMediaQuery('(max-width: 768px)')`; on mobile, render Sheet/Dialog instead
  - Template substitution helper: takes `{ template: string, values: Record<string, string | number> }` and substitutes `{fieldName}`
- [x] Write component tests for MathTooltip (template substitution; hover open; mobile modal open)
- [x] Build `rechartsAdapters.ts`:
  - `coastFireProjectionToRecharts(data: ChartData) → { age, value, target }[]`
  - `requiredSavingsByAgeToRecharts(data: ChartData) → { age, requiredSavings }[]`
  - `mortgageBalanceToRecharts(data: ChartData) → { month, standard, accelerated }[]`
  - `interestComparisonToRecharts(data) → { month, standardCumInterest, acceleratedCumInterest }[]`
  - `investmentComparisonToRecharts(data) → { month, mortgageEquity, investmentValue }[]` + crossover-month detection
- [x] Write tests for adapters: input is a sample Chart.js-shaped dataset; output array shape matches expectation
- [x] Build `ProjectionLineChart.tsx` (Recharts `LineChart` + reference line for target)
- [x] Build `ComparisonLineChart.tsx` (Recharts `LineChart` with N series; optional `ReferenceDot` for crossover)
- [x] Build `ScenarioPicker.tsx` using shadcn `DropdownMenu`. Generic prop: `scenarios: { id: number; name: string; isActive: boolean }[]`. Actions: select, create, rename, duplicate, delete, with confirm-on-delete via Dialog
- [x] Add dirty-state indicator (badge dot on trigger) controlled by an `isDirty` prop
- [x] Component tests for ScenarioPicker: renders all options, fires expected callbacks
- [ ] Build a small ad-hoc dev fixture page (NOT routed, just a file like `frontend/src/dev/CalcLabFixtures.tsx`) that renders MathTooltip + a chart from sample data, to manually verify before plans 3/4 wire it up. Optional but recommended.

## Implementation notes

- The calculator's `mathFormatters.ts` has 13+ formatting functions. Port all of them verbatim. New formatters listed in the spec for mortgage tooltips (`formatAmortizationSteps`, `formatInvestmentCompoundingSteps`, `formatTaxCalculationSteps`, `formatPayoffComparisonSteps`) are **not** in this plan — Plan 4 adds them. This plan ports only what already exists in source.
- For `useMediaQuery`: build a simple hook in `frontend/src/hooks/useMediaQuery.ts` (or import from a tiny lib if preferred). Don't pull in `react-responsive`.
- Recharts `<ReferenceLine>` handles the Coast FIRE target overlay. Use `dataKey="value"` for the main series and `<ReferenceLine y={target}>` for the horizontal target.
- For the crossover-month annotation in `ComparisonLineChart`, find the index where one series first overtakes another in the adapter, return it alongside the row data, and render `<ReferenceDot>` at that point.
- Series colors: pull from analyzer's 8-color chart palette defined in `frontend/src/index.css` (CSS variables) — passed as props from the calling page, not hardcoded.
- `ScenarioPicker` is generic but for this plan, the scenario type is `{ id: number; name: string; isActive: boolean }`. Plans 3 and 4 may extend with calculator-specific fields if useful.
- Keep `mathFormatters.ts` filename for traceability with source, but if the team prefers `formatters.ts`, decide here and note in the file header.
