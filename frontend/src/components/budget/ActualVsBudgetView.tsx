/**
 * ActualVsBudgetView — Actual vs Budget tab body.
 *
 * Renders the sticky month-selector strip (with per-month variance
 * annotations), the four bucket actuals cards, and a per-bucket variance
 * chart for each non-empty bucket. The math is delegated to the pure
 * functions in `actualVsBudgetViewModel.ts`; this component is mostly
 * layout + sticky positioning. UI state lives one level deeper inside
 * `BudgetVarianceChart` (sort col / dir, expanded rows).
 *
 * Pure presentation: parent (`pages/Budget.tsx`) owns the queries that
 * produce `budgets`, `actual`, and `actualsRollup`, plus the
 * `selectedMonth` state that controls the actuals-rollup refetch.
 */
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ActualVsBudgetResult,
  type BudgetState,
} from "@/api/budget";
import { type ActualsRollup } from "@/api/csp";

import { ActualsBucketCard } from "./ActualsBucketCard";
import { BUCKET_LABEL } from "./bucket-copy";
import { BudgetVarianceChart } from "./BudgetVarianceChart";
import {
  currentMonthKey,
  monthLabel,
  pastAndCurrentMonthsForYear,
} from "./date-helpers";
import { MonthSelector } from "./MonthSelector";
import { formatCurrency } from "@/lib/format";
import {
  buildActualByCatMonth,
  buildBucketSections,
  buildMonthAnnotations,
  buildVarianceRows,
  groupRowsByBucket,
} from "./actualVsBudgetViewModel";

interface ActualVsBudgetViewProps {
  year: number;
  budgets: BudgetState;
  actual: ActualVsBudgetResult;
  /** Selected-month rollup. Refetched whenever the month changes. */
  actualsRollup: ActualsRollup | undefined;
  selectedMonth: string;
  onSelectedMonthChange: (m: string) => void;
  expandedCategoryId?: number | null;
}

export function ActualVsBudgetView({
  year,
  budgets,
  actual,
  actualsRollup,
  selectedMonth,
  onSelectedMonthChange,
  expandedCategoryId,
}: ActualVsBudgetViewProps) {
  const availableMonths = pastAndCurrentMonthsForYear(year);
  const selectedMonthInt = parseInt(selectedMonth.split("-")[1], 10);

  const actualByCatMonth = buildActualByCatMonth(actual);
  const rowsWithBucket = buildVarianceRows(
    budgets,
    actualByCatMonth,
    selectedMonth,
    selectedMonthInt,
  );
  const rowsByBucket = groupRowsByBucket(rowsWithBucket);
  const monthAnnotations = buildMonthAnnotations(availableMonths, actual.monthlyRollups);
  const bucketSections = buildBucketSections(rowsByBucket, actualsRollup);
  const selectedMonthRollup = actual.monthlyRollups.find((r) => r.month === selectedMonthInt);

  const isCurrentMonth = selectedMonth === currentMonthKey;

  return (
    <>
      <div className="sticky top-[52px] z-10 bg-background pb-2 -mx-1 px-1">
        <MonthSelector
          months={availableMonths}
          selected={selectedMonth}
          onChange={onSelectedMonthChange}
          annotations={monthAnnotations}
        />
      </div>

      {isCurrentMonth && (
        <p className="text-xs text-muted-foreground">
          Partial data for the current month ({monthLabel(currentMonthKey)}).
        </p>
      )}

      {selectedMonthRollup && (
        <Card>
          <CardContent className="grid gap-4 pt-5 sm:grid-cols-3">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {monthLabel(selectedMonth)} Budget
              </div>
              <div className="mt-1 font-mono text-2xl font-semibold">
                {formatCurrency(selectedMonthRollup.totalBudgeted)}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Spent So Far
              </div>
              <div className="mt-1 font-mono text-2xl font-semibold">
                {formatCurrency(selectedMonthRollup.totalActual)}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Remaining
              </div>
              <div
                className={`mt-1 font-mono text-2xl font-semibold ${
                  selectedMonthRollup.difference >= 0 ? "text-success" : "text-red-300/80"
                }`}
              >
                {selectedMonthRollup.difference >= 0
                  ? formatCurrency(selectedMonthRollup.difference)
                  : `-${formatCurrency(Math.abs(selectedMonthRollup.difference))}`}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Four-bucket actuals rollup card row. Falls back to a hint when
          the rollup hasn't loaded yet (or there's no net income). */}
      {actualsRollup && actualsRollup.has_net_income ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {actualsRollup.buckets.map((b) => (
            <ActualsBucketCard key={b.bucket} b={b} />
          ))}
        </div>
      ) : actualsRollup ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Set a take-home amount for {monthLabel(selectedMonth)} to see
            bucket tracking against the plan.
          </CardContent>
        </Card>
      ) : null}

      {/* Per-bucket variance charts. */}
      {bucketSections.map(({ bucket, rows: bucketRows, totalBudget, totalActual }) => (
        <Card key={bucket}>
          <CardHeader>
            <div className="flex items-baseline justify-between gap-2">
              <CardTitle className="text-sm font-medium">
                {BUCKET_LABEL[bucket]}
              </CardTitle>
              <span className="text-xs text-muted-foreground font-mono">
                {formatCurrency(totalActual)} of {formatCurrency(totalBudget)}
                {" · "}
                {bucketRows.length} {bucketRows.length === 1 ? "category" : "categories"}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <BudgetVarianceChart
              rows={bucketRows}
              monthKeyStr={selectedMonth}
              expandedCategoryId={expandedCategoryId}
            />
          </CardContent>
        </Card>
      ))}

      {rowsByBucket.other.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Unbucketed</CardTitle>
            <p className="text-[11px] text-muted-foreground">
              These categories have no CSP bucket. Assign one in Categories
              to include them in the rollup.
            </p>
          </CardHeader>
          <CardContent>
            <BudgetVarianceChart
              rows={rowsByBucket.other}
              monthKeyStr={selectedMonth}
              expandedCategoryId={expandedCategoryId}
            />
          </CardContent>
        </Card>
      )}
    </>
  );
}
