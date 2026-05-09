/**
 * HistoricalView — per-category historical spending stats.
 *
 * Renders a table (avg, median, range, std dev, 80% CI, trend, seasonal
 * months) plus a stacked-area chart of the top 6 categories' month-by-month
 * totals. Pure presentation: parent (`pages/Budget.tsx`) owns the query
 * and passes `stats` in.
 *
 * Transforms (`trendCategories`, `monthSet`, `months`, `chartData`) are
 * plain `const` in the render body — data sizes are small and `useMemo`
 * isn't justified.
 */

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { CategoryHistoricalStats } from "@/api/budget";

import { MONTH_NAMES, shortMonth } from "./date-helpers";
import { chartColors, tooltipStyle } from "./chart-style";

function trendIcon(t: CategoryHistoricalStats["trend"]) {
  if (t === "increasing") return <TrendingUp className="w-4 h-4 text-destructive" />;
  if (t === "decreasing") return <TrendingDown className="w-4 h-4 text-success" />;
  return <ArrowRight className="w-4 h-4 text-muted-foreground" />;
}

export function HistoricalView({ stats }: { stats: CategoryHistoricalStats[] }) {
  // Top 6 categories by average drive the trend chart.
  const trendCategories = stats.slice(0, 6).map((s) => s.categoryName);

  // Union of months across the top categories' monthly totals, sorted asc.
  const monthSet = new Set<string>();
  for (const s of stats) {
    if (!trendCategories.includes(s.categoryName)) continue;
    Object.keys(s.monthlyTotals).forEach((k) => monthSet.add(k));
  }
  const months = Array.from(monthSet).sort();

  const chartData = months.map((m) => {
    const entry: Record<string, string | number> = { month: shortMonth(m) };
    for (const cat of trendCategories) {
      const stat = stats.find((s) => s.categoryName === cat);
      entry[cat] = stat?.monthlyTotals[m] ?? 0;
    }
    return entry;
  });

  return (
    <>
      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-secondary/50 border-b border-border">
              <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">
                Category
              </th>
              <th className="p-3 text-right text-xs font-medium text-muted-foreground uppercase">
                Avg
              </th>
              <th className="p-3 text-right text-xs font-medium text-muted-foreground uppercase">
                Median
              </th>
              <th className="p-3 text-right text-xs font-medium text-muted-foreground uppercase">
                Range
              </th>
              <th className="p-3 text-right text-xs font-medium text-muted-foreground uppercase">
                Std Dev
              </th>
              <th className="p-3 text-right text-xs font-medium text-muted-foreground uppercase">
                80% CI
              </th>
              <th className="p-3 text-center text-xs font-medium text-muted-foreground uppercase">
                Trend
              </th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">
                Seasonal
              </th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s, i) => (
              <tr
                key={s.categoryId}
                className={`border-b border-border ${i % 2 === 0 ? "bg-card" : "bg-card/50"}`}
              >
                <td className="p-3 font-medium">{s.categoryName}</td>
                <td className="p-3 text-right font-mono">
                  {formatCurrency(s.monthlyAverage)}
                </td>
                <td className="p-3 text-right font-mono text-muted-foreground">
                  {formatCurrency(s.monthlyMedian)}
                </td>
                <td className="p-3 text-right font-mono text-muted-foreground">
                  {formatCurrency(s.monthlyMin)}–{formatCurrency(s.monthlyMax)}
                </td>
                <td className="p-3 text-right font-mono text-muted-foreground">
                  {formatCurrency(s.stdDev)}
                </td>
                <td className="p-3 text-right font-mono">
                  {formatCurrency(s.confidenceIntervalLow)}–
                  {formatCurrency(s.confidenceIntervalHigh)}
                </td>
                <td className="p-3">
                  <div className="flex items-center justify-center gap-1">
                    {trendIcon(s.trend)}
                    <span className="text-xs capitalize text-muted-foreground">
                      {s.trend}
                    </span>
                  </div>
                </td>
                <td className="p-3">
                  {s.seasonalMonths.length > 0 ? (
                    <div className="flex gap-1 flex-wrap">
                      {s.seasonalMonths.map((mo) => (
                        <Badge key={mo} variant="outline" className="text-xs">
                          {MONTH_NAMES[mo - 1]}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {chartData.length > 0 && trendCategories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Spending by Category ({months.length} {months.length === 1 ? "month" : "months"})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(225, 15%, 18%)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(220, 10%, 55%)" }} />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(220, 10%, 55%)" }}
                  tickFormatter={(v: number) => formatCurrency(v)}
                />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v: number) => formatCurrency(v)}
                />
                <Legend />
                {trendCategories.map((cat, i) => (
                  <Area
                    key={cat}
                    dataKey={cat}
                    stackId="spending"
                    fill={chartColors[i % chartColors.length]}
                    stroke={chartColors[i % chartColors.length]}
                    isAnimationActive={false}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </>
  );
}
