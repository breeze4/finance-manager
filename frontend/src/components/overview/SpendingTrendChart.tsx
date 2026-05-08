/**
 * SpendingTrendChart — two-series per-month "actual vs expected" trend.
 *
 * Dumb presentation component: parent owns the query (Overview.tsx) and
 * passes ``data`` + ``loading`` in. Mirrors NetWorthChart.tsx in chart
 * dimensions, themed tooltip, and ``isAnimationActive=false`` to match
 * the rest of the Overview palette.
 *
 * Colors:
 *   - actual  → ``hsl(var(--chart-1))`` (analyzer teal — primary)
 *   - expected → ``hsl(var(--chart-2))`` (muted blue — comparison)
 *
 * Empty state ("No data for this range") and loading state ("Loading
 * chart…") match the convention from NetWorthChart.tsx — same 320px
 * container, same muted-foreground color.
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

import { formatCurrency } from "@/lib/format";
import type { TrendMonth } from "@/api/overview";

export interface SpendingTrendChartProps {
  data: TrendMonth[];
  loading: boolean;
}

const CURRENCY_COMPACT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatYAxis(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return CURRENCY_COMPACT.format(value);
}

function formatMonthLabel(yyyymm: string): string {
  // "YYYY-MM" → "MMM YYYY"
  const [y, m] = yyyymm.split("-").map(Number);
  if (!y || !m) return yyyymm;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export function SpendingTrendChart({ data, loading }: SpendingTrendChartProps) {
  if (loading) {
    return (
      <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
        Loading chart…
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
        No data for this range
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="month"
          tickFormatter={formatMonthLabel}
          className="text-xs"
          minTickGap={16}
        />
        <YAxis tickFormatter={formatYAxis} className="text-xs" width={80} />
        <Tooltip
          formatter={(value: number) => formatCurrency(value)}
          labelFormatter={(label: string) => formatMonthLabel(label)}
        />
        <Legend />
        <Bar
          dataKey="actual"
          name="Actual"
          fill="hsl(var(--chart-1))"
          isAnimationActive={false}
        />
        <Bar
          dataKey="expected"
          name="Expected"
          fill="hsl(var(--chart-2))"
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
