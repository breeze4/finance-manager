/**
 * ChargesVsPaymentsChart — grouped (side-by-side) bar chart for the
 * Payments page. Two bars per bucket: charges (negatives' magnitude) and
 * payments (positives), no stacking.
 *
 * Pure presentation: parent (`pages/Payments.tsx`) owns the query and
 * passes `bucketSize` + `buckets` straight from the
 * `GET /api/payments/series` response. Bucket labels are pre-formatted
 * server-side (e.g. "Jan 2026", "Q1 2026", "2026").
 *
 * Color palette: semantic project tokens — `--destructive` for charges,
 * `--success` for payments. The Recharts `<Bar fill>` prop wants a CSS
 * color string, so we resolve via `hsl(var(--*))`.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { tooltipStyle } from "@/components/budget/chart-style";
import { formatCurrency } from "@/lib/format";
import type { PaymentSeriesBucket } from "@/api/payments";

interface Props {
  bucketSize: "month" | "quarter" | "year";
  buckets: PaymentSeriesBucket[];
}

const BUCKET_TITLE: Record<Props["bucketSize"], string> = {
  month: "Monthly",
  quarter: "Quarterly",
  year: "Yearly",
};

const CHARGES_COLOR = "hsl(var(--destructive))";
const PAYMENTS_COLOR = "hsl(var(--success))";

export function ChargesVsPaymentsChart({ bucketSize, buckets }: Props) {
  // Recharts wants `data` keyed by string fields used as `dataKey`s. The
  // backend already gives us `label`, `charges_total`, `payments_total` —
  // pass through directly.
  const data = buckets.map((b) => ({
    label: b.label,
    Charges: b.charges_total,
    Payments: b.payments_total,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Charges vs. Payments ({BUCKET_TITLE[bucketSize]})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(225, 15%, 18%)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "hsl(220, 10%, 55%)" }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "hsl(220, 10%, 55%)" }}
              tickFormatter={(v: number) => formatCurrency(v)}
            />
            <Tooltip
              {...tooltipStyle}
              formatter={(v: number) => formatCurrency(v)}
            />
            <Legend />
            <Bar dataKey="Charges" fill={CHARGES_COLOR} isAnimationActive={false} />
            <Bar dataKey="Payments" fill={PAYMENTS_COLOR} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
