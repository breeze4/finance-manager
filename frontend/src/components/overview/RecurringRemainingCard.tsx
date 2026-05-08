/**
 * RecurringRemainingCard — single-statistic card for "recurring still
 * expected this month".
 *
 * Dumb presentation component: parent (Overview.tsx) owns the
 * remaining-subscriptions query and passes ``total`` + ``count`` +
 * ``loading``. When ``total === 0`` the card renders the empty-state
 * copy with no link; otherwise it renders the formatted total, the
 * count, and a click-through to ``/subscriptions`` (the page where the
 * full list lives).
 *
 * Empty-state copy is verbatim from the spec acceptance criterion: "No
 * recurring charges expected this month".
 */
import { Link } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";

export interface RecurringRemainingCardProps {
  total: number;
  count: number;
  loading: boolean;
}

export function RecurringRemainingCard({
  total,
  count,
  loading,
}: RecurringRemainingCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recurring still expected this month</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : total === 0 ? (
          <div className="text-sm text-muted-foreground">
            No recurring charges expected this month
          </div>
        ) : (
          <div className="space-y-1">
            <div className="text-2xl font-mono font-semibold tabular-nums">
              {formatCurrency(total)}
            </div>
            <div className="text-sm text-muted-foreground">
              {count} {count === 1 ? "subscription" : "subscriptions"}
              {" — "}
              <Link
                to="/subscriptions"
                className="underline underline-offset-2 hover:text-foreground"
              >
                view all
              </Link>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
