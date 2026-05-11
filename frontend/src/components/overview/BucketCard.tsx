/**
 * One CSP bucket card on the Overview dashboard.
 *
 * Header: bucket label + actual / expected-or-budget summary plus a
 * progress visual. The visual differs by mode:
 *
 *  - **Pace mode**: a pace bar — actual against expected, with a tick
 *    mark for expected, capped at the full-month budget.
 *  - **Actual-vs-budget mode**: a simple progress fill — actual against
 *    the range budget, capped visually at 100% (the over-budget number
 *    is still shown numerically).
 *
 * Click the header to expand a per-category drill-down inline. Each
 * category row reuses the same per-row visual treatment in each mode.
 *
 * An empty bucket (no categories AND budget == 0) renders a "$0 budgeted"
 * placeholder with no progress visual (spec: empty buckets always render
 * but show "$0 budgeted").
 */
import { ChevronDown, ChevronRight } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type {
  BucketPaceRollup,
  CategoryPaceRow,
  CspBucket,
  PaceMode,
} from "@/api/overview";

const BUCKET_LABEL: Record<CspBucket, string> = {
  fixed: "Fixed Costs",
  investments: "Investments",
  savings: "Savings",
  guilt_free: "Guilt-Free Spending",
};

interface BucketCardProps {
  bucket: BucketPaceRollup;
  expanded: boolean;
  onToggle: () => void;
  onCategoryClick?: (categoryId: number) => void;
  mode: PaceMode;
}

function paceBarStyle(actual: number, expected: number, budget: number) {
  // Position the actual fill against the full-month budget so the bar's
  // visual width is comparable across buckets. The expected marker lands
  // wherever pace currently is.
  const max = Math.max(budget, expected, actual, 1);
  const actualPct = Math.min((actual / max) * 100, 100);
  const expectedPct = Math.min((expected / max) * 100, 100);
  const overPace = actual > expected;
  return { actualPct, expectedPct, overPace };
}

function PaceBar({
  actual,
  expected,
  budget,
}: {
  actual: number;
  expected: number;
  budget: number;
}) {
  if (budget <= 0 && actual <= 0 && expected <= 0) return null;
  const { actualPct, expectedPct, overPace } = paceBarStyle(actual, expected, budget);
  return (
    <div className="relative h-2 rounded-full bg-secondary/40 overflow-hidden">
      <div
        className={`absolute left-0 top-0 h-full ${
          overPace ? "bg-destructive" : "bg-primary"
        }`}
        style={{ width: `${actualPct}%` }}
      />
      <div
        className="absolute top-0 bottom-0 w-px bg-foreground/60"
        style={{ left: `${expectedPct}%` }}
      />
    </div>
  );
}

/**
 * Simple progress fill for actual-vs-budget mode. Width is
 * `actual / budget * 100`, capped at 100%. Color flips to destructive
 * when actual exceeds budget.
 */
function ProgressFill({ actual, budget }: { actual: number; budget: number }) {
  if (budget <= 0 && actual <= 0) return null;
  const pct = budget > 0 ? Math.min((actual / budget) * 100, 100) : actual > 0 ? 100 : 0;
  const over = actual > budget && budget > 0;
  return (
    <div className="relative h-2 rounded-full bg-secondary/40 overflow-hidden">
      <div
        className={`absolute left-0 top-0 h-full ${over ? "bg-destructive" : "bg-primary"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function CategoryPaceModeRow({
  row,
  onCategoryClick,
}: {
  row: CategoryPaceRow;
  onCategoryClick?: (categoryId: number) => void;
}) {
  const overPace = row.actual_mtd > row.expected_mtd;
  const canDrillDown = row.category_id != null && onCategoryClick != null;
  return (
    <div
      className={`space-y-1.5 py-2 border-t border-border first:border-t-0 rounded-sm ${
        canDrillDown ? "cursor-pointer hover:bg-secondary/20 px-1 -mx-1" : ""
      }`}
      onClick={() => {
        if (row.category_id != null) onCategoryClick?.(row.category_id);
      }}
    >
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{row.category_name}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {formatCurrency(row.actual_mtd)} / {formatCurrency(row.expected_mtd)} expected
        </span>
      </div>
      <PaceBar
        actual={row.actual_mtd}
        expected={row.expected_mtd}
        budget={row.full_budget}
      />
      <div className="flex justify-between text-[10px] font-mono text-muted-foreground/70">
        <span>budget {formatCurrency(row.full_budget)}</span>
        <span className={overPace ? "text-destructive" : "text-success"}>
          {overPace ? "over pace" : "on/under pace"}
        </span>
      </div>
    </div>
  );
}

function CategoryAvbModeRow({
  row,
  onCategoryClick,
}: {
  row: CategoryPaceRow;
  onCategoryClick?: (categoryId: number) => void;
}) {
  // In AvB mode `expected_mtd` and `full_budget` carry the same value
  // (range_budget). We display "Actual / Budget" copy.
  const over = row.actual_mtd > row.full_budget && row.full_budget > 0;
  const canDrillDown = row.category_id != null && onCategoryClick != null;
  return (
    <div
      className={`space-y-1.5 py-2 border-t border-border first:border-t-0 rounded-sm ${
        canDrillDown ? "cursor-pointer hover:bg-secondary/20 px-1 -mx-1" : ""
      }`}
      onClick={() => {
        if (row.category_id != null) onCategoryClick?.(row.category_id);
      }}
    >
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{row.category_name}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {formatCurrency(row.actual_mtd)} / {formatCurrency(row.full_budget)} budget
        </span>
      </div>
      <ProgressFill actual={row.actual_mtd} budget={row.full_budget} />
      <div className="flex justify-end text-[10px] font-mono">
        <span className={over ? "text-destructive" : "text-success"}>
          {over ? "over budget" : "within budget"}
        </span>
      </div>
    </div>
  );
}

function CategoryRow({
  row,
  mode,
  onCategoryClick,
}: {
  row: CategoryPaceRow;
  mode: PaceMode;
  onCategoryClick?: (categoryId: number) => void;
}) {
  return mode === "pace" ? (
    <CategoryPaceModeRow row={row} onCategoryClick={onCategoryClick} />
  ) : (
    <CategoryAvbModeRow row={row} onCategoryClick={onCategoryClick} />
  );
}

export function BucketCard({
  bucket,
  expanded,
  onToggle,
  onCategoryClick,
  mode,
}: BucketCardProps) {
  const isEmpty = bucket.categories.length === 0 && bucket.budget === 0;
  const overPace = mode === "pace" ? bucket.actual > bucket.expected : bucket.actual > bucket.budget;
  const statusLabel = mode === "pace"
    ? overPace ? "over pace" : "on pace"
    : overPace ? "over budget" : "within budget";
  const expectedLabel = mode === "pace" ? "expected" : "budget";
  const expectedValue = mode === "pace" ? bucket.expected : bucket.budget;

  return (
    <Card>
      <CardHeader className="pb-2">
        <button
          type="button"
          onClick={onToggle}
          disabled={isEmpty}
          className={`w-full flex items-start justify-between gap-2 text-left ${
            isEmpty ? "cursor-default" : "cursor-pointer"
          }`}
        >
          <div className="flex items-center gap-2">
            {!isEmpty &&
              (expanded ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              ))}
            <span className="text-sm font-medium">{BUCKET_LABEL[bucket.bucket]}</span>
          </div>
          {!isEmpty && (
            <span
              className={`text-[11px] font-mono ${
                overPace ? "text-destructive" : "text-success"
              }`}
            >
              {statusLabel}
            </span>
          )}
        </button>
      </CardHeader>
      <CardContent className="space-y-2">
        {isEmpty ? (
          <div className="text-sm text-muted-foreground">$0 budgeted</div>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-2xl font-mono font-semibold tabular-nums">
                {formatCurrency(bucket.actual)}
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                of {formatCurrency(bucket.budget)}
              </span>
            </div>
            <div className="text-[11px] font-mono text-muted-foreground">
              {expectedLabel} {formatCurrency(expectedValue)}
            </div>
            {mode === "pace" ? (
              <PaceBar
                actual={bucket.actual}
                expected={bucket.expected}
                budget={bucket.budget}
              />
            ) : (
              <ProgressFill actual={bucket.actual} budget={bucket.budget} />
            )}
            {expanded && bucket.categories.length > 0 && (
              <div className="pt-2">
                {bucket.categories.map((c) => (
                  <CategoryRow
                    key={c.category_id ?? c.category_name}
                    row={c}
                    mode={mode}
                    onCategoryClick={onCategoryClick}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
