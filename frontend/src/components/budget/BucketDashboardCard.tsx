/**
 * One CSP bucket dashboard card on the Set Budget tab.
 *
 * Shows the bucket's planned percentage of net income, the absolute dollar
 * numerator, the Ramit range header line, and a status badge derived from
 * `b.status` / `b.is_open_ended_over`. The badge function is colocated and
 * private — `BucketDashboardCard` is the only public symbol.
 */
import { ArrowDown, ArrowUp, CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { BucketRollup } from "@/api/csp";
import { formatCurrency } from "@/lib/format";

import { BUCKET_LABEL, bucketRangeLabel } from "./bucket-copy";

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

export function BucketDashboardCard({ b }: { b: BucketRollup }) {
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
