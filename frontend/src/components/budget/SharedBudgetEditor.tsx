/**
 * SharedBudgetEditor — modal-like transient editor for one (category, year)
 * budget row.
 *
 * Used by HistoricalView to fix wrong past-year `monthly_amount` baselines.
 * In `pastYearMode`, the rollover toggle and per-month override list are
 * read-only (rollover semantics for past years are out of scope per spec
 * `2026-05-08-05-budget-tweaks.md`; per-month overrides remain locked by
 * the backend's past-month guard).
 *
 * Boundary choice: rather than refactoring SetBudgetView's inline editing
 * (which is entangled with bucket grouping, drafts state, and the month
 * selector), this is a NEW component used only by HistoricalView. SetBudgetView
 * keeps its inline editing pattern for current/future months. This minimises
 * regression risk in the well-tested SetBudgetView surface while still meeting
 * the spec's "shared editor" goal at the level of editor *contract* (props +
 * pastYearMode flag) and behavior, not literal code reuse.
 */

import { useState } from "react";
import { Lock, RefreshCw, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";

import { MONTH_NAMES } from "./date-helpers";

export interface SharedBudgetEditorProps {
  categoryId: number;
  year: number;
  categoryName: string;
  initialMonthlyAmount: number;
  initialRolloverMode: boolean;
  /** Existing per-month overrides for this (category, year). */
  monthlyOverrides: Array<{ month: number; amount: number }>;
  /** Save handler — parent decides which mutation to invoke. In pastYearMode,
   * only the baseline is saved (rollover unchanged, overrides untouched). */
  onSave: (monthlyAmount: number, rolloverMode: boolean) => void;
  onCancel: () => void;
  /** When true: rollover toggle is disabled, overrides are read-only.
   * Only `monthlyAmount` is editable. Default false. */
  pastYearMode?: boolean;
}

export function SharedBudgetEditor({
  categoryId: _categoryId,
  year,
  categoryName,
  initialMonthlyAmount,
  initialRolloverMode,
  monthlyOverrides,
  onSave,
  onCancel,
  pastYearMode = false,
}: SharedBudgetEditorProps) {
  const [monthlyAmount, setMonthlyAmount] = useState<number>(initialMonthlyAmount);
  const [rolloverMode, setRolloverMode] = useState<boolean>(initialRolloverMode);

  const sortedOverrides = [...monthlyOverrides].sort((a, b) => a.month - b.month);

  const handleSave = () => {
    // In pastYearMode, rolloverMode is locked to the initial value (the
    // toggle is disabled in the UI, but we belt-and-suspenders here too).
    const nextRollover = pastYearMode ? initialRolloverMode : rolloverMode;
    onSave(monthlyAmount, nextRollover);
  };

  return (
    <Card data-testid="shared-budget-editor">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base font-medium">
            Edit budget — {categoryName}{" "}
            <span className="text-muted-foreground text-sm font-normal">({year})</span>
          </CardTitle>
          {pastYearMode && (
            <p className="text-xs text-muted-foreground mt-1">
              Past year: only monthly baseline is editable. Overrides and
              rollover mode are locked.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Close editor"
        >
          <X className="w-4 h-4" />
        </button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Baseline input — always editable. */}
        <div className="flex items-center gap-3">
          <label
            htmlFor="shared-budget-baseline"
            className="text-sm font-medium w-40 shrink-0"
          >
            Monthly baseline
          </label>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">$</span>
            <input
              id="shared-budget-baseline"
              type="number"
              step="1"
              className="w-32 bg-transparent border border-border focus:border-primary rounded px-2 py-1 text-right text-sm font-mono focus:outline-none"
              value={monthlyAmount}
              onChange={(e) => setMonthlyAmount(parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>

        {/* Rollover toggle — disabled in pastYearMode. */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium w-40 shrink-0">Rollover mode</span>
          <button
            type="button"
            disabled={pastYearMode}
            onClick={() => setRolloverMode((v) => !v)}
            aria-label="Toggle rollover mode"
            data-testid="rollover-toggle"
            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors ${
              rolloverMode
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            } ${pastYearMode ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {rolloverMode ? (
              <>
                <RefreshCw className="w-3 h-3" /> Rollover
              </>
            ) : (
              <>
                <Lock className="w-3 h-3" /> Fixed
              </>
            )}
          </button>
        </div>

        {/* Per-month overrides — read-only in pastYearMode. */}
        {sortedOverrides.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              Per-month overrides
              {pastYearMode && (
                <Badge variant="outline" className="ml-2 text-xs">
                  read-only
                </Badge>
              )}
            </p>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {sortedOverrides.map((o) => (
                    <tr
                      key={o.month}
                      className="border-b border-border last:border-b-0"
                      data-testid={`override-row-${o.month}`}
                    >
                      <td className="p-2 px-3 font-medium">
                        {MONTH_NAMES[o.month - 1]}
                      </td>
                      <td className="p-2 px-3 text-right">
                        <input
                          type="number"
                          disabled
                          value={o.amount}
                          aria-label={`Override for ${MONTH_NAMES[o.month - 1]}`}
                          className="w-32 bg-transparent border border-border rounded px-2 py-1 text-right text-sm font-mono opacity-60"
                        />
                      </td>
                      <td className="p-2 px-3 text-right text-xs text-muted-foreground font-mono">
                        was {formatCurrency(initialMonthlyAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
