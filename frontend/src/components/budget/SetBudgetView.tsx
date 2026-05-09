/**
 * SetBudgetView — Conscious Spending Plan planning surface.
 *
 * Bucket-grouped baseline + per-month-override editor. Renders an optional
 * CSP-denominator note (when the parent has a `rollup`), a NULL-bucket
 * warning banner for unbucketed categories, four bucket dashboard cards,
 * a sticky month selector + suggest control, and a bucket-grouped category
 * table with inline-editable baselines, override badges, and rollover toggles.
 *
 * Pure presentation: parent (`pages/Budget.tsx`) owns the queries and
 * mutations; this component receives `year`, `budgets`, `stats`,
 * `categories`, `rollup`, and four mutation callbacks plus the
 * suggest-pending flag.
 *
 * Local UI state owned here: the selected month (for per-month override
 * editing), an in-flight `drafts` map keyed by `${categoryId}-${scope}`,
 * and the set of collapsed bucket sections.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Lock, RefreshCw, X } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  type BudgetEntry,
  type BudgetState,
  type CategoryHistoricalStats,
} from "@/api/budget";
import {
  CSP_BUCKETS,
  type CategoryResponse,
  type CspBucket,
} from "@/api/categories";
import { type PlanningRollup } from "@/api/csp";
import { formatCurrency } from "@/lib/format";

import { BucketDashboardCard } from "./BucketDashboardCard";
import { BUCKET_DESCRIPTION, BUCKET_LABEL } from "./bucket-copy";
import {
  allMonthsForYear,
  currentMonthKey,
  currentYear,
  shortMonth,
} from "./date-helpers";
import { MonthSelector } from "./MonthSelector";

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

export function SetBudgetView({
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
      {/* Optional CSP-denominator hint when net income is set. */}
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

      {/* NULL-bucket warning banner. */}
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

      {/* Four bucket dashboard cards. */}
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

      {/* Bucket-grouped category list. */}
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
