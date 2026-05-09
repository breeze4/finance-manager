/**
 * BudgetVarianceChart — variance bar chart for one bucket's category rows.
 *
 * Per-row layout: chevron, category name, budget, actual, remaining,
 * three-zone variance bar. Sorting (budget / actual / pct / remaining)
 * and per-row expansion (lazy `<CategoryDrilldown>`) are local state.
 *
 * Three-zone bar mapping (`mapToZonePosition`) and percentage→color mapping
 * (`getTierColors`) live here as non-exported helpers — they exist for
 * this component only.
 */
import { Fragment, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, RefreshCw } from "lucide-react";

import { formatCurrency } from "@/lib/format";

import { CategoryDrilldown } from "./CategoryDrilldown";
import type { VarianceRow } from "./actualVsBudgetViewModel";

type SortColumn = "budget" | "actual" | "pct" | "remaining";
type SortDir = "asc" | "desc";

/** Maps budget percentage to bar position with three fixed-width zones:
 *  0–85% → 0–70%, 85–115% → 70–90%, 115%+ → 90–100% (capped). */
function mapToZonePosition(budgetPct: number): number {
  if (budgetPct <= 0) return 0;
  if (budgetPct <= 85) return (budgetPct / 85) * 70;
  if (budgetPct <= 115) return 70 + ((budgetPct - 85) / 30) * 20;
  return Math.min(90 + ((budgetPct - 115) / 35) * 10, 100);
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

interface BudgetVarianceChartProps {
  rows: VarianceRow[];
  monthKeyStr: string;
}

export function BudgetVarianceChart({ rows, monthKeyStr }: BudgetVarianceChartProps) {
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
