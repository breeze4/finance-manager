import * as React from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { formatFormula, type FormulaValues } from "@/lib/math";
import { cn } from "@/lib/utils";

/**
 * Props for `MathTooltip`. Mirrors the calculator's Vue `MathTooltip.vue`
 * shape:
 *   - `formula`/`calculation`/`result` are template strings with `{key}`
 *     placeholders substituted via `formatFormula` from `mathFormatters`.
 *   - `calculation` may be a single string or an array of step strings.
 *   - On desktop (>= 768px) the tooltip opens on hover via Radix HoverCard.
 *   - On mobile it opens as a Radix Dialog on tap.
 *
 * Substituted output may contain HTML (e.g. `<sup>`); rendered with
 * `dangerouslySetInnerHTML` to match the Vue component's `v-html` usage.
 */
export interface MathTooltipProps {
  /** Trigger content. Wrapped with help-cursor styling. */
  children: React.ReactNode;
  /** Optional title shown at the top of the card. */
  title?: string;
  /** Formula template with `{placeholders}`. */
  formula?: string;
  /** Values to substitute into formula/calculation/result templates. */
  values?: FormulaValues;
  /** Calculation step(s). Each step is a template string. */
  calculation?: string | string[];
  /** Result template (rendered as a highlighted block). */
  result?: string;
  /** Plain-text explanation paragraph. */
  explanation?: string;
  /** When true, no card is shown. */
  disabled?: boolean;
  /** Extra className on the trigger wrapper. */
  className?: string;
}

export function MathTooltip({
  children,
  title,
  formula,
  values,
  calculation,
  result,
  explanation,
  disabled = false,
  className
}: MathTooltipProps) {
  const isMobile = useMediaQuery("(max-width: 767px)");

  const formattedFormula = React.useMemo(
    () => (formula ? formatFormula(formula, values ?? {}) : ""),
    [formula, values]
  );

  const calculationSteps = React.useMemo(() => {
    if (!calculation) return [];
    const steps = Array.isArray(calculation) ? calculation : [calculation];
    return steps.map(step => formatFormula(step, values ?? {}));
  }, [calculation, values]);

  const formattedResult = React.useMemo(
    () => (result ? formatFormula(result, values ?? {}) : ""),
    [result, values]
  );

  if (disabled) {
    return <span className={className}>{children}</span>;
  }

  const triggerClass = cn("cursor-help underline decoration-dotted underline-offset-4", className);

  const body = (
    <div className="flex flex-col gap-3 text-sm">
      {formula && (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Formula
          </div>
          <div
            className="rounded bg-muted px-2 py-1 font-mono text-sm"
            dangerouslySetInnerHTML={{ __html: formattedFormula }}
          />
        </div>
      )}

      {calculationSteps.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Calculation
          </div>
          <ol className="space-y-1 rounded bg-muted px-2 py-1 font-mono text-sm">
            {calculationSteps.map((step, i) => (
              <li key={i} dangerouslySetInnerHTML={{ __html: step }} />
            ))}
          </ol>
        </div>
      )}

      {result && (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Result
          </div>
          <div
            className="rounded bg-primary/10 px-2 py-1 font-mono text-sm"
            dangerouslySetInnerHTML={{ __html: formattedResult }}
          />
        </div>
      )}

      {explanation && <p className="text-sm italic text-muted-foreground">{explanation}</p>}
    </div>
  );

  if (isMobile) {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <span className={triggerClass}>{children}</span>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          {title && (
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              {explanation && <DialogDescription className="sr-only">{explanation}</DialogDescription>}
            </DialogHeader>
          )}
          {body}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <HoverCard openDelay={150} closeDelay={50}>
      <HoverCardTrigger asChild>
        <span className={triggerClass}>{children}</span>
      </HoverCardTrigger>
      <HoverCardContent className="w-96 max-w-[90vw]" align="center">
        {title && <div className="mb-2 text-base font-semibold">{title}</div>}
        {body}
      </HoverCardContent>
    </HoverCard>
  );
}
