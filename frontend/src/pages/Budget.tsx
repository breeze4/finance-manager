/**
 * Budget page. Three sub-views (Historical, Set Budget, Actual vs Budget)
 * routed at /budget/{historical,set,actual}. /budget redirects to /budget/actual.
 * Driven by `/api/budget/*`, `/api/csp/*`, and `/api/transactions` for
 * per-category drilldown.
 *
 * Data fetching lives at this layout level; the three child route components
 * (HistoricalTab, SetTab, ActualTab) consume the queries via outlet context
 * so they fetch once and stay in sync as the user moves between sub-views.
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
 * `/api/csp/rollup?mode=actuals&month=YYYY-MM`.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NavLink, Outlet, useOutletContext, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  const [searchParams] = useSearchParams();
  const year = currentYear;
  const requestedMonth = searchParams.get("month");
  const requestedCategory = searchParams.get("category");
  const requestedCategoryId = requestedCategory == null ? NaN : Number(requestedCategory);
  const drilldownCategoryId = Number.isFinite(requestedCategoryId)
    ? requestedCategoryId
    : null;

  // Selected month for the Actual vs Budget tab. Hoisted up to the page so
  // the actuals-rollup query can refetch when the user picks a different
  // month. Default: today's month for the current year, else December of
  // the chosen year.
  const availableMonthsForYear = pastAndCurrentMonthsForYear(year);
  const initialActualMonth =
    requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth)
      ? requestedMonth
      : year === currentYear
      ? currentMonthKey
      : availableMonthsForYear[availableMonthsForYear.length - 1] ?? monthKey(year, 12);
  const [actualSelectedMonth, setActualSelectedMonth] = useState<string>(initialActualMonth);

  useEffect(() => {
    if (requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth)) {
      setActualSelectedMonth(requestedMonth);
    }
  }, [requestedMonth]);

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
  // Actuals rollup keyed on the *selected* month (the user's active month
  // in the Actual vs Budget tab), so the bucket cards refetch when they
  // switch months.
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

  // Year-aware baseline mutation used by Historical for past-year edits.
  // Past-year edits also need the affected year's ["budget", { year: <past> }]
  // cache invalidated so the editor reloads cleanly if reopened.
  const setBaselineForYearMutation = useMutation({
    mutationFn: (vars: {
      categoryId: number;
      year: number;
      monthlyAmount: number;
      rolloverMode: boolean;
    }) =>
      setBudget(vars.categoryId, vars.year, {
        monthlyAmount: vars.monthlyAmount,
        rolloverMode: vars.rolloverMode,
      }),
    onSuccess: () => {
      // Refetch every budget query (any year) plus historical analytics.
      queryClient.invalidateQueries({ queryKey: ["budget"] });
      queryClient.invalidateQueries({ queryKey: ["csp", "planning", currentMonthKey] });
      queryClient.invalidateQueries({ queryKey: ["csp", "actuals", actualSelectedMonth] });
    },
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

  const outletContext: BudgetOutletContext = {
    year,
    budgets,
    stats,
    categories,
    rollup,
    actual,
    actualsRollup,
    actualSelectedMonth,
    setActualSelectedMonth,
    drilldownCategoryId,
    hasBudgets,
    setBaseline: (categoryId, monthlyAmount, rolloverMode) =>
      setBaselineMutation.mutate({ categoryId, monthlyAmount, rolloverMode }),
    setBaselineForYear: (categoryId, y, monthlyAmount, rolloverMode) =>
      setBaselineForYearMutation.mutate({
        categoryId,
        year: y,
        monthlyAmount,
        rolloverMode,
      }),
    setOverride: (categoryId, y, month, amount) =>
      setOverrideMutation.mutate({ categoryId, year: y, month, amount }),
    clearOverride: (categoryId, y, month) =>
      clearOverrideMutation.mutate({ categoryId, year: y, month }),
    suggest: () => suggestMutation.mutate(),
    isSuggestPending: suggestMutation.isPending,
    suggestError: (suggestMutation.error as Error | null) ?? null,
  };

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 bg-background pb-2 -mt-1 pt-1">
        <nav
          aria-label="Budget sub-navigation"
          className="grid h-10 w-full grid-cols-3 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground"
        >
          <BudgetSubNavLink to="historical">Historical</BudgetSubNavLink>
          <BudgetSubNavLink to="set">Set Budget</BudgetSubNavLink>
          <BudgetSubNavLink to="actual">Actual vs Budget</BudgetSubNavLink>
        </nav>
      </div>

      <Outlet context={outletContext} />
    </div>
  );
}

// ─── Sub-nav link (mirrors TabsTrigger styling) ────────────────────────────

const SUB_NAV_BASE =
  "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const SUB_NAV_ACTIVE = "bg-background text-foreground shadow-sm";

function BudgetSubNavLink({
  to,
  children,
}: {
  to: string;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => cn(SUB_NAV_BASE, isActive && SUB_NAV_ACTIVE)}
    >
      {children}
    </NavLink>
  );
}

// ─── Outlet context + child route components ───────────────────────────────

interface BudgetOutletContext {
  year: number;
  budgets: BudgetState;
  stats: CategoryHistoricalStats[];
  categories: CategoryResponse[];
  rollup: PlanningRollup | undefined;
  actual: ActualVsBudgetResult;
  actualsRollup: ActualsRollup | undefined;
  actualSelectedMonth: string;
  setActualSelectedMonth: (m: string) => void;
  drilldownCategoryId: number | null;
  hasBudgets: boolean;
  setBaseline: (categoryId: number, monthlyAmount: number, rolloverMode: boolean) => void;
  /** Year-aware baseline write for past-year edits invoked from HistoricalView. */
  setBaselineForYear: (
    categoryId: number,
    year: number,
    monthlyAmount: number,
    rolloverMode: boolean,
  ) => void;
  setOverride: (categoryId: number, year: number, month: number, amount: number) => void;
  clearOverride: (categoryId: number, year: number, month: number) => void;
  suggest: () => void;
  isSuggestPending: boolean;
  suggestError: Error | null;
}

function useBudgetContext(): BudgetOutletContext {
  return useOutletContext<BudgetOutletContext>();
}

export function HistoricalTab() {
  const { stats, setBaselineForYear } = useBudgetContext();
  return (
    <div className="space-y-6">
      {stats.length > 0 ? (
        <HistoricalView stats={stats} onSaveBaseline={setBaselineForYear} />
      ) : (
        <p className="text-sm text-muted-foreground">
          No historical spending yet. Import some transactions to see stats.
        </p>
      )}
    </div>
  );
}

export function SetTab() {
  const {
    year,
    budgets,
    stats,
    categories,
    rollup,
    hasBudgets,
    setBaseline,
    setOverride,
    clearOverride,
    suggest,
    isSuggestPending,
    suggestError,
  } = useBudgetContext();
  return (
    <div className="space-y-6">
      {suggestError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          Suggest failed: {suggestError.message}
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
          onSetBaseline={setBaseline}
          onSetOverride={setOverride}
          onClearOverride={clearOverride}
          onSuggest={suggest}
          isSuggestPending={isSuggestPending}
        />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            No budgets set yet. Click below to seed budgets from historical averages.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={suggest}
            disabled={isSuggestPending || stats.length === 0}
          >
            {isSuggestPending ? "Suggesting…" : "Suggest Budgets"}
          </Button>
        </div>
      )}
    </div>
  );
}

export function ActualTab() {
  const {
    year,
    budgets,
    actual,
    actualsRollup,
    actualSelectedMonth,
    setActualSelectedMonth,
    drilldownCategoryId,
    hasBudgets,
  } = useBudgetContext();
  return (
    <div className="space-y-6">
      {hasBudgets ? (
        <ActualVsBudgetView
          year={year}
          budgets={budgets}
          actual={actual}
          actualsRollup={actualsRollup}
          selectedMonth={actualSelectedMonth}
          onSelectedMonthChange={setActualSelectedMonth}
          expandedCategoryId={drilldownCategoryId}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Set up budgets first to see actual vs target.
        </p>
      )}
    </div>
  );
}
