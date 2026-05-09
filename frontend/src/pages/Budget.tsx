/**
 * Budget page. Three tabs (Historical, Set Budget, Actual vs Budget) driven
 * by `/api/budget/*`, `/api/csp/*`, and `/api/transactions` for per-category
 * drilldown.
 *
 * Set Budget is the Conscious Spending Plan surface: net-income block at top,
 * four bucket dashboard cards (Ramit ranges + status), then a bucket-grouped
 * category list with inline editable baselines, override badges, and rollover
 * toggles. Live percentages come from `/api/csp/rollup?mode=planning`; edits
 * invalidate both ["budget"] and ["csp", "planning", monthKey] so the cards
 * reflect changes immediately.
 *
 * Actual vs Budget mirrors the Set Budget layout for the active month:
 * four bucket cards across the top (each showing target % from the plan
 * vs actual %, with a tracking-status badge), then per-bucket variance
 * charts under bucket headers. The rollup data comes from
 * `/api/csp/rollup?mode=actuals&month=YYYY-MM`. The bucket-card visuals
 * (`BucketDashboardCard`, `bucketStatusBadge`, `BUCKET_LABEL`) are
 * shared with Set Budget — Step 4 added the actuals-tracking variant.
 *
 * Differences from `mockup/src/pages/Budget.tsx`:
 *   - Stats come from `getHistorical()`; the mockup's client-side `computeStats`
 *     is dropped.
 *   - `currentMonth` / `pastMonths` / `allMonths2026` are derived from today's
 *     date and the year being viewed instead of being hard-coded constants.
 *   - Actual-vs-Budget reads effective budgets and actuals from the backend
 *     (`getActualVsBudget`) — rollover math is server-side.
 *   - Suggest Budgets calls `getSuggestions(year)` then fires the appropriate
 *     mutations (one `setBudget` for baseline, plus `setMonthlyOverride` for
 *     each seasonal-spike month). Invalidates `["budget"]` to refetch.
 *   - Per-category transaction drilldown queries `listTransactions` filtered by
 *     `categoryId` + month range; no client-side fake-transaction generator.
 *   - `targetPeriod` (yearly/monthly) and `unlockedMonths` from the mockup are
 *     dropped: backend stores `monthly_amount` only, so the page is monthly-only.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  deleteMonthlyOverride,
  getActualVsBudget,
  getBudgets,
  getHistorical,
  getSuggestions,
  setBudget,
  setMonthlyOverride,
  type ActualVsBudgetResult,
  type BudgetState,
  type CategoryHistoricalStats,
} from "@/api/budget";
import {
  listCategories,
  type CategoryResponse,
} from "@/api/categories";
import {
  getActualsRollup,
  getPlanningRollup,
  type ActualsRollup,
  type PlanningRollup,
} from "@/api/csp";
import { NetIncomeEditor } from "@/components/NetIncomeEditor";
import { ActualVsBudgetView } from "@/components/budget/ActualVsBudgetView";
import {
  currentMonthKey,
  currentYear,
  monthKey,
  pastAndCurrentMonthsForYear,
} from "@/components/budget/date-helpers";
import { HistoricalView } from "@/components/budget/HistoricalView";
import { SetBudgetView } from "@/components/budget/SetBudgetView";

// ─── Main page ─────────────────────────────────────────────────────────────

export default function Budget() {
  const queryClient = useQueryClient();
  const year = currentYear;

  // Selected month for the Actual vs Budget tab. Hoisted up to the page so
  // the actuals-rollup query can refetch when the user picks a different
  // month. Default: today's month for the current year, else December of
  // the chosen year.
  const availableMonthsForYear = pastAndCurrentMonthsForYear(year);
  const initialActualMonth =
    year === currentYear
      ? currentMonthKey
      : availableMonthsForYear[availableMonthsForYear.length - 1] ?? monthKey(year, 12);
  const [actualSelectedMonth, setActualSelectedMonth] = useState<string>(initialActualMonth);

  const budgetsQ = useQuery<BudgetState>({
    queryKey: ["budget", { year }],
    queryFn: () => getBudgets(year),
  });
  const historicalQ = useQuery<CategoryHistoricalStats[]>({
    queryKey: ["budget", "historical"],
    queryFn: () => getHistorical(),
  });
  const actualQ = useQuery<ActualVsBudgetResult>({
    queryKey: ["budget", "actual", { year }],
    queryFn: () => getActualVsBudget(year),
  });
  const categoriesQ = useQuery<CategoryResponse[]>({
    queryKey: ["categories"],
    queryFn: listCategories,
  });
  const rollupQ = useQuery<PlanningRollup>({
    queryKey: ["csp", "planning", currentMonthKey],
    queryFn: () => getPlanningRollup(currentMonthKey),
  });
  // Step 4: actuals rollup keyed on the *selected* month (the user's
  // active month in the Actual vs Budget tab), so the bucket cards
  // refetch when they switch months.
  const actualsRollupQ = useQuery<ActualsRollup>({
    queryKey: ["csp", "actuals", actualSelectedMonth],
    queryFn: () => getActualsRollup(actualSelectedMonth),
  });

  const invalidateBudget = () => {
    queryClient.invalidateQueries({ queryKey: ["budget"] });
    // Bucket cards must reflect the new baseline math live.
    queryClient.invalidateQueries({ queryKey: ["csp", "planning", currentMonthKey] });
    queryClient.invalidateQueries({ queryKey: ["csp", "actuals", actualSelectedMonth] });
  };

  const setBaselineMutation = useMutation({
    mutationFn: (vars: { categoryId: number; monthlyAmount: number; rolloverMode: boolean }) =>
      setBudget(vars.categoryId, year, {
        monthlyAmount: vars.monthlyAmount,
        rolloverMode: vars.rolloverMode,
      }),
    onSuccess: invalidateBudget,
  });

  const setOverrideMutation = useMutation({
    mutationFn: (vars: { categoryId: number; year: number; month: number; amount: number }) =>
      setMonthlyOverride(vars.categoryId, vars.year, vars.month, vars.amount),
    onSuccess: invalidateBudget,
  });

  const clearOverrideMutation = useMutation({
    mutationFn: (vars: { categoryId: number; year: number; month: number }) =>
      deleteMonthlyOverride(vars.categoryId, vars.year, vars.month),
    onSuccess: invalidateBudget,
  });

  const suggestMutation = useMutation({
    mutationFn: async () => {
      const suggestions = await getSuggestions(year);
      const budgets = budgetsQ.data ?? {};
      // Two phases: baselines first (creating any missing budget rows), then
      // monthly overrides. The override endpoint 404s if the budget row does
      // not exist yet, so racing both in one Promise.all is unsafe.
      const baselineTasks: Promise<unknown>[] = [];
      const overrideTasks: Array<() => Promise<unknown>> = [];
      for (const s of suggestions) {
        const existing = Object.values(budgets).find(
          (b) => b.categoryId === s.categoryId,
        );
        const rolloverMode = existing?.rolloverMode ?? false;
        baselineTasks.push(
          setBudget(s.categoryId, year, {
            monthlyAmount: s.baselineMonthly,
            rolloverMode,
          }),
        );
        for (const [moStr, amt] of Object.entries(s.monthlySuggestions)) {
          const mo = Number(moStr);
          if (Math.abs(amt - s.baselineMonthly) < 0.01) continue;
          overrideTasks.push(() => setMonthlyOverride(s.categoryId, year, mo, amt));
        }
      }
      await Promise.all(baselineTasks);
      await Promise.all(overrideTasks.map((t) => t()));
    },
    onSuccess: invalidateBudget,
  });

  const isLoading =
    budgetsQ.isLoading ||
    historicalQ.isLoading ||
    actualQ.isLoading ||
    categoriesQ.isLoading;
  const error =
    budgetsQ.error ??
    historicalQ.error ??
    actualQ.error ??
    categoriesQ.error;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading budget…</p>;
  }
  if (error) {
    return (
      <p className="text-sm text-destructive">
        Failed to load budget: {(error as Error).message}
      </p>
    );
  }

  const budgets = budgetsQ.data ?? {};
  const stats = historicalQ.data ?? [];
  const actual = actualQ.data ?? { entries: [], monthlyRollups: [] };
  const categories = categoriesQ.data ?? [];
  const rollup = rollupQ.data;
  const actualsRollup = actualsRollupQ.data;
  const hasBudgets = Object.keys(budgets).length > 0;

  return (
    <Tabs defaultValue="actual" className="space-y-4">
      <div className="sticky top-0 z-20 bg-background pb-2 -mt-1 pt-1">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="historical">Historical</TabsTrigger>
          <TabsTrigger value="set">Set Budget</TabsTrigger>
          <TabsTrigger value="actual">Actual vs Budget</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="historical" className="space-y-6">
        {stats.length > 0 ? (
          <HistoricalView stats={stats} />
        ) : (
          <p className="text-sm text-muted-foreground">
            No historical spending yet. Import some transactions to see stats.
          </p>
        )}
      </TabsContent>

      <TabsContent value="set" className="space-y-6">
        {suggestMutation.error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            Suggest failed: {(suggestMutation.error as Error).message}
          </div>
        ) : null}
        <NetIncomeEditor />
        {hasBudgets ? (
          <SetBudgetView
            year={year}
            budgets={budgets}
            stats={stats}
            categories={categories}
            rollup={rollup}
            onSetBaseline={(categoryId, monthlyAmount, rolloverMode) =>
              setBaselineMutation.mutate({ categoryId, monthlyAmount, rolloverMode })
            }
            onSetOverride={(categoryId, y, month, amount) =>
              setOverrideMutation.mutate({ categoryId, year: y, month, amount })
            }
            onClearOverride={(categoryId, y, month) =>
              clearOverrideMutation.mutate({ categoryId, year: y, month })
            }
            onSuggest={() => suggestMutation.mutate()}
            isSuggestPending={suggestMutation.isPending}
          />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              No budgets set yet. Click below to seed budgets from historical averages.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => suggestMutation.mutate()}
              disabled={suggestMutation.isPending || stats.length === 0}
            >
              {suggestMutation.isPending ? "Suggesting…" : "Suggest Budgets"}
            </Button>
          </div>
        )}
      </TabsContent>

      <TabsContent value="actual" className="space-y-6">
        {hasBudgets ? (
          <ActualVsBudgetView
            year={year}
            budgets={budgets}
            actual={actual}
            actualsRollup={actualsRollup}
            selectedMonth={actualSelectedMonth}
            onSelectedMonthChange={setActualSelectedMonth}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Set up budgets first to see actual vs target.
          </p>
        )}
      </TabsContent>
    </Tabs>
  );
}
