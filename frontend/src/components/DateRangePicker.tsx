/**
 * DateRangePicker — start/end date inputs plus quick-range buttons.
 *
 * Props:
 *   - `start`, `end` are ISO `YYYY-MM-DD` strings (or `null` for "all time").
 *   - `onChange(start, end)` is fired for every user edit (input change or
 *     quick-range click).
 *
 * Quick ranges:
 *   - "30d", "90d", "1y" → end = today, start = today - N days.
 *   - "all" → both null (server falls back to earliest-snapshot/today).
 */

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface DateRangePickerProps {
  start: string | null;
  end: string | null;
  onChange: (start: string | null, end: string | null) => void;
  className?: string;
}

type QuickRange = "30d" | "90d" | "1y" | "all";

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function applyQuickRange(range: QuickRange): { start: string | null; end: string | null } {
  switch (range) {
    case "30d":
      return { start: isoDaysAgo(30), end: isoToday() };
    case "90d":
      return { start: isoDaysAgo(90), end: isoToday() };
    case "1y":
      return { start: isoDaysAgo(365), end: isoToday() };
    case "all":
    default:
      return { start: null, end: null };
  }
}

export function DateRangePicker({ start, end, onChange, className }: DateRangePickerProps) {
  const handleQuick = (range: QuickRange) => {
    const next = applyQuickRange(range);
    onChange(next.start, next.end);
  };

  return (
    <div className={cn("flex flex-wrap items-end gap-3", className)}>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="net-worth-start">
          Start
        </label>
        <input
          id="net-worth-start"
          type="date"
          value={start ?? ""}
          onChange={e => onChange(e.target.value || null, end)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="net-worth-end">
          End
        </label>
        <input
          id="net-worth-end"
          type="date"
          value={end ?? ""}
          onChange={e => onChange(start, e.target.value || null)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />
      </div>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={() => handleQuick("30d")}>
          30d
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleQuick("90d")}>
          90d
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleQuick("1y")}>
          1y
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleQuick("all")}>
          All
        </Button>
      </div>
    </div>
  );
}
