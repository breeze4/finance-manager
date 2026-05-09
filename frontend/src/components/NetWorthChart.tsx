/**
 * NetWorthChart — single-series line chart of net worth over time.
 *
 * Receives the `NetWorthPoint[]` series from the parent (which fetches
 * `/api/net-worth`) and renders a Recharts `<LineChart>` with the analyzer
 * teal stroke (`hsl(var(--chart-1))`) and currency-formatted axis + tooltip.
 *
 * Empty state: when not loading and `data` is empty, renders a centered
 * message instead of an empty Recharts container.
 */

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import type { NetWorthPoint } from "@/api/snapshots";
import { formatCurrency } from "@/lib/format";

export interface NetWorthChartProps {
  data: NetWorthPoint[];
  loading: boolean;
}

function formatYAxis(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return formatCurrency(value);
}

function formatTooltipDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

export function NetWorthChart({ data, loading }: NetWorthChartProps) {
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
        No snapshots yet. Take your first snapshot above.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="date" className="text-xs" minTickGap={32} />
        <YAxis tickFormatter={formatYAxis} className="text-xs" width={80} />
        <Tooltip
          formatter={(value: number) => formatCurrency(value)}
          labelFormatter={(label: string) => formatTooltipDate(label)}
        />
        <Line
          type="monotone"
          dataKey="net_worth"
          name="Net worth"
          stroke="hsl(var(--chart-1))"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
