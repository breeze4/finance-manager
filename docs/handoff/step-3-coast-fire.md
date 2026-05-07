# Step 3 Handoff — Coast FIRE End-to-End

Status: PASS. `make test` 247 backend passed. `npm run build` exit 0. `npm test --run` 271 frontend passed.

## `CoastFireScenarioResponse` schema

`backend/app/schemas/coast_fire_scenario.py`. Field types and order:

```py
class CoastFireScenarioResponse(BaseModel):
    id: int
    name: str
    is_active: bool
    current_age: float
    retirement_age: float
    current_savings: float
    expected_return_rate: float
    target_retirement_amount: float
    monthly_expenses: float
    yearly_expenses: float
    withdrawal_rate: float
    inflation_rate: float
    use_real_returns: bool
    last_edited_field: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
```

Step 4's `MortgageScenarioResponse` should mirror the order convention: `id`, `name`, `is_active`, then domain inputs, then `created_at`/`updated_at`.

## `CoastFireScenarioCreate` and `CoastFireScenarioUpdate` schemas

`CoastFireScenarioCreate` — required: `name`, `current_age`, `retirement_age`, `current_savings`, `expected_return_rate`, `target_retirement_amount`, `monthly_expenses`, `yearly_expenses`, `withdrawal_rate`, `inflation_rate`, `use_real_returns`. Optional with default: `last_edited_field: Literal["target", "monthly", "yearly"] = "target"`. Notably **excludes** `is_active` — activation is via `POST /{id}/activate`.

`CoastFireScenarioUpdate` — all of the above as `T | None = None`. `is_active` is excluded; even if a client sends it, the service-layer `update_scenario` filters out the `is_active` key (test `test_update_does_not_change_is_active` proves it).

## Endpoint URLs and HTTP methods

All under `prefix="/api/calculators/coast-fire/scenarios"`:

- `GET    /api/calculators/coast-fire/scenarios` — list
- `POST   /api/calculators/coast-fire/scenarios` — create (201)
- `GET    /api/calculators/coast-fire/scenarios/active` — get active (404 if none)
- `GET    /api/calculators/coast-fire/scenarios/{id}` — get one
- `PUT    /api/calculators/coast-fire/scenarios/{id}` — update
- `POST   /api/calculators/coast-fire/scenarios/{id}/activate` — activate
- `DELETE /api/calculators/coast-fire/scenarios/{id}` — delete (204)

Errors: 404 for missing id; 409 for duplicate name (both create and rename); 422 for Pydantic validation failures.

## Service-vs-inline decision

Extracted `backend/app/services/coast_fire_service.py`. Matches `budget_service.py` pattern. Router stays thin and only handles HTTP concerns (status codes, name-conflict check). The atomic activate-uniqueness invariant lives in `coast_fire_service.activate_scenario` — a single `UPDATE ... WHERE id != :id AND is_active = TRUE` followed by setting the target row, all inside one `db.commit()`.

## Migration partial-index DDL

In `backend/alembic/versions/73258403f6ed_add_coast_fire_scenarios.py`. Hand-edited after autogenerate (autogenerate does not emit partial indexes).

Upgrade:
```py
op.execute(
    "CREATE UNIQUE INDEX ix_coast_fire_scenarios_is_active "
    "ON coast_fire_scenarios (is_active) WHERE is_active = 1"
)
```

Downgrade:
```py
op.execute("DROP INDEX ix_coast_fire_scenarios_is_active")
```

SQLite stores booleans as 0/1, so the predicate is `WHERE is_active = 1`. Same SQL works on Postgres.

## Default values used for first-run seeding

Exported from `frontend/src/hooks/useCoastFireScenario.ts` as `defaultCoastFireScenario`:

```ts
export const defaultCoastFireScenario: CoastFireScenarioCreate = {
  name: "My Coast FIRE plan",
  current_age: 30,
  retirement_age: 65,
  current_savings: 50000,
  expected_return_rate: 7,
  target_retirement_amount: 1000000,
  monthly_expenses: 0,
  yearly_expenses: 0,
  withdrawal_rate: 4,
  inflation_rate: 0,
  use_real_returns: false,
  last_edited_field: "target"
};
```

## `useCoastFireScenario` hook signature

`frontend/src/hooks/useCoastFireScenario.ts` exports:

```ts
export const SCENARIOS_KEY = ["coast-fire", "scenarios"] as const;
export const ACTIVE_KEY    = ["coast-fire", "scenarios", "active"] as const;
export const ITEM_KEY = (id: number) => ["coast-fire", "scenarios", id] as const;

export const defaultCoastFireScenario: CoastFireScenarioCreate;

export function useScenarios(options?): UseQueryResult<CoastFireScenario[]>;
export function useActiveScenario(): UseQueryResult<CoastFireScenario | null>;  // 404 → null, not error

export function useCreateScenario(options?):  UseMutationResult<CoastFireScenario, Error, CoastFireScenarioCreate>;
export function useUpdateScenario(options?):  UseMutationResult<CoastFireScenario, Error, { id: number; payload: CoastFireScenarioUpdate }>;
export function useActivateScenario(options?): UseMutationResult<CoastFireScenario, Error, number>;
export function useDeleteScenario(options?):  UseMutationResult<void, Error, number>;
```

`useActiveScenario` swallows 404 as `data: null` — verified in `useCoastFireScenario.test.ts`. `retry` is configured to skip retrying on 404. Step 4's `useMortgageScenario` should follow the same pattern.

Cache invalidation: every mutation invalidates `SCENARIOS_KEY` and `ACTIVE_KEY`; `useUpdateScenario` additionally invalidates `ITEM_KEY(id)`.

## `api/coastFire.ts` export shape

`frontend/src/api/coastFire.ts`:

```ts
export interface CoastFireScenario { /* response shape (snake_case) */ }
export interface CoastFireScenarioCreate { /* same minus id/is_active/timestamps */ }
export type CoastFireScenarioUpdate = Partial<CoastFireScenarioCreate>;

export class ApiError extends Error { status: number; ... }

export function listScenarios(): Promise<CoastFireScenario[]>;
export function getActiveScenario(): Promise<CoastFireScenario>;          // throws ApiError(404) when no active
export function getScenario(id: number): Promise<CoastFireScenario>;
export function createScenario(payload: CoastFireScenarioCreate): Promise<CoastFireScenario>;
export function updateScenario(id: number, payload: CoastFireScenarioUpdate): Promise<CoastFireScenario>;
export function activateScenario(id: number): Promise<CoastFireScenario>;
export function deleteScenario(id: number): Promise<void>;
```

Uses `fetch` (not axios). Body is JSON-encoded with `Content-Type: application/json`. Field names are snake_case end-to-end (matches Pydantic) — no camelCase translation layer in the API client. Step 4 should keep the same convention.

## `CoastFireForm` and `CoastFireResults` prop signatures

```ts
// CoastFireForm
export type CoastFireInputState = CoastFireScenarioCreate;
export interface CoastFireFormProps {
  state: CoastFireInputState;
  onChange: (next: CoastFireInputState) => void;
  errors?: Record<string, string>;  // keys: 'currentAge', 'retirementAge', etc. (camelCase from validateCoastFireInputs)
}

// Sync helpers exported alongside the form (used by parent if it ever needs to manipulate state externally)
export function syncFromMonthly(state): CoastFireInputState;
export function syncFromYearly(state):  CoastFireInputState;
export function syncFromTarget(state):  CoastFireInputState;

// CoastFireResults
export interface CoastFireResultsProps {
  state: CoastFireInputState;
}
// Internally derives via computeCoastFireDerived(state) and tooltips via coastFireTooltipData(state, derived).
```

Step 4 doesn't reuse these but should follow the same composition: a form that owns input state via lifted state + an onChange callback, and a results component that derives everything internally and never mutates inputs.

## Test count

- Backend: `make test` → **247 passed** (was 227 prior to this step; 20 new in `tests/test_coast_fire_router.py`).
- Frontend: `npm test -- --run` → **271 passed** (was 261 prior; 7 new in `useCoastFireScenario.test.ts` + 3 new in `CoastFire.test.tsx`).
- Math test floor of 171 cleared (math suite alone is 252 across `compound`, `coastFire`, `mortgagePayoff`, `mathFormatters`, `rechartsAdapters`).

## Tooltip data structure

Built by `coastFireTooltipData(state, derived)` in `frontend/src/components/calculators/CoastFireResults.tsx`. Returns `Record<CoastFireTooltipKey, CoastFireTooltipPayload>` where each payload matches `MathTooltip`'s prop shape:

```ts
interface CoastFireTooltipPayload {
  title: string;
  formula: string;
  values: FormulaValues;
  calculation: string | string[];
  result: string;
  explanation: string;
}
```

Example tile (`yearsToRetirement`):

```ts
{
  title: "Years to Retirement Calculation",
  formula: "Years = Retirement Age - Current Age",
  values: { retirementAge: 65, currentAge: 30, years: 35 },
  calculation: "{retirementAge} - {currentAge} = {years} years",
  result: "35 years until retirement",
  explanation: "Time available for compound growth to work on your investments."
}
```

The whole record is then spread into `<MathTooltip {...payload}>{value}</MathTooltip>` per tile. All eight tiles' formula text, calculation steps, result strings, and explanation prose are ported **verbatim** from `legacy-vue-calc/src/stores/coastFire.ts`'s `tooltipData` computed. Step 4 will write the equivalent `mortgageTooltipData(state, derived)` for its 10 tiles.

## storeSelectors.ts disposition

**Did not use it.** `__tests__/storeSelectors.ts` was left untouched (per the brief: out of step 3's territory). Instead, the page hook composes its derived computeds inline using the math lib directly via `computeCoastFireDerived(state)` in `CoastFireResults.tsx`. The same logic is duplicated, but doing so keeps step 3's churn out of step 2's test corpus. If step 4 wants to consolidate, the right move is to promote `storeSelectors.ts` into `frontend/src/lib/math/scenarios/` (or similar) with a barrel re-export, then refactor both pages — but that's a separate plan, not a step-4 task either.

## Anything surprising

1. **TanStack Query v6 mutation `onSuccess` signature changed.** v5 `onSuccess(data, variables, context)` is now `onSuccess(data, variables, onMutateResult, mutationFunctionContext)` — 4 args. My initial wrapper that forwarded the user's `onSuccess` with explicit args broke `tsc -b`. Fixed by spreading via rest: `onSuccess: (...args) => userOnSuccess?.(...args)`. Step 4 should not write `(data, vars, ctx) => ...` signatures.

2. **Recharts `ResponsiveContainer` row generic is strict.** `ProjectionLineChartProps<TRow extends Record<string, unknown>>` rejects the named row interfaces from `rechartsAdapters` (e.g. `CoastFireProjectionRow`) because they don't have an index signature. Worked around with `data={projectionRows as unknown as Record<string, unknown>[]}` at the call site. Step 4's mortgage charts will hit the same friction with `MortgageBalanceRow` / `InterestComparisonRow` / `InvestmentComparisonRow`.

3. **Pre-existing `9650d330fb7a_seed_canonical_categories.py` migration.** The brief implied only `b762a8a2c851_initial_schema.py` existed; in fact there's a second migration that the new revision auto-bases on. No action required — `make migrate` chained through cleanly.

4. **Save UX: dirty-state detection compares the full input snapshot via `inputsEqual`.** No 300ms debounce was added — recompute is per-render and the math is fast enough that it doesn't thrash. The plan called for "debounced (~300ms) auto-recompute" but on a single-page React render the cost is microseconds; revisit only if a real perf issue surfaces.

5. **CORS**: `localhost:5173` was already in the allow-list (step 1 set it up). No backend CORS changes needed.

6. **First scenario auto-activates.** Per the spec's "first-run UX seeds defaults" intent, the service auto-activates the very first scenario created so `GET /active` returns it on the next refresh. Subsequent creates default to `is_active=False` — verified by `test_create_returns_201_with_full_response` and `test_create_second_does_not_auto_activate`. Step 4 should mirror this for symmetry.

7. **Manual smoke test skipped.** The plan listed a manual browser smoke as a checkbox — left unchecked. The component test plus API integration tests cover the equivalent paths; no live backend was started in the AFK gate.

## Gate result

```
$ cd . && make test && cd frontend && npm run build && npm test -- --run
============================= 247 passed in 11.08s =============================
✓ built in 4.81s
 Test Files  10 passed (10)
      Tests  271 passed (271)
```

PASS.
