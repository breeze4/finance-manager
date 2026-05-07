/**
 * React Query hooks for Coast FIRE scenarios.
 *
 * Exposes `useScenarios`, `useActiveScenario`, `useCreateScenario`,
 * `useUpdateScenario`, `useActivateScenario`, `useDeleteScenario`.
 *
 * Cache keys are kept stable so step 4's mortgage hook can mirror the same
 * shape: a list root, an `active` singleton, and a per-id leaf.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions
} from "@tanstack/react-query";

import {
  ApiError,
  activateScenario,
  createScenario,
  deleteScenario,
  getActiveScenario,
  listScenarios,
  updateScenario,
  type CoastFireScenario,
  type CoastFireScenarioCreate,
  type CoastFireScenarioUpdate
} from "@/api/coastFire";

export const SCENARIOS_KEY = ["coast-fire", "scenarios"] as const;
export const ACTIVE_KEY = ["coast-fire", "scenarios", "active"] as const;
export const ITEM_KEY = (id: number) =>
  ["coast-fire", "scenarios", id] as const;

/**
 * Sensible first-run defaults pulled verbatim from
 * `legacy-vue-calc/src/stores/coastFire.ts`.
 *
 * Used as the starting input state when no active scenario exists. The "Save
 * as scenario" CTA persists these as a new row.
 */
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

export function useScenarios(
  options?: Omit<
    UseQueryOptions<CoastFireScenario[]>,
    "queryKey" | "queryFn"
  >
) {
  return useQuery<CoastFireScenario[]>({
    queryKey: SCENARIOS_KEY,
    queryFn: listScenarios,
    ...options
  });
}

/**
 * Active scenario query.
 *
 * 404 from the backend is treated as "no active scenario yet" — the query
 * resolves to `null` rather than throwing. This keeps the page's first-run
 * path simple: render seeded defaults and a "Save as scenario" CTA.
 */
export function useActiveScenario() {
  return useQuery<CoastFireScenario | null>({
    queryKey: ACTIVE_KEY,
    queryFn: async () => {
      try {
        return await getActiveScenario();
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    retry: (failureCount, err) => {
      if (err instanceof ApiError && err.status === 404) return false;
      return failureCount < 3;
    }
  });
}

export function useCreateScenario(
  options?: UseMutationOptions<CoastFireScenario, Error, CoastFireScenarioCreate>
) {
  const qc = useQueryClient();
  const userOnSuccess = options?.onSuccess;
  return useMutation<CoastFireScenario, Error, CoastFireScenarioCreate>({
    ...options,
    mutationFn: createScenario,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: SCENARIOS_KEY });
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
      return userOnSuccess?.(...args);
    }
  });
}

export interface UpdateScenarioVars {
  id: number;
  payload: CoastFireScenarioUpdate;
}

export function useUpdateScenario(
  options?: UseMutationOptions<CoastFireScenario, Error, UpdateScenarioVars>
) {
  const qc = useQueryClient();
  const userOnSuccess = options?.onSuccess;
  return useMutation<CoastFireScenario, Error, UpdateScenarioVars>({
    ...options,
    mutationFn: ({ id, payload }) => updateScenario(id, payload),
    onSuccess: (...args) => {
      const [, vars] = args;
      qc.invalidateQueries({ queryKey: SCENARIOS_KEY });
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
      qc.invalidateQueries({ queryKey: ITEM_KEY(vars.id) });
      return userOnSuccess?.(...args);
    }
  });
}

export function useActivateScenario(
  options?: UseMutationOptions<CoastFireScenario, Error, number>
) {
  const qc = useQueryClient();
  const userOnSuccess = options?.onSuccess;
  return useMutation<CoastFireScenario, Error, number>({
    ...options,
    mutationFn: (id: number) => activateScenario(id),
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: SCENARIOS_KEY });
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
      return userOnSuccess?.(...args);
    }
  });
}

export function useDeleteScenario(
  options?: UseMutationOptions<void, Error, number>
) {
  const qc = useQueryClient();
  const userOnSuccess = options?.onSuccess;
  return useMutation<void, Error, number>({
    ...options,
    mutationFn: (id: number) => deleteScenario(id),
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: SCENARIOS_KEY });
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
      return userOnSuccess?.(...args);
    }
  });
}
