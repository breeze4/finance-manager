/**
 * Pure view-model transforms for the Actual-vs-Budget tab.
 *
 * No React, hooks, JSX, recharts, react-query, or network imports — these
 * functions take fully-resolved query results and produce shapes the
 * `ActualVsBudgetView` component renders. The split exists so the math
 * is unit-testable in isolation: see `__tests__/actualVsBudgetViewModel.test.ts`.
 *
 * Behavior matches the inline transforms that previously lived inside
 * `ActualVsBudgetView` — these functions read what the backend returns
 * (`budget_target` already has rollover applied per Step 5); they do NOT
 * re-compute rollover.
 */
import type {
  ActualVsBudgetEntry,
  ActualVsBudgetResult,
  BudgetState,
} from "@/api/budget";
import type { ActualsRollup, BucketRollup } from "@/api/csp";
import { CSP_BUCKETS, type CspBucket } from "@/api/categories";
import type { MonthAnnotation } from "@/components/budget/MonthSelector";

export interface VarianceRow {
  categoryId: number;
  category: string;
  budget: number;
  baseBudget: number;
  carryover: number;
  actual: number;
  remaining: number;
  pct: number;
  rollover: boolean;
}

export interface RowsByBucket {
  groups: Record<CspBucket, VarianceRow[]>;
  other: VarianceRow[];
}

export interface BucketSection {
  bucket: CspBucket;
  rollup: BucketRollup | undefined;
  rows: VarianceRow[];
  totalBudget: number;
  totalActual: number;
}

/**
 * Index actual entries by `${categoryId}-${month}` so per-row lookups in
 * `buildVarianceRows` are O(1).
 */
export function buildActualByCatMonth(
  actual: ActualVsBudgetResult,
): Map<string, ActualVsBudgetEntry> {
  const map = new Map<string, ActualVsBudgetEntry>();
  for (const e of actual.entries) {
    map.set(`${e.categoryId}-${e.month}`, e);
  }
  return map;
}

/**
 * Build one variance row per budgeted category for the given month, paired
 * with its CSP bucket (or null) so the caller can group.
 *
 * `selectedMonth` is the "YYYY-MM" key (used to look up `monthlyOverrides`).
 * `selectedMonthInt` is the numeric month (1-12) — used to look up actuals
 * entries (which the backend keys by month number, not month-string). The
 * view component does the parse itself: see the call site in
 * `ActualVsBudgetView.tsx`.
 */
export function buildVarianceRows(
  budgets: BudgetState,
  actualByCatMonth: Map<string, ActualVsBudgetEntry>,
  selectedMonth: string,
  selectedMonthInt: number,
): Array<{ row: VarianceRow; bucket: CspBucket | null }> {
  return Object.values(budgets).map((entry) => {
    const a = actualByCatMonth.get(`${entry.categoryId}-${selectedMonthInt}`);
    const effective = a?.budgetTarget ?? entry.baselineMonthly;
    const baseBudget =
      entry.monthlyOverrides[selectedMonth] ?? entry.baselineMonthly;
    const carryover = entry.rolloverMode ? effective - baseBudget : 0;
    const actualVal = a?.actualSpend ?? 0;
    const remaining = effective - actualVal;
    const pct = effective > 0 ? (actualVal / effective) * 100 : 0;
    const bucket = (a?.cspBucket as CspBucket | null | undefined) ?? null;
    return {
      row: {
        categoryId: entry.categoryId,
        category: entry.categoryName,
        budget: effective,
        baseBudget,
        carryover,
        actual: actualVal,
        remaining,
        pct,
        rollover: entry.rolloverMode,
      },
      bucket,
    };
  });
}

/**
 * Group variance rows by CSP bucket. Rows whose entry has no `cspBucket`
 * land in `other`. Bucket order in the resulting `groups` record follows
 * the canonical `CSP_BUCKETS` order (fixed, investments, savings,
 * guilt_free).
 */
export function groupRowsByBucket(
  rowsWithBucket: Array<{ row: VarianceRow; bucket: CspBucket | null }>,
): RowsByBucket {
  const groups: Record<CspBucket, VarianceRow[]> = {
    fixed: [],
    investments: [],
    savings: [],
    guilt_free: [],
  };
  const other: VarianceRow[] = [];
  for (const { row, bucket } of rowsWithBucket) {
    if (bucket && bucket in groups) groups[bucket as CspBucket].push(row);
    else other.push(row);
  }
  return { groups, other };
}

/**
 * Build per-month annotations for the month-selector strip. Annotation =
 * pct + signed dollar delta + threshold-based color. Months with no rollup
 * entry are absent from the result (no annotation).
 */
export function buildMonthAnnotations(
  availableMonths: string[],
  monthlyRollups: ActualVsBudgetResult["monthlyRollups"],
): Record<string, MonthAnnotation> {
  const rollupByMonth = new Map<number, ActualVsBudgetResult["monthlyRollups"][number]>();
  for (const r of monthlyRollups) rollupByMonth.set(r.month, r);

  const out: Record<string, MonthAnnotation> = {};
  for (const m of availableMonths) {
    const mInt = parseInt(m.split("-")[1], 10);
    const r = rollupByMonth.get(mInt);
    if (!r) continue;
    const mPct = r.percentage;
    const diff = r.totalActual - r.totalBudgeted;
    const color =
      mPct < 85
        ? "hsl(173, 40%, 50%)"
        : mPct <= 115
          ? "hsl(45, 90%, 50%)"
          : "hsl(0, 60%, 50%)";
    const sign = diff >= 0 ? "+" : "-";
    out[m] = {
      pct: `${Math.round(mPct)}%`,
      delta: `${sign}$${Math.abs(Math.round(diff))}`,
      color,
    };
  }
  return out;
}

/**
 * Assemble the per-bucket sections for the variance-charts area. Buckets
 * with no rows are omitted so the JSX caller can `.map(...)` without an
 * inline filter.
 */
export function buildBucketSections(
  rowsByBucket: RowsByBucket,
  actualsRollup: ActualsRollup | undefined,
): BucketSection[] {
  const out: BucketSection[] = [];
  for (const bucket of CSP_BUCKETS) {
    const rows = rowsByBucket.groups[bucket];
    if (rows.length === 0) continue;
    const rollup = actualsRollup?.buckets.find((b) => b.bucket === bucket);
    const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
    const totalActual = rows.reduce((s, r) => s + r.actual, 0);
    out.push({ bucket, rollup, rows, totalBudget, totalActual });
  }
  return out;
}
