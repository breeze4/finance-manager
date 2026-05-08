/**
 * Top-of-page headline — branches on response mode.
 *
 * Pace mode (current MTD):
 *   variance < 0 → "On pace — $X under expected"
 *   variance ≥ 0 → "Over pace — $X over expected"
 *
 * Actual-vs-budget mode (any other range):
 *   variance < 0 → "Spent $A / Budgeted $B / $|var| under"
 *   variance > 0 → "Spent $A / Budgeted $B / Over by $var"
 *   variance = 0 → "Spent $A / Budgeted $B"
 *
 * The numeric breakdown (Actual / Expected (or Budgeted)) is displayed
 * in both modes for context.
 */
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { PaceHeadline as PaceHeadlineData, PaceMode } from "@/api/overview";

interface PaceHeadlineProps {
  headline: PaceHeadlineData;
  mode: PaceMode;
}

function paceVerdict(variance: number): { copy: string; over: boolean } {
  const over = variance > 0;
  const magnitude = Math.abs(variance);
  return {
    copy: over
      ? `Over pace — ${formatCurrency(magnitude)} over expected`
      : `On pace — ${formatCurrency(magnitude)} under expected`,
    over,
  };
}

function avbVerdict(
  actual: number,
  expected: number,
  variance: number,
): { copy: string; over: boolean } {
  const spent = formatCurrency(actual);
  const budgeted = formatCurrency(expected);
  const magnitude = Math.abs(variance);
  if (variance > 0) {
    return {
      copy: `Spent ${spent} / Budgeted ${budgeted} / Over by ${formatCurrency(magnitude)}`,
      over: true,
    };
  }
  if (variance < 0) {
    return {
      copy: `Spent ${spent} / Budgeted ${budgeted} / ${formatCurrency(magnitude)} under`,
      over: false,
    };
  }
  return {
    copy: `Spent ${spent} / Budgeted ${budgeted}`,
    over: false,
  };
}

export function PaceHeadline({ headline, mode }: PaceHeadlineProps) {
  const { copy, over } =
    mode === "pace"
      ? paceVerdict(headline.variance)
      : avbVerdict(headline.actual_total, headline.expected_total, headline.variance);

  const expectedLabel = mode === "pace" ? "Expected" : "Budgeted";

  return (
    <Card>
      <CardContent className="pt-6 pb-6 space-y-2">
        <div
          className={`text-xl font-semibold ${over ? "text-destructive" : "text-success"}`}
        >
          {copy}
        </div>
        <div className="text-sm text-muted-foreground font-mono space-x-3">
          <span>Actual {formatCurrency(headline.actual_total)}</span>
          <span className="opacity-60">·</span>
          <span>
            {expectedLabel} {formatCurrency(headline.expected_total)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
