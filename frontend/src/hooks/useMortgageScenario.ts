/**
 * React Query hooks for Mortgage Payoff scenarios.
 *
 * Mirrors `useCoastFireScenario`: a list root, an `active` singleton, and a
 * per-id leaf. 404 on `/active` is swallowed as `null` so the page can show
 * seeded defaults + a "Save as scenario" CTA on first run.
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
  type MortgageScenario,
  type MortgageScenarioCreate,
  type MortgageScenarioUpdate
} from "@/api/mortgage";

export const SCENARIOS_KEY = ["mortgage", "scenarios"] as const;
export const ACTIVE_KEY = ["mortgage", "scenarios", "active"] as const;
export const ITEM_KEY = (id: number) =>
  ["mortgage", "scenarios", id] as const;

/**
 * Sensible first-run defaults pulled verbatim from
 * `legacy-vue-calc/src/stores/mortgagePayoff.ts`.
 *
 * Used as the starting input state when no active scenario exists. The "Save
 * as scenario" CTA persists these as a new row.
 */
export const defaultMortgageScenario: MortgageScenarioCreate = {
  name: "My mortgage plan",
  principal: 300000,
  years_left: 25,
  interest_rate: 4.5,
  monthly_payment: 1500,
  additional_monthly_payment: 0,
  lump_sum_payment: 0,
  investment_return_rate: 7,
  investment_tax_rate: 20
};

export function useScenarios(
  options?: Omit<
    UseQueryOptions<MortgageScenario[]>,
    "queryKey" | "queryFn"
  >
) {
  return useQuery<MortgageScenario[]>({
    queryKey: SCENARIOS_KEY,
    queryFn: listScenarios,
    ...options
  });
}

/**
 * Active scenario query.
 *
 * 404 from the backend is treated as "no active scenario yet" — the query
 * resolves to `null` rather than throwing.
 */
export function useActiveScenario() {
  return useQuery<MortgageScenario | null>({
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
  options?: UseMutationOptions<MortgageScenario, Error, MortgageScenarioCreate>
) {
  const qc = useQueryClient();
  const userOnSuccess = options?.onSuccess;
  return useMutation<MortgageScenario, Error, MortgageScenarioCreate>({
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
  payload: MortgageScenarioUpdate;
}

export function useUpdateScenario(
  options?: UseMutationOptions<MortgageScenario, Error, UpdateScenarioVars>
) {
  const qc = useQueryClient();
  const userOnSuccess = options?.onSuccess;
  return useMutation<MortgageScenario, Error, UpdateScenarioVars>({
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
  options?: UseMutationOptions<MortgageScenario, Error, number>
) {
  const qc = useQueryClient();
  const userOnSuccess = options?.onSuccess;
  return useMutation<MortgageScenario, Error, number>({
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
