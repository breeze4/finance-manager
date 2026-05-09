/**
 * Horizontal month-button strip used by Set Budget and Actual vs Budget.
 *
 * Each month is a small button. The active month uses the `default` button
 * variant; others use `outline`. The `currentMonthKey` (today's month) gets
 * a tiny green dot indicator. Optional `annotations` per month render a
 * two-line pct/delta block on that button only — used by Actual vs Budget
 * to surface monthly variance summaries inline. The optional `showAll`
 * prop adds an "All" pseudo-month at the front of the strip.
 */
import { Button } from "@/components/ui/button";
import { currentMonthKey, shortMonth } from "./date-helpers";

export interface MonthAnnotation {
  pct: string;
  delta: string;
  color: string;
}

interface MonthSelectorProps {
  months: string[];
  selected: string;
  onChange: (m: string) => void;
  showAll?: boolean;
  annotations?: Record<string, MonthAnnotation>;
}

export function MonthSelector({
  months,
  selected,
  onChange,
  showAll,
  annotations,
}: MonthSelectorProps) {
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
