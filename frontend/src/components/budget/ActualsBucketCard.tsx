/**
 * Actual-vs-budget bucket card. Mirrors `BucketDashboardCard` but answers
 * "is this month tracking the plan?" — header shows target % vs actual %,
 * footer shows the points delta and a tracking-status badge. The badge
 * function is colocated and private — `ActualsBucketCard` is the only
 * public symbol.
 */
import { ArrowDown, ArrowUp, CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { BucketRollup, TrackingStatus } from "@/api/csp";
import { formatCurrency } from "@/lib/format";

import { BUCKET_LABEL } from "./bucket-copy";

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

export function ActualsBucketCard({ b }: { b: BucketRollup }) {
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
