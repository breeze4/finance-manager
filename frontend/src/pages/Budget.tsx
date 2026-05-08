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
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Lock,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";

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
import {
  CSP_BUCKETS,
  listCategories,
  type CategoryResponse,
  type CspBucket,
} from "@/api/categories";
import {
  getActualsRollup,
  getPlanningRollup,
  type ActualsRollup,
  type BucketRollup,
  type PlanningRollup,
  type TrackingStatus,
} from "@/api/csp";
import { listTransactions, type Transaction } from "@/api/transactions";
import { NetIncomeEditor } from "@/components/NetIncomeEditor";
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

// ─── Set Budget View (CSP planning surface) ────────────────────────────────

const BUCKET_LABEL: Record<CspBucket, string> = {
  fixed: "Fixed Costs",
  investments: "Investments",
  savings: "Savings",
  guilt_free: "Guilt-Free Spending",
};

const BUCKET_DESCRIPTION: Record<CspBucket, string> = {
  fixed: "Rent, utilities, groceries — predictable monthly costs.",
  investments: "401(k), IRA, brokerage — pay your future first.",
  savings: "Emergency fund, gifts, big purchases.",
  guilt_free: "Dining, entertainment, hobbies — spend without guilt.",
};

function bucketRangeLabel(b: BucketRollup): string {
  if (b.ramit_max == null) return `Range: ≥${b.ramit_min}%`;
  return `Range: ${b.ramit_min}–${b.ramit_max}%`;
}

function bucketStatusBadge(b: BucketRollup) {
  if (b.is_open_ended_over) {
    return (
      <Badge variant="outline" className="text-xs border-success/50 text-success">
        <CheckCircle2 className="w-3 h-3 mr-1" /> over (ok)
      </Badge>
    );
  }
  if (b.status === "in-range") {
    return (
      <Badge variant="outline" className="text-xs border-success/50 text-success">
        <CheckCircle2 className="w-3 h-3 mr-1" /> in range
      </Badge>
    );
  }
  if (b.status === "over") {
    return (
      <Badge variant="outline" className="text-xs border-destructive/50 text-destructive">
        <ArrowUp className="w-3 h-3 mr-1" /> over
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs border-yellow-500/50 text-yellow-500">
      <ArrowDown className="w-3 h-3 mr-1" /> under
    </Badge>
  );
}

function BucketDashboardCard({ b }: { b: BucketRollup }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{BUCKET_LABEL[b.bucket]}</CardTitle>
        <p className="text-[11px] text-muted-foreground">{bucketRangeLabel(b)}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-3xl font-mono font-semibold tabular-nums">
            {b.percentage.toFixed(1)}%
          </span>
          <span className="text-xs text-muted-foreground font-mono">
            {formatCurrency(b.numerator)}
          </span>
        </div>
        <div>{bucketStatusBadge(b)}</div>
      </CardContent>
    </Card>
  );
}

// ─── Actuals bucket card (Step 4) ──────────────────────────────────────────
// The Actual vs Budget tab uses a different primary signal than Set Budget:
// it answers "is this month tracking the plan?" rather than "is the plan in
// Ramit's range?" — so the badge variant differs. We reuse BUCKET_LABEL and
// bucketRangeLabel for visual continuity.

function trackingStatusBadge(status: TrackingStatus | null) {
  if (status === "on-track") {
    return (
      <Badge variant="outline" className="text-xs border-success/50 text-success">
        <CheckCircle2 className="w-3 h-3 mr-1" /> on track
      </Badge>
    );
  }
  if (status === "over-plan") {
    return (
      <Badge
        variant="outline"
        className="text-xs border-destructive/50 text-destructive"
      >
        <ArrowUp className="w-3 h-3 mr-1" /> over plan
      </Badge>
    );
  }
  if (status === "under-plan") {
    return (
      <Badge
        variant="outline"
        className="text-xs border-yellow-500/50 text-yellow-500"
      >
        <ArrowDown className="w-3 h-3 mr-1" /> under plan
      </Badge>
    );
  }
  return null;
}

function ActualsBucketCard({ b }: { b: BucketRollup }) {
  // planned_percentage is populated only on the actuals path; default to 0
  // if for some reason it's null so the math doesn't NaN out.
  const planned = b.planned_percentage ?? 0;
  const actual = b.percentage;
  const delta = actual - planned;
  const sign = delta > 0 ? "+" : "";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{BUCKET_LABEL[b.bucket]}</CardTitle>
        <p className="text-[11px] text-muted-foreground">
          target {planned.toFixed(1)}% &middot; actual {actual.toFixed(1)}%
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-3xl font-mono font-semibold tabular-nums">
            {actual.toFixed(1)}%
          </span>
          <span className="text-xs text-muted-foreground font-mono">
            {formatCurrency(b.numerator)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono text-muted-foreground">
            {sign}
            {delta.toFixed(1)} pts
          </span>
          {trackingStatusBadge(b.tracking_status)}
        </div>
      </CardContent>
    </Card>
  );
}

interface SetBudgetViewProps {
  year: number;
  budgets: BudgetState;
  stats: CategoryHistoricalStats[];
  categories: CategoryResponse[];
  rollup: PlanningRollup | undefined;
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
  categories,
  rollup,
  onSetBaseline,
  onSetOverride,
  onClearOverride,
  onSuggest,
  isSuggestPending,
}: SetBudgetViewProps) {
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [collapsedBuckets, setCollapsedBuckets] = useState<Set<CspBucket>>(new Set());

  // Future months for the per-month override selector.
  const futureMonths = allMonthsForYear(year).filter((m) =>
    year > currentYear ? true : m >= currentMonthKey,
  );

  // Fast lookup: category id → CategoryResponse (carries csp_bucket + is_pre_tax).
  const categoryById = useMemo(() => {
    const m = new Map<number, CategoryResponse>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  // Group BudgetEntries by bucket. Categories without a bucket (or excluded)
  // are skipped — the warning banner covers them separately.
  const budgetsByBucket = useMemo(() => {
    const map: Record<CspBucket, BudgetEntry[]> = {
      fixed: [],
      investments: [],
      savings: [],
      guilt_free: [],
    };
    const sorted = Object.values(budgets).sort((a, b) =>
      a.categoryName.localeCompare(b.categoryName),
    );
    for (const entry of sorted) {
      const cat = categoryById.get(entry.categoryId);
      if (!cat || cat.exclude_from_budget) continue;
      if (!cat.csp_bucket) continue;
      map[cat.csp_bucket].push(entry);
    }
    return map;
  }, [budgets, categoryById]);

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

  const toggleBucket = (b: CspBucket) => {
    setCollapsedBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b);
      else next.add(b);
      return next;
    });
  };

  const denominatorTooltip = rollup
    ? `Take-home ${formatCurrency(rollup.take_home ?? 0)} + pre-tax ${formatCurrency(rollup.pre_tax_total)} = ${formatCurrency(rollup.denominator)}`
    : "Set net income to compute the denominator.";

  const showingMonth = selectedMonth !== "all";
  const renderRow = (entry: BudgetEntry) => {
    const cat = categoryById.get(entry.categoryId);
    const stat = stats.find((s) => s.categoryId === entry.categoryId);
    const overrideCount = Object.keys(entry.monthlyOverrides).length;
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
        className="border-b border-border last:border-b-0"
      >
        <td className="p-3 font-medium">
          <span>{entry.categoryName}</span>
          {cat?.is_pre_tax && (
            <Badge variant="outline" className="ml-2 text-[10px]">
              pre-tax
            </Badge>
          )}
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
                setDrafts((d) => ({
                  ...d,
                  [driverKey(entry.categoryId, scope)]: v,
                }));
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
  };

  return (
    <>
      {/* (1) Net income block — wraps the existing self-contained editor. */}
      <div className="space-y-2">
        <NetIncomeEditor />
        {rollup && rollup.has_net_income && (
          <p
            className="text-xs text-muted-foreground"
            title={denominatorTooltip}
          >
            CSP denominator:{" "}
            <span className="font-mono">{formatCurrency(rollup.denominator)}</span>
            {rollup.pre_tax_total > 0 && (
              <>
                {" "}
                <span className="opacity-70">
                  (take-home + {formatCurrency(rollup.pre_tax_total)} pre-tax)
                </span>
              </>
            )}
          </p>
        )}
      </div>

      {/* (2) NULL-bucket warning banner. */}
      {rollup && rollup.unbucketed_categories.length > 0 && (
        <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/5 p-3 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <p className="text-sm font-medium text-yellow-500">
              {rollup.unbucketed_categories.length} categor
              {rollup.unbucketed_categories.length === 1 ? "y" : "ies"} not
              assigned to a CSP bucket
            </p>
            <p className="text-xs text-muted-foreground">
              {rollup.unbucketed_categories.map((c) => c.name).join(", ")} —
              spend in these categories is invisible to the dashboard until
              you pick a bucket.
            </p>
            <Link
              to="/categories"
              className="text-xs text-primary underline-offset-2 hover:underline"
            >
              Fix in Categories →
            </Link>
          </div>
        </div>
      )}

      {/* (3) Four bucket dashboard cards. */}
      {rollup && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {rollup.buckets.map((b) => (
            <BucketDashboardCard key={b.bucket} b={b} />
          ))}
        </div>
      )}

      {/* Month selector + suggest control. */}
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

      {/* (4) Bucket-grouped category list. */}
      <div className="space-y-3">
        {CSP_BUCKETS.map((bucket) => {
          const entries = budgetsByBucket[bucket];
          if (entries.length === 0) return null;
          const collapsed = collapsedBuckets.has(bucket);
          const total = entries.reduce((s, e) => s + e.baselineMonthly, 0);
          return (
            <div
              key={bucket}
              className="rounded-lg border border-border overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggleBucket(bucket)}
                className="w-full flex items-center justify-between gap-3 bg-secondary/50 px-3 py-2 text-left hover:bg-secondary/70 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {collapsed ? (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span className="font-medium text-sm">
                    {BUCKET_LABEL[bucket]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {BUCKET_DESCRIPTION[bucket]}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground font-mono shrink-0">
                  {formatCurrency(total)} · {entries.length} categor
                  {entries.length === 1 ? "y" : "ies"}
                </div>
              </button>
              {!collapsed && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-secondary/20 border-b border-border">
                      <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">
                        Category
                      </th>
                      <th className="p-3 text-right text-xs font-medium text-muted-foreground uppercase">
                        {selectedMonth === "all"
                          ? "Monthly Target"
                          : `${shortMonth(selectedMonth)} Budget`}
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
                  <tbody>{entries.map(renderRow)}</tbody>
                </table>
              )}
            </div>
          );
        })}
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

// Order to render bucket sections in (matches the canonical CSP ordering).
const ACTUAL_BUCKET_ORDER: CspBucket[] = ["fixed", "investments", "savings", "guilt_free"];

interface ActualVsBudgetViewProps {
  year: number;
  budgets: BudgetState;
  actual: ActualVsBudgetResult;
  /** Selected-month rollup. Refetched whenever the month changes. */
  actualsRollup: ActualsRollup | undefined;
  selectedMonth: string;
  onSelectedMonthChange: (m: string) => void;
}

function ActualVsBudgetView({
  year,
  budgets,
  actual,
  actualsRollup,
  selectedMonth,
  onSelectedMonthChange,
}: ActualVsBudgetViewProps) {
  const availableMonths = pastAndCurrentMonthsForYear(year);

  // Index actual entries by (categoryId, month). The entries also carry
  // `cspBucket` and `isPreTax`, which we use below for grouping.
  const actualByCatMonth = useMemo(() => {
    const map = new Map<string, (typeof actual.entries)[number]>();
    for (const e of actual.entries) {
      map.set(`${e.categoryId}-${e.month}`, e);
    }
    return map;
  }, [actual]);

  const selectedMonthInt = parseInt(selectedMonth.split("-")[1], 10);

  // Build a (row, csp_bucket) pair so we can group rows by bucket below.
  const rowsWithBucket: Array<{ row: VarianceRow; bucket: CspBucket | null }> = useMemo(() => {
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
  }, [budgets, actualByCatMonth, selectedMonth, selectedMonthInt]);

  // Group rows by csp_bucket. Categories with no bucket — should be empty
  // for budgeted spending categories, but be defensive — go into "other".
  const rowsByBucket = useMemo(() => {
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
  }, [rowsWithBucket]);

  const isCurrentMonth = selectedMonth === currentMonthKey;

  // Per-month annotations from the rollup totals (the BudgetVarianceChart
  // calls this from its month selector — unchanged from before).
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

  // Sort buckets into display order.
  const orderedBuckets = ACTUAL_BUCKET_ORDER.map((bucket) => {
    const fromRollup = actualsRollup?.buckets.find((b) => b.bucket === bucket);
    return { bucket, rollup: fromRollup, rows: rowsByBucket.groups[bucket] };
  });

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
      {orderedBuckets.map(({ bucket, rows: bucketRows }) => {
        if (bucketRows.length === 0) return null;
        const bucketBudget = bucketRows.reduce((s, r) => s + r.budget, 0);
        const bucketActual = bucketRows.reduce((s, r) => s + r.actual, 0);
        return (
          <Card key={bucket}>
            <CardHeader>
              <div className="flex items-baseline justify-between gap-2">
                <CardTitle className="text-sm font-medium">
                  {BUCKET_LABEL[bucket]}
                </CardTitle>
                <span className="text-xs text-muted-foreground font-mono">
                  {formatCurrency(bucketActual)} of {formatCurrency(bucketBudget)}
                  {" · "}
                  {bucketRows.length} {bucketRows.length === 1 ? "category" : "categories"}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <BudgetVarianceChart rows={bucketRows} monthKeyStr={selectedMonth} />
            </CardContent>
          </Card>
        );
      })}

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
            />
          </CardContent>
        </Card>
      )}
    </>
  );
}

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
          <div className="space-y-6">
            <NetIncomeEditor />
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
