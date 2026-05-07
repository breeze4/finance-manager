/**
 * Budget page. Four tabs (Historical, Set Budget, Actual vs Budget, Flex)
 * driven by `/api/budget/*` plus `/api/transactions` for per-category drilldown.
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
 *   - Flex grouping is derived client-side from historical
 *     `coefficientOfVariation` + `seasonalMonths` (the backend doesn't
 *     classify categories as fixed/flex/non-monthly — see step-8 handoff).
 *   - `targetPeriod` (yearly/monthly) and `unlockedMonths` from the mockup are
 *     dropped: backend stores `monthly_amount` only, so the page is monthly-only.
 */
import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ChevronRight,
  Lock,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  type BudgetEntry,
  type BudgetState,
  type BudgetSuggestion,
  type CategoryHistoricalStats,
} from "@/api/budget";
import { listTransactions, type Transaction } from "@/api/transactions";
import { formatCurrency } from "@/lib/format";

// ─── Date helpers ──────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const today = new Date();
const currentYear = today.getFullYear();
const currentMonthKey = `${currentYear}-${String(today.getMonth() + 1).padStart(2, "0")}`;

function monthKey(year: number, monthIdx1: number): string {
  return `${year}-${String(monthIdx1).padStart(2, "0")}`;
}

function shortMonth(m: string): string {
  return MONTH_NAMES[parseInt(m.split("-")[1], 10) - 1];
}

function monthLabel(m: string): string {
  const [y, mo] = m.split("-");
  return `${MONTH_NAMES[parseInt(mo, 10) - 1]} ${y}`;
}

function allMonthsForYear(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => monthKey(year, i + 1));
}

/** All "YYYY-MM" keys for `year` from January through the current month
 * (inclusive), trimmed to the queried year. For past years, returns the full
 * twelve months. */
function pastAndCurrentMonthsForYear(year: number): string[] {
  if (year < currentYear) return allMonthsForYear(year);
  if (year > currentYear) return [];
  return Array.from({ length: today.getMonth() + 1 }, (_, i) =>
    monthKey(year, i + 1),
  );
}

// ─── Style constants ───────────────────────────────────────────────────────

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "hsl(225, 22%, 11%)",
    border: "1px solid hsl(225, 15%, 18%)",
    borderRadius: 8,
    fontSize: 12,
  },
};

const chartColors = [
  "hsl(220, 70%, 55%)",
  "hsl(173, 58%, 39%)",
  "hsl(280, 60%, 55%)",
  "hsl(45, 90%, 50%)",
  "hsl(350, 70%, 55%)",
  "hsl(150, 60%, 45%)",
];

function progressColor(pct: number): string {
  if (pct > 100) return "bg-destructive";
  if (pct > 75) return "bg-yellow-500";
  return "bg-primary";
}

// ─── Month Selector ────────────────────────────────────────────────────────

interface MonthAnnotation {
  pct: string;
  delta: string;
  color: string;
}

function MonthSelector({
  months,
  selected,
  onChange,
  showAll,
  annotations,
}: {
  months: string[];
  selected: string;
  onChange: (m: string) => void;
  showAll?: boolean;
  annotations?: Record<string, MonthAnnotation>;
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {showAll && (
        <Button
          variant={selected === "all" ? "default" : "outline"}
          size="sm"
          className="text-xs h-7"
          onClick={() => onChange("all")}
        >
          All
        </Button>
      )}
      {months.map((m) => {
        const ann = annotations?.[m];
        return (
          <Button
            key={m}
            variant={m === selected ? "default" : "outline"}
            size="sm"
            className={`text-xs inline-flex items-center gap-1.5 leading-none ${ann ? "h-10 px-2.5" : "h-7"}`}
            onClick={() => onChange(m)}
          >
            <span className="flex items-center gap-1 leading-none">
              {shortMonth(m)}
              {m === currentMonthKey && (
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
              )}
            </span>
            {ann && (
              <span className="flex flex-col items-end gap-px leading-none">
                <span
                  className="text-[9px] font-mono leading-none"
                  style={{ color: ann.color }}
                >
                  {ann.pct}
                </span>
                <span className="text-[9px] font-mono opacity-50 leading-none">
                  {ann.delta}
                </span>
              </span>
            )}
          </Button>
        );
      })}
    </div>
  );
}

// ─── Historical View ───────────────────────────────────────────────────────

function trendIcon(t: CategoryHistoricalStats["trend"]) {
  if (t === "increasing") return <TrendingUp className="w-4 h-4 text-destructive" />;
  if (t === "decreasing") return <TrendingDown className="w-4 h-4 text-success" />;
  return <ArrowRight className="w-4 h-4 text-muted-foreground" />;
}

function HistoricalView({ stats }: { stats: CategoryHistoricalStats[] }) {
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {chartData.length > 0 && trendCategories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Spending by Category ({months.length} {months.length === 1 ? "month" : "months"})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={chartData} margin={{ right: 110 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(225, 15%, 18%)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(220, 10%, 55%)" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(220, 10%, 55%)" }} />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v: number) => formatCurrency(v)}
                />
                {trendCategories.map((cat, i) => (
                  <Bar
                    key={cat}
                    dataKey={cat}
                    stackId="spending"
                    fill={chartColors[i % chartColors.length]}
                    isAnimationActive={false}
                  >
                    <LabelList
                      content={(props) => {
                        const { x, y, width, height, index } =
                          props as Record<string, number>;
                        if (index !== chartData.length - 1) return null;
                        if (!height || height < 14) return null;
                        return (
                          <text
                            x={x + width + 6}
                            y={y + height / 2}
                            fill={chartColors[i % chartColors.length]}
                            fontSize={11}
                            fontWeight={500}
                            dominantBaseline="middle"
                          >
                            {cat}
                          </text>
                        );
                      }}
                    />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </>
  );
}

// ─── Set Budget View ───────────────────────────────────────────────────────

interface SetBudgetViewProps {
  year: number;
  budgets: BudgetState;
  stats: CategoryHistoricalStats[];
  onSetBaseline: (categoryId: number, monthlyAmount: number, rolloverMode: boolean) => void;
  onSetOverride: (categoryId: number, year: number, month: number, amount: number) => void;
  onClearOverride: (categoryId: number, year: number, month: number) => void;
  onSuggest: () => void;
  isSuggestPending: boolean;
}

function SetBudgetView({
  year,
  budgets,
  stats,
  onSetBaseline,
  onSetOverride,
  onClearOverride,
  onSuggest,
  isSuggestPending,
}: SetBudgetViewProps) {
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [drafts, setDrafts] = useState<Record<string, number>>({});

  // Future months for the selector: in the current year, from currentMonthKey
  // forward; in a future year, all twelve.
  const futureMonths = allMonthsForYear(year).filter((m) =>
    year > currentYear ? true : m >= currentMonthKey,
  );

  const categoryNames = Object.keys(budgets).sort();

  const driverKey = (catId: number, scope: string) => `${catId}-${scope}`;
  const draftValue = (catId: number, scope: string, fallback: number): number => {
    const k = driverKey(catId, scope);
    return drafts[k] ?? fallback;
  };

  const commitBaseline = (entry: BudgetEntry, value: number) => {
    if (value === entry.baselineMonthly) return;
    onSetBaseline(entry.categoryId, value, entry.rolloverMode);
  };

  const commitOverride = (entry: BudgetEntry, monthKeyStr: string, value: number) => {
    const month = parseInt(monthKeyStr.split("-")[1], 10);
    onSetOverride(entry.categoryId, year, month, value);
  };

  return (
    <>
      <div className="sticky top-[52px] z-10 bg-background pb-2 -mx-1 px-1 flex items-center justify-between gap-4 flex-wrap">
        <MonthSelector
          months={futureMonths}
          selected={selectedMonth}
          onChange={setSelectedMonth}
          showAll
        />
        <Button
          variant="outline"
          size="sm"
          onClick={onSuggest}
          disabled={isSuggestPending}
        >
          {isSuggestPending ? "Suggesting…" : "Suggest Budgets"}
        </Button>
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-secondary/50 border-b border-border">
              <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">
                Category
              </th>
              <th className="p-3 text-right text-xs font-medium text-muted-foreground uppercase">
                {selectedMonth === "all" ? "Monthly Target" : `${shortMonth(selectedMonth)} Budget`}
              </th>
              <th className="p-3 text-right text-xs font-medium text-muted-foreground uppercase">
                Historical Avg
              </th>
              <th className="p-3 text-center text-xs font-medium text-muted-foreground uppercase">
                Mode
              </th>
              <th className="p-3 text-center text-xs font-medium text-muted-foreground uppercase">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {categoryNames.map((cat, i) => {
              const entry = budgets[cat];
              const stat = stats.find((s) => s.categoryId === entry.categoryId);
              const overrideCount = Object.keys(entry.monthlyOverrides).length;
              const showingMonth = selectedMonth !== "all";
              const overridden =
                showingMonth && entry.monthlyOverrides[selectedMonth] !== undefined;
              const liveBudget = showingMonth
                ? entry.monthlyOverrides[selectedMonth] ?? entry.baselineMonthly
                : entry.baselineMonthly;
              const scope = showingMonth ? selectedMonth : "all";
              const draft = draftValue(entry.categoryId, scope, liveBudget);

              return (
                <tr
                  key={entry.categoryId}
                  className={`border-b border-border ${i % 2 === 0 ? "bg-card" : "bg-card/50"}`}
                >
                  <td className="p-3 font-medium">
                    {cat}
                    {overrideCount > 0 && selectedMonth === "all" && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        {overrideCount} override{overrideCount > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-muted-foreground">$</span>
                      <input
                        type="number"
                        className="w-24 bg-transparent border border-border focus:border-primary rounded px-2 py-1 text-right text-sm font-mono focus:outline-none"
                        value={draft}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value) || 0;
                          setDrafts((d) => ({ ...d, [driverKey(entry.categoryId, scope)]: v }));
                        }}
                        onBlur={() => {
                          const k = driverKey(entry.categoryId, scope);
                          const next = drafts[k];
                          if (next === undefined) return;
                          if (showingMonth) {
                            commitOverride(entry, selectedMonth, next);
                          } else {
                            commitBaseline(entry, next);
                          }
                          setDrafts((d) => {
                            const copy = { ...d };
                            delete copy[k];
                            return copy;
                          });
                        }}
                      />
                      {overridden && (
                        <button
                          onClick={() => {
                            const month = parseInt(selectedMonth.split("-")[1], 10);
                            onClearOverride(entry.categoryId, year, month);
                          }}
                          className="text-muted-foreground hover:text-foreground"
                          title="Clear override"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-right font-mono text-muted-foreground">
                    {stat ? formatCurrency(stat.monthlyAverage) : "—"}
                    <span className="text-xs">/mo</span>
                  </td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() =>
                        onSetBaseline(
                          entry.categoryId,
                          entry.baselineMonthly,
                          !entry.rolloverMode,
                        )
                      }
                      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors ${
                        entry.rolloverMode
                          ? "border-primary/50 bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {entry.rolloverMode ? (
                        <>
                          <RefreshCw className="w-3 h-3" /> Rollover
                        </>
                      ) : (
                        <>
                          <Lock className="w-3 h-3" /> Fixed
                        </>
                      )}
                    </button>
                  </td>
                  <td className="p-3 text-center">
                    {overridden ? (
                      <Badge variant="secondary" className="text-xs">
                        Override
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Default</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── Actual vs Budget View ─────────────────────────────────────────────────

/** Maps budget percentage to bar position with three fixed-width zones:
 *  0–85% → 0–70%, 85–115% → 70–90%, 115%+ → 90–100% (capped). */
function mapToZonePosition(budgetPct: number): number {
  if (budgetPct <= 0) return 0;
  if (budgetPct <= 85) return (budgetPct / 85) * 70;
  if (budgetPct <= 115) return 70 + ((budgetPct - 85) / 30) * 20;
  return Math.min(90 + ((budgetPct - 115) / 35) * 10, 100);
}

type SortColumn = "budget" | "actual" | "pct" | "remaining";
type SortDir = "asc" | "desc";

interface VarianceRow {
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

function getTierColors(pct: number) {
  if (pct < 85)
    return {
      solid: "hsl(173, 40%, 22%)",
      stripe: "hsla(173, 40%, 22%, 0.08)",
      border: "hsla(173, 40%, 22%, 0.2)",
      text: "rgba(255,255,255,0.9)",
    };
  if (pct <= 115)
    return {
      solid: "hsl(45, 90%, 32%)",
      stripe: "hsla(45, 90%, 32%, 0.1)",
      border: "hsla(45, 90%, 32%, 0.25)",
      text: "hsl(35, 60%, 85%)",
    };
  return {
    solid: "hsl(0, 60%, 32%)",
    stripe: "hsla(0, 60%, 32%, 0.08)",
    border: "hsla(0, 60%, 32%, 0.2)",
    text: "rgba(255,255,255,0.9)",
  };
}

function CategoryDrilldown({
  categoryId,
  monthKeyStr,
}: {
  categoryId: number;
  monthKeyStr: string;
}) {
  const [year, mo] = monthKeyStr.split("-").map((p) => parseInt(p, 10));
  // Last day of the queried month.
  const lastDay = new Date(year, mo, 0).getDate();
  const dateFrom = `${year}-${String(mo).padStart(2, "0")}-01`;
  const dateTo = `${year}-${String(mo).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const txnsQ = useQuery<{ items: Transaction[] }>({
    queryKey: ["transactions", "for-budget-drilldown", { categoryId, monthKeyStr }],
    queryFn: () =>
      listTransactions({
        categoryId,
        dateFrom,
        dateTo,
        isTransfer: false,
        pageSize: 200,
        sortBy: "date",
        sortDir: "asc",
      }),
  });

  const txns = txnsQ.data?.items ?? [];
  // Outflows only — actual spend in the chart is the absolute outflow total.
  const outflows = txns.filter((t) => t.amount < 0);

  if (txnsQ.isLoading) {
    return (
      <div className="px-2 py-2 text-[10px] font-mono text-muted-foreground">
        Loading transactions…
      </div>
    );
  }
  if (outflows.length === 0) {
    return (
      <div className="px-2 py-2 text-[10px] font-mono text-muted-foreground">
        No transactions this month.
      </div>
    );
  }

  return (
    <div className="py-1 mb-2 rounded overflow-hidden">
      <div
        className="flex items-center text-[9px] font-mono text-muted-foreground/50 px-2 py-1"
        style={{ backgroundColor: "#151d35" }}
      >
        <div className="w-7 shrink-0" />
        <div className="w-16 shrink-0">Date</div>
        <div className="w-32 shrink-0">Vendor</div>
        <div className="w-20 shrink-0 text-right">Amount</div>
      </div>
      {outflows.map((t, ti) => (
        <div
          key={t.id}
          className="flex items-center text-[10px] font-mono h-5"
          style={{ backgroundColor: ti % 2 === 0 ? "#1a2340" : "#151d35" }}
        >
          <div className="w-7 shrink-0" />
          <div className="w-16 shrink-0 pl-2 text-muted-foreground/50">
            {t.date.slice(5)}
          </div>
          <div className="w-32 shrink-0 text-muted-foreground truncate">
            {t.vendor}
          </div>
          <div className="w-20 shrink-0 text-right text-muted-foreground">
            {formatCurrency(Math.abs(t.amount))}
          </div>
        </div>
      ))}
    </div>
  );
}

function BudgetVarianceChart({
  rows,
  monthKeyStr,
}: {
  rows: VarianceRow[];
  monthKeyStr: string;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [sortCol, setSortCol] = useState<SortColumn>("budget");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (col: SortColumn) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortCol(col);
      setSortDir("desc");
    }
  };

  const toggleExpanded = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sorted = [...rows].sort((a, b) => {
    const mul = sortDir === "asc" ? 1 : -1;
    switch (sortCol) {
      case "budget":
        return (a.budget - b.budget) * mul;
      case "actual":
        return (a.actual - b.actual) * mul;
      case "pct":
        return (a.pct - b.pct) * mul;
      case "remaining":
        return (a.remaining - b.remaining) * mul;
    }
  });

  const allExpanded = rows.length > 0 && rows.every((r) => expanded.has(r.categoryId));

  return (
    <div className="space-y-0.5">
      <div className="flex items-center h-7 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
        <button
          className="w-7 shrink-0 pl-2 flex items-center hover:text-foreground transition-colors cursor-pointer"
          onClick={() =>
            setExpanded(allExpanded ? new Set() : new Set(rows.map((r) => r.categoryId)))
          }
          title={allExpanded ? "Collapse all" : "Expand all"}
        >
          <ChevronRight
            className={`w-3 h-3 transition-transform ${allExpanded ? "rotate-90" : ""}`}
          />
        </button>
        <div className="w-28 shrink-0">Category</div>
        <button
          className="w-24 shrink-0 text-right pr-2 flex items-center justify-end gap-0.5 hover:text-foreground transition-colors cursor-pointer"
          onClick={() => handleSort("budget")}
        >
          Budget
          {sortCol === "budget" &&
            (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
        </button>
        <button
          className="w-20 shrink-0 text-right flex items-center justify-end gap-0.5 hover:text-foreground transition-colors cursor-pointer"
          onClick={() => handleSort("actual")}
        >
          Actual
          {sortCol === "actual" &&
            (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
        </button>
        <button
          className="w-20 shrink-0 text-right pr-2 flex items-center justify-end gap-0.5 hover:text-foreground transition-colors cursor-pointer"
          onClick={() => handleSort("remaining")}
        >
          Remaining
          {sortCol === "remaining" &&
            (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
        </button>
        <button
          className="flex-1 relative flex text-[9px] font-mono text-muted-foreground/40 hover:text-foreground/60 transition-colors cursor-pointer"
          onClick={() => handleSort("pct")}
        >
          <div style={{ width: "70%" }} className="flex items-center justify-center gap-0.5">
            0–85%
            {sortCol === "pct" &&
              (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
          </div>
          <div style={{ width: "20%" }} className="flex items-center justify-center gap-0.5">
            85–115%
          </div>
          <div style={{ width: "10%" }} className="flex items-center justify-center gap-0.5">
            115%+
          </div>
        </button>
      </div>
      {sorted.map((r) => {
        const pct = r.pct;
        const isOver = r.actual > r.budget;
        const tier = getTierColors(pct);
        const isOpen = expanded.has(r.categoryId);

        return (
          <Fragment key={r.categoryId}>
            <div
              className="flex items-center h-9 cursor-pointer hover:bg-secondary/20 rounded transition-colors"
              onClick={() => toggleExpanded(r.categoryId)}
            >
              <div className="w-7 shrink-0 pl-2 flex items-center">
                <ChevronRight
                  className={`w-3 h-3 text-muted-foreground/50 transition-transform ${isOpen ? "rotate-90" : ""}`}
                />
              </div>
              <div className="w-28 shrink-0 text-xs text-muted-foreground truncate flex items-center gap-1">
                {r.category}
                {r.rollover && <RefreshCw className="w-3 h-3 text-primary shrink-0" />}
              </div>
              <div className="w-24 shrink-0 text-right pr-2">
                <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                  {formatCurrency(r.budget)}
                </span>
                {r.carryover !== 0 && (
                  <span
                    className={`text-[9px] ml-0.5 ${r.carryover > 0 ? "text-success" : "text-destructive"}`}
                  >
                    ({r.carryover > 0 ? "+" : ""}
                    {formatCurrency(r.carryover)})
                  </span>
                )}
              </div>
              <div className="w-20 shrink-0 text-right">
                <span className="text-[10px] font-mono whitespace-nowrap">
                  {formatCurrency(r.actual)}
                </span>
              </div>
              <div className="w-20 shrink-0 text-right pr-2">
                <span
                  className={`text-[10px] font-mono whitespace-nowrap ${r.remaining >= 0 ? "text-success" : "text-destructive"}`}
                >
                  {r.remaining >= 0
                    ? formatCurrency(r.remaining)
                    : `-${formatCurrency(Math.abs(r.remaining))}`}
                </span>
              </div>
              <div className="flex-1 h-5 relative">
                <div className="absolute inset-0 flex">
                  <div style={{ width: "70%", backgroundColor: "hsla(173, 40%, 35%, 0.14)" }} />
                  <div style={{ width: "20%", backgroundColor: "hsla(45, 90%, 50%, 0.10)" }} />
                  <div style={{ width: "10%", backgroundColor: "hsla(0, 60%, 50%, 0.10)" }} />
                </div>
                <div
                  className="absolute top-0 bottom-0"
                  style={{ left: "70%", borderLeft: "1px solid hsla(0, 0%, 100%, 0.08)" }}
                />
                <div
                  className="absolute top-0 bottom-0"
                  style={{ left: "90%", borderLeft: "1px solid hsla(0, 0%, 100%, 0.08)" }}
                />
                <div
                  className="absolute top-0 bottom-0"
                  style={{
                    left: `${mapToZonePosition(100)}%`,
                    borderLeft: "1px dashed hsla(0, 0%, 100%, 0.15)",
                  }}
                />
                {!isOver && pct < 100 && (() => {
                  const mappedFill = mapToZonePosition(pct);
                  const mappedBudget = mapToZonePosition(100);
                  return (
                    <div
                      className="absolute top-0 h-full rounded-r-sm"
                      style={{
                        left: `${mappedFill}%`,
                        width: `${mappedBudget - mappedFill}%`,
                        background: `repeating-linear-gradient(-45deg, transparent, transparent 3px, ${tier.stripe} 3px, ${tier.stripe} 6px)`,
                        border: `1px solid ${tier.border}`,
                        borderLeft: "none",
                      }}
                    />
                  );
                })()}
                {(() => {
                  const mappedWidth = mapToZonePosition(pct);
                  return (
                    <div
                      className="absolute left-0 top-0 h-full rounded-sm z-10 flex items-center justify-end overflow-hidden"
                      style={{
                        width: `${Math.min(mappedWidth, 100)}%`,
                        backgroundColor: tier.solid,
                        minWidth: pct > 0 ? 4 : 0,
                      }}
                    >
                      <span
                        className="text-[10px] font-mono px-2 whitespace-nowrap"
                        style={{ color: tier.text }}
                      >
                        {Math.round(pct)}%
                      </span>
                    </div>
                  );
                })()}
              </div>
            </div>

            {isOpen && (
              <CategoryDrilldown categoryId={r.categoryId} monthKeyStr={monthKeyStr} />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

function ActualVsBudgetView({
  year,
  budgets,
  actual,
}: {
  year: number;
  budgets: BudgetState;
  actual: ActualVsBudgetResult;
}) {
  const availableMonths = pastAndCurrentMonthsForYear(year);
  const defaultMonth =
    year === currentYear ? currentMonthKey : availableMonths[availableMonths.length - 1] ?? monthKey(year, 12);
  const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonth);

  // Index actual entries by (categoryId, month).
  const actualByCatMonth = useMemo(() => {
    const map = new Map<string, (typeof actual.entries)[number]>();
    for (const e of actual.entries) {
      map.set(`${e.categoryId}-${e.month}`, e);
    }
    return map;
  }, [actual]);

  const selectedMonthInt = parseInt(selectedMonth.split("-")[1], 10);

  const rows: VarianceRow[] = useMemo(() => {
    return Object.values(budgets).map((entry) => {
      const a = actualByCatMonth.get(`${entry.categoryId}-${selectedMonthInt}`);
      const effective = a?.budgetTarget ?? entry.baselineMonthly;
      const baseBudget =
        entry.monthlyOverrides[selectedMonth] ?? entry.baselineMonthly;
      const carryover = entry.rolloverMode ? effective - baseBudget : 0;
      const actualVal = a?.actualSpend ?? 0;
      const remaining = effective - actualVal;
      const pct = effective > 0 ? (actualVal / effective) * 100 : 0;
      return {
        categoryId: entry.categoryId,
        category: entry.categoryName,
        budget: effective,
        baseBudget,
        carryover,
        actual: actualVal,
        remaining,
        pct,
        rollover: entry.rolloverMode,
      };
    });
  }, [budgets, actualByCatMonth, selectedMonth, selectedMonthInt]);

  const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
  const totalActual = rows.reduce((s, r) => s + r.actual, 0);
  const totalPct = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;
  const isCurrentMonth = selectedMonth === currentMonthKey;

  // Per-month annotations from the rollup totals.
  const rollupByMonth = useMemo(() => {
    const map = new Map<number, (typeof actual.monthlyRollups)[number]>();
    for (const r of actual.monthlyRollups) map.set(r.month, r);
    return map;
  }, [actual]);

  const monthAnnotations: Record<string, MonthAnnotation> = {};
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
    monthAnnotations[m] = {
      pct: `${Math.round(mPct)}%`,
      delta: `${sign}$${Math.abs(Math.round(diff))}`,
      color,
    };
  }

  return (
    <>
      <div className="sticky top-[52px] z-10 bg-background pb-2 -mx-1 px-1">
        <MonthSelector
          months={availableMonths}
          selected={selectedMonth}
          onChange={setSelectedMonth}
          annotations={monthAnnotations}
        />
      </div>

      {isCurrentMonth && (
        <p className="text-xs text-muted-foreground">
          Partial data for the current month ({monthLabel(currentMonthKey)}).
        </p>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              Total: {formatCurrency(totalActual)} of {formatCurrency(totalBudget)}
            </span>
            <span
              className={`text-sm font-bold ${totalPct > 100 ? "text-destructive" : totalPct > 75 ? "text-yellow-500" : "text-success"}`}
            >
              {totalPct.toFixed(0)}%
            </span>
          </div>
          <div className="h-3 rounded-full bg-secondary overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${progressColor(totalPct)}`}
              style={{ width: `${Math.min(totalPct, 100)}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Budget vs Actual — {monthLabel(selectedMonth)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BudgetVarianceChart rows={rows} monthKeyStr={selectedMonth} />
        </CardContent>
      </Card>
    </>
  );
}

// ─── Flex View ─────────────────────────────────────────────────────────────

type FlexBucket = "fixed" | "flexible" | "non-monthly";

interface FlexItem {
  categoryId: number;
  category: string;
  bucket: FlexBucket;
  budgeted: number;
  actual: number;
}

/** Heuristic classifier (backend has no fixed/flex/non-monthly column today):
 *  - non-monthly  ← seasonalMonths.length > 0 (the cost only lands in some months)
 *  - fixed        ← coefficient_of_variation ≤ 0.15 (tight month-to-month)
 *  - flexible     ← otherwise
 *
 * Tracked in `docs/handoff/step-8-budget.md` so the next port can match.
 */
function classifyBucket(stat: CategoryHistoricalStats | undefined): FlexBucket {
  if (!stat) return "flexible";
  if (stat.seasonalMonths.length > 0) return "non-monthly";
  if (stat.coefficientOfVariation <= 0.15) return "fixed";
  return "flexible";
}

function FlexView({
  budgets,
  actual,
  stats,
}: {
  budgets: BudgetState;
  actual: ActualVsBudgetResult;
  stats: CategoryHistoricalStats[];
}) {
  // For "remaining this month", use the current-month rollup totals if the
  // current month is in this year; otherwise use the latest available month.
  const monthInt = today.getMonth() + 1;
  const rollup =
    actual.monthlyRollups.find((r) => r.month === monthInt) ??
    actual.monthlyRollups[actual.monthlyRollups.length - 1];

  // Build per-category items for the current month using the same effective
  // budget the backend computed (rollover already applied).
  const items: FlexItem[] = useMemo(() => {
    const targetMonth = rollup?.month ?? monthInt;
    const byCat = new Map<number, (typeof actual.entries)[number]>();
    for (const e of actual.entries) {
      if (e.month === targetMonth) byCat.set(e.categoryId, e);
    }
    return Object.values(budgets).map((entry) => {
      const e = byCat.get(entry.categoryId);
      const stat = stats.find((s) => s.categoryId === entry.categoryId);
      return {
        categoryId: entry.categoryId,
        category: entry.categoryName,
        bucket: classifyBucket(stat),
        budgeted: e?.budgetTarget ?? entry.baselineMonthly,
        actual: e?.actualSpend ?? 0,
      };
    });
  }, [budgets, actual, stats, rollup, monthInt]);

  const fixed = items.filter((i) => i.bucket === "fixed");
  const flexible = items.filter((i) => i.bucket === "flexible");
  const nonMonthly = items.filter((i) => i.bucket === "non-monthly");

  const fixedTotal = fixed.reduce((s, i) => s + i.actual, 0);
  const flexSpent = flexible.reduce((s, i) => s + i.actual, 0);
  const flexBudget = flexible.reduce((s, i) => s + i.budgeted, 0);
  const remainingFlex = flexBudget - flexSpent;

  const renderBucket = (label: string, description: string, list: FlexItem[]) => {
    const budgeted = list.reduce((s, i) => s + i.budgeted, 0);
    const actualTotal = list.reduce((s, i) => s + i.actual, 0);
    const pct = budgeted > 0 ? (actualTotal / budgeted) * 100 : 0;

    return (
      <Card key={label}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-medium">{label}</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-mono">
                {formatCurrency(actualTotal)}{" "}
                <span className="text-muted-foreground">
                  of {formatCurrency(budgeted)}
                </span>
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${progressColor(pct)}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <div className="space-y-1.5">
            {list.map((item) => (
              <div
                key={item.categoryId}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-muted-foreground">{item.category}</span>
                <span className="font-mono">
                  {formatCurrency(item.actual)}
                  <span className="text-muted-foreground">
                    {" "}
                    / {formatCurrency(item.budgeted)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <>
      <Card className="border-primary/30">
        <CardContent className="pt-6 pb-6 text-center">
          <p className="text-sm text-muted-foreground mb-1">
            Flexible spending remaining this month
          </p>
          <p
            className={`text-4xl font-bold font-mono ${remainingFlex >= 0 ? "text-success" : "text-destructive"}`}
          >
            {formatCurrency(remainingFlex)}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            {formatCurrency(flexBudget)} flexible budget − {formatCurrency(flexSpent)} spent
            {fixedTotal > 0 ? ` (${formatCurrency(fixedTotal)} fixed already paid)` : ""}
          </p>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {fixed.length > 0 &&
          renderBucket("Fixed Expenses", "Predictable, committed costs", fixed)}
        {flexible.length > 0 &&
          renderBucket(
            "Flexible Expenses",
            "Discretionary, adjustable spending",
            flexible,
          )}
        {nonMonthly.length > 0 &&
          renderBucket(
            "Non-Monthly Expenses",
            "Seasonal categories that spike in some months",
            nonMonthly,
          )}
      </div>
    </>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────

export default function Budget() {
  const queryClient = useQueryClient();
  const year = currentYear;

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

  const invalidateBudget = () => {
    queryClient.invalidateQueries({ queryKey: ["budget"] });
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
    budgetsQ.isLoading || historicalQ.isLoading || actualQ.isLoading;
  const error = budgetsQ.error ?? historicalQ.error ?? actualQ.error;

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
  const hasBudgets = Object.keys(budgets).length > 0;

  return (
    <Tabs defaultValue="actual" className="space-y-4">
      <div className="sticky top-0 z-20 bg-background pb-2 -mt-1 pt-1">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="historical">Historical</TabsTrigger>
          <TabsTrigger value="set">Set Budget</TabsTrigger>
          <TabsTrigger value="actual">Actual vs Budget</TabsTrigger>
          <TabsTrigger value="flex">Flex Budget</TabsTrigger>
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
        {hasBudgets ? (
          <SetBudgetView
            year={year}
            budgets={budgets}
            stats={stats}
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
          <ActualVsBudgetView year={year} budgets={budgets} actual={actual} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Set up budgets first to see actual vs target.
          </p>
        )}
      </TabsContent>

      <TabsContent value="flex" className="space-y-6">
        {hasBudgets ? (
          <FlexView budgets={budgets} actual={actual} stats={stats} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Set up budgets first to see the flex view.
          </p>
        )}
      </TabsContent>
    </Tabs>
  );
}
