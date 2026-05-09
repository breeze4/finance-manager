/**
 * HistoricalView — per-category historical spending stats.
 *
 * Renders a table (avg, median, range, std dev, 80% CI, trend, seasonal
 * months) plus a stacked-area chart of the top 6 categories' month-by-month
 * totals. Pure presentation: parent (`pages/Budget.tsx`) owns the query
 * and passes `stats` in.
 *
 * Edit affordance: each row exposes an Edit column. Clicking it opens an
 * inline year picker (past years derived from `monthlyTotals`) above the
 * chart; choosing a year mounts the SharedBudgetEditor for that
 * `(category, year)` pair. The editor saves via `onSaveBaseline` (provided
 * by the parent tab) and the parent invalidates ["budget"] so analytics
 * refetch.
 *
 * Transforms (`trendCategories`, `monthSet`, `months`, `chartData`) are
 * plain `const` in the render body — data sizes are small and `useMemo`
 * isn't justified.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowRight, Pencil, TrendingDown, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { getBudgets } from "@/api/budget";
import type { BudgetEntry, BudgetState, CategoryHistoricalStats } from "@/api/budget";

import { currentYear, MONTH_NAMES, shortMonth } from "./date-helpers";
import { chartColors, tooltipStyle } from "./chart-style";
import { SharedBudgetEditor } from "./SharedBudgetEditor";

function trendIcon(t: CategoryHistoricalStats["trend"]) {
  if (t === "increasing") return <TrendingUp className="w-4 h-4 text-destructive" />;
  if (t === "decreasing") return <TrendingDown className="w-4 h-4 text-success" />;
  return <ArrowRight className="w-4 h-4 text-muted-foreground" />;
}

/** Past years that appear in this category's monthlyTotals (sorted desc). */
function pastYearsForStat(stat: CategoryHistoricalStats): number[] {
  const years = new Set<number>();
  for (const key of Object.keys(stat.monthlyTotals)) {
    const yr = parseInt(key.slice(0, 4), 10);
    if (!Number.isNaN(yr) && yr < currentYear) years.add(yr);
  }
  return Array.from(years).sort((a, b) => b - a);
}

interface EditingState {
  categoryId: number;
  categoryName: string;
  year: number;
}

interface HistoricalViewProps {
  stats: CategoryHistoricalStats[];
  /** Save handler — parent invokes the budget mutation and invalidates the
   * historical/budget queries. Optional: when omitted, the Edit affordance
   * is hidden (e.g. older callers that haven't wired this up yet). */
  onSaveBaseline?: (
    categoryId: number,
    year: number,
    monthlyAmount: number,
    rolloverMode: boolean,
  ) => void;
}

export function HistoricalView({ stats, onSaveBaseline }: HistoricalViewProps) {
  const [editing, setEditing] = useState<EditingState | null>(null);
  // Per-row local state: which year is currently selected in the row's
  // year-picker (before clicking Edit). Defaults to the most-recent past year.
  const [selectedYearByCategory, setSelectedYearByCategory] = useState<
    Record<number, number>
  >({});

  const editEnabled = onSaveBaseline !== undefined;

  // Top 6 categories by average drive the trend chart.
  const trendCategories = stats.slice(0, 6).map((s) => s.categoryName);

  // Union of months across the top categories' monthly totals, sorted asc.
  const monthSet = new Set<string>();
  for (const s of stats) {
    if (!trendCategories.includes(s.categoryName)) continue;
    Object.keys(s.monthlyTotals).forEach((k) => monthSet.add(k));
  }
  const months = Array.from(monthSet).sort();

  const chartData = months.map((m) => {
    const entry: Record<string, string | number> = { month: shortMonth(m) };
    for (const cat of trendCategories) {
      const stat = stats.find((s) => s.categoryName === cat);
      entry[cat] = stat?.monthlyTotals[m] ?? 0;
    }
    return entry;
  });

  return (
    <>
      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-secondary/50 border-b border-border">
              <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">
                Category
              </th>
              <th className="p-3 text-right text-xs font-medium text-muted-foreground uppercase">
                Avg
              </th>
              <th className="p-3 text-right text-xs font-medium text-muted-foreground uppercase">
                Median
              </th>
              <th className="p-3 text-right text-xs font-medium text-muted-foreground uppercase">
                Range
              </th>
              <th className="p-3 text-right text-xs font-medium text-muted-foreground uppercase">
                Std Dev
              </th>
              <th className="p-3 text-right text-xs font-medium text-muted-foreground uppercase">
                80% CI
              </th>
              <th className="p-3 text-center text-xs font-medium text-muted-foreground uppercase">
                Trend
              </th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">
                Seasonal
              </th>
              {editEnabled && (
                <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Edit baseline
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {stats.map((s, i) => (
              <tr
                key={s.categoryId}
                className={`border-b border-border ${i % 2 === 0 ? "bg-card" : "bg-card/50"}`}
              >
                <td className="p-3 font-medium">{s.categoryName}</td>
                <td className="p-3 text-right font-mono">
                  {formatCurrency(s.monthlyAverage)}
                </td>
                <td className="p-3 text-right font-mono text-muted-foreground">
                  {formatCurrency(s.monthlyMedian)}
                </td>
                <td className="p-3 text-right font-mono text-muted-foreground">
                  {formatCurrency(s.monthlyMin)}–{formatCurrency(s.monthlyMax)}
                </td>
                <td className="p-3 text-right font-mono text-muted-foreground">
                  {formatCurrency(s.stdDev)}
                </td>
                <td className="p-3 text-right font-mono">
                  {formatCurrency(s.confidenceIntervalLow)}–
                  {formatCurrency(s.confidenceIntervalHigh)}
                </td>
                <td className="p-3">
                  <div className="flex items-center justify-center gap-1">
                    {trendIcon(s.trend)}
                    <span className="text-xs capitalize text-muted-foreground">
                      {s.trend}
                    </span>
                  </div>
                </td>
                <td className="p-3">
                  {s.seasonalMonths.length > 0 ? (
                    <div className="flex gap-1 flex-wrap">
                      {s.seasonalMonths.map((mo) => (
                        <Badge key={mo} variant="outline" className="text-xs">
                          {MONTH_NAMES[mo - 1]}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                {editEnabled && (
                  <td className="p-3">
                    {(() => {
                      const pastYears = pastYearsForStat(s);
                      if (pastYears.length === 0) {
                        return (
                          <span className="text-xs text-muted-foreground">
                            no past data
                          </span>
                        );
                      }
                      const selectedYear =
                        selectedYearByCategory[s.categoryId] ?? pastYears[0];
                      return (
                        <div className="flex items-center gap-2">
                          <select
                            value={selectedYear}
                            onChange={(e) =>
                              setSelectedYearByCategory((prev) => ({
                                ...prev,
                                [s.categoryId]: parseInt(e.target.value, 10),
                              }))
                            }
                            aria-label={`Select year to edit for ${s.categoryName}`}
                            className="bg-transparent border border-border rounded px-2 py-1 text-xs"
                          >
                            {pastYears.map((y) => (
                              <option key={y} value={y}>
                                {y}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() =>
                              setEditing({
                                categoryId: s.categoryId,
                                categoryName: s.categoryName,
                                year: selectedYear,
                              })
                            }
                            aria-label={`Edit ${s.categoryName} baseline for ${selectedYear}`}
                            title={`Edit ${s.categoryName} baseline for ${selectedYear}`}
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-secondary/40"
                          >
                            <Pencil className="w-3 h-3" />
                            Edit
                          </button>
                        </div>
                      );
                    })()}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && onSaveBaseline && (
        <EditPanel
          editing={editing}
          onSave={(monthlyAmount, rolloverMode) => {
            onSaveBaseline(editing.categoryId, editing.year, monthlyAmount, rolloverMode);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {chartData.length > 0 && trendCategories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Spending by Category ({months.length} {months.length === 1 ? "month" : "months"})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(225, 15%, 18%)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(220, 10%, 55%)" }} />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(220, 10%, 55%)" }}
                  tickFormatter={(v: number) => formatCurrency(v)}
                />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v: number) => formatCurrency(v)}
                />
                <Legend />
                {trendCategories.map((cat, i) => (
                  <Area
                    key={cat}
                    dataKey={cat}
                    stackId="spending"
                    fill={chartColors[i % chartColors.length]}
                    stroke={chartColors[i % chartColors.length]}
                    isAnimationActive={false}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </>
  );
}

// ─── Edit panel ────────────────────────────────────────────────────────────
//
// Loads the past-year budget for the chosen (category, year) and mounts the
// SharedBudgetEditor in pastYearMode. Past years are fetched on-demand via
// `getBudgets(year)` rather than upfront — most users will edit at most one
// past year per session, and budget rows are tiny.

function EditPanel({
  editing,
  onSave,
  onCancel,
}: {
  editing: EditingState;
  onSave: (monthlyAmount: number, rolloverMode: boolean) => void;
  onCancel: () => void;
}) {
  const budgetsQ = useQuery<BudgetState>({
    queryKey: ["budget", { year: editing.year }],
    queryFn: () => getBudgets(editing.year),
  });

  if (budgetsQ.isLoading) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Loading {editing.year} budget for {editing.categoryName}…
        </CardContent>
      </Card>
    );
  }
  if (budgetsQ.error) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-2">
          <p className="text-sm text-destructive">
            Failed to load {editing.year} budget: {(budgetsQ.error as Error).message}
          </p>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Close
          </Button>
        </CardContent>
      </Card>
    );
  }

  const budgets = budgetsQ.data ?? {};
  const entry: BudgetEntry | undefined = Object.values(budgets).find(
    (b) => b.categoryId === editing.categoryId,
  );

  if (!entry) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-2">
          <p className="text-sm text-muted-foreground">
            No budget row exists for {editing.categoryName} in {editing.year}.
            Saving below will create one.
          </p>
          <SharedBudgetEditor
            categoryId={editing.categoryId}
            year={editing.year}
            categoryName={editing.categoryName}
            initialMonthlyAmount={0}
            initialRolloverMode={false}
            monthlyOverrides={[]}
            onSave={onSave}
            onCancel={onCancel}
            pastYearMode
          />
        </CardContent>
      </Card>
    );
  }

  // Convert overrides Record<"YYYY-MM", number> back to month-keyed list.
  const overrides = Object.entries(entry.monthlyOverrides).map(([key, amount]) => ({
    month: parseInt(key.split("-")[1], 10),
    amount,
  }));

  return (
    <SharedBudgetEditor
      categoryId={editing.categoryId}
      year={editing.year}
      categoryName={editing.categoryName}
      initialMonthlyAmount={entry.baselineMonthly}
      initialRolloverMode={entry.rolloverMode}
      monthlyOverrides={overrides}
      onSave={onSave}
      onCancel={onCancel}
      pastYearMode
    />
  );
}
