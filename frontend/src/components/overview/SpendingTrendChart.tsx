/**
 * SpendingTrendChart — per-month "actual vs budget vs variance" trend.
 *
 * Dumb presentation component: parent owns the query (Overview.tsx) and
 * passes ``data`` + ``loading`` in. Mirrors NetWorthChart.tsx in chart
 * dimensions, themed tooltip, and ``isAnimationActive=false`` to match
 * the rest of the Overview palette.
 *
 * Colors:
 *   - actual  → ``hsl(var(--chart-1))`` (analyzer teal — primary)
 *   - budget → ``hsl(var(--chart-2))`` (muted blue — comparison)
 *   - variance → success/destructive/muted per month, depending on
 *     whether actual is under/over/equal to budget.
 *
 * Empty state ("No data for this range") and loading state ("Loading
 * chart…") match the convention from NetWorthChart.tsx — same 320px
 * container, same muted-foreground color.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
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
  currentMonth?: string;
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

function formatTrendMonthLabel(yyyymm: string, currentMonth?: string): string {
  const label = formatMonthLabel(yyyymm);
  return currentMonth === yyyymm ? `${label} MTD` : label;
}

type TrendChartRow = TrendMonth & {
  variance: number;
  varianceLabel: "Under Budget" | "Over Budget" | "On Budget";
  varianceFill: string;
};

function toChartRows(data: TrendMonth[]): TrendChartRow[] {
  return data.map((row) => {
    const delta = row.expected - row.actual;
    const isUnder = delta > 0;
    const isOver = delta < 0;
    return {
      ...row,
      variance: delta,
      varianceLabel: isOver ? "Over Budget" : isUnder ? "Under Budget" : "On Budget",
      varianceFill: isOver
        ? "hsl(var(--destructive))"
        : isUnder
          ? "hsl(var(--success))"
          : "hsl(var(--muted-foreground))",
    };
  });
}

export function SpendingTrendChart({ data, loading, currentMonth }: SpendingTrendChartProps) {
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

  const chartData = toChartRows(data);

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={chartData} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="month"
          tickFormatter={(value: string) => formatTrendMonthLabel(value, currentMonth)}
          className="text-xs"
          minTickGap={16}
        />
        <YAxis tickFormatter={formatYAxis} className="text-xs" width={80} />
        <Tooltip
          formatter={(value: number, name: string, item) => {
            if (name === "Variance") {
              return [
                formatCurrency(Math.abs(value)),
                (item.payload as TrendChartRow).varianceLabel,
              ];
            }
            return [formatCurrency(value), name];
          }}
          labelFormatter={(label: string) => formatTrendMonthLabel(label, currentMonth)}
        />
        <ReferenceLine y={0} stroke="hsl(var(--border))" />
        <Legend />
        <Bar
          dataKey="actual"
          name="Actual"
          fill="hsl(var(--chart-1))"
          isAnimationActive={false}
        />
        <Bar
          dataKey="expected"
          name="Budget"
          fill="hsl(var(--chart-2))"
          isAnimationActive={false}
        />
        <Bar dataKey="variance" name="Variance" isAnimationActive={false}>
          {chartData.map((row) => (
            <Cell key={`variance-${row.month}`} fill={row.varianceFill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
