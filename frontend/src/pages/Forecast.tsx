import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getForecast,
  getMethods,
  getYoY,
  type ForecastResponse,
  type MethodsResponse,
  type MonthForecastResponse,
  type YoYEntryResponse,
} from "@/api/forecast";
import { formatCurrency } from "@/lib/format";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const TOP_YOY_CATEGORIES = 6;

interface ChartRow {
  month: string;
  status: MonthForecastResponse["status"];
  total: number;
  actualTotal: number | null;
  projectedTotal: number | null;
}

function buildChartRows(months: MonthForecastResponse[]): ChartRow[] {
  const byMonth = new Map(months.map((m) => [m.month, m] as const));
  return MONTHS.map((label, idx) => {
    const m = byMonth.get(idx + 1);
    if (!m) {
      return {
        month: label,
        status: "projected" as const,
        total: 0,
        actualTotal: null,
        projectedTotal: null,
      };
    }
    // Solid line tracks actual + partial; dashed line tracks projected +
    // partial. Duplicating the partial-month value into both series joins
    // the two lines with no visual gap at the transition.
    const isActualSide = m.status === "actual" || m.status === "partial";
    const isProjectedSide = m.status === "projected" || m.status === "partial";
    return {
      month: label,
      status: m.status,
      total: m.total,
      actualTotal: isActualSide ? Math.round(m.total) : null,
      projectedTotal: isProjectedSide ? Math.round(m.total) : null,
    };
  });
}

interface YoYRow {
  month?: string;
  [year: string]: number | string | undefined;
}

function buildYoYRows(entries: YoYEntryResponse[]): {
  years: number[];
  rows: YoYRow[];
} {
  const yearSet = new Set<number>();
  for (const e of entries) {
    for (const y of Object.keys(e.annual_totals)) yearSet.add(Number(y));
  }
  const years = Array.from(yearSet).sort((a, b) => a - b);
  const top = entries.slice(0, TOP_YOY_CATEGORIES);
  const rows: YoYRow[] = top.map((e) => {
    const row: YoYRow = { category: e.category_name };
    for (const y of years) {
      row[String(y)] = e.annual_totals[String(y)] ?? 0;
    }
    return row;
  });
  return { years, rows };
}

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "hsl(225, 22%, 11%)",
    border: "1px solid hsl(225, 15%, 18%)",
    borderRadius: 8,
    fontSize: 12,
  },
};

export default function Forecast() {
  const [method, setMethod] = useState<string>("simple");
  const year = new Date().getFullYear();

  const methodsQ = useQuery<MethodsResponse>({
    queryKey: ["forecast", "methods"],
    queryFn: getMethods,
  });

  const forecastQ = useQuery<ForecastResponse>({
    queryKey: ["forecast", { year, method }],
    queryFn: () => getForecast(year, method),
  });

  const yoyQ = useQuery<YoYEntryResponse[]>({
    queryKey: ["forecast", "yoy"],
    queryFn: getYoY,
  });

  const chartRows = useMemo(
    () => buildChartRows(forecastQ.data?.months ?? []),
    [forecastQ.data],
  );

  const projectedTotalForRow = (row: ChartRow): number => row.total;
  const actualTotalForRow = (row: ChartRow): number | null =>
    row.status === "actual" || row.status === "partial" ? row.total : null;

  const yoyAggregate = useMemo(() => {
    const entries = yoyQ.data ?? [];
    // Collapse to per-year totals across all categories for the bar chart.
    const totals: Record<number, number> = {};
    for (const e of entries) {
      for (const [y, v] of Object.entries(e.annual_totals)) {
        const yi = Number(y);
        totals[yi] = (totals[yi] ?? 0) + v;
      }
    }
    const years = Object.keys(totals)
      .map(Number)
      .sort((a, b) => a - b);
    return years.map((y) => ({ year: String(y), total: Math.round(totals[y]) }));
  }, [yoyQ.data]);

  const yoyTopCategories = useMemo(
    () => buildYoYRows(yoyQ.data ?? []),
    [yoyQ.data],
  );

  const recurringCharges = useMemo(() => {
    const months = forecastQ.data?.months ?? [];
    // Pick the first projected month's subscription-basis lines (recurring
    // charges are stable across future months in SimpleForecaster).
    const firstProjected = months.find((m) => m.status === "projected");
    if (!firstProjected) return [];
    return firstProjected.line_items
      .filter((li) => li.basis === "subscription")
      .sort((a, b) => b.amount - a.amount);
  }, [forecastQ.data]);

  const annualTotal = forecastQ.data?.annual_total ?? 0;
  const methods = methodsQ.data?.methods ?? [];
  const showMethodPicker = methods.length > 1;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{year} Forecast</h2>
          <p className="text-sm text-muted-foreground">
            Projected annual spending: {formatCurrency(annualTotal)}
          </p>
        </div>
        {showMethodPicker && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Method</span>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                {methods.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            {year} Spending Projection
          </CardTitle>
        </CardHeader>
        <CardContent>
          {forecastQ.isLoading ? (
            <div className="h-[300px] text-sm text-muted-foreground flex items-center justify-center">
              Loading forecast…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartRows}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(225, 15%, 18%)"
                />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "hsl(220, 10%, 55%)" }}
                />
                <YAxis tick={{ fontSize: 11, fill: "hsl(220, 10%, 55%)" }} />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v: number | null) =>
                    v == null ? "—" : formatCurrency(v)
                  }
                />
                <Line
                  type="monotone"
                  dataKey="actualTotal"
                  name="Actual"
                  stroke="hsl(173, 58%, 39%)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="projectedTotal"
                  name="Projected"
                  stroke="hsl(220, 70%, 55%)"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-secondary/50 border-b border-border">
              <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">
                Month
              </th>
              <th className="p-3 text-right text-xs font-medium text-muted-foreground uppercase">
                Projected
              </th>
              <th className="p-3 text-right text-xs font-medium text-muted-foreground uppercase">
                Actual
              </th>
              <th className="p-3 text-right text-xs font-medium text-muted-foreground uppercase">
                Difference
              </th>
            </tr>
          </thead>
          <tbody>
            {chartRows.map((row, i) => {
              const actual = actualTotalForRow(row);
              const projected = projectedTotalForRow(row);
              const isFuture = row.status === "projected";
              const diff = actual != null ? actual - projected : null;
              return (
                <tr
                  key={row.month}
                  className={`border-b border-border ${
                    i % 2 === 0 ? "bg-card" : "bg-card/50"
                  }`}
                >
                  <td className="p-3 font-medium">{row.month}</td>
                  <td
                    className={`p-3 text-right font-mono ${
                      isFuture ? "text-muted-foreground italic" : ""
                    }`}
                  >
                    {formatCurrency(projected)}
                  </td>
                  <td className="p-3 text-right font-mono">
                    {actual != null ? (
                      formatCurrency(actual)
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3 text-right font-mono">
                    {diff != null ? (
                      <span
                        className={
                          diff > 0 ? "text-destructive" : "text-success"
                        }
                      >
                        {formatCurrency(diff)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Year-over-Year Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          {yoyQ.isLoading ? (
            <div className="h-[280px] text-sm text-muted-foreground flex items-center justify-center">
              Loading year-over-year…
            </div>
          ) : yoyAggregate.length === 0 ? (
            <div className="h-[280px] text-sm text-muted-foreground flex items-center justify-center">
              No history yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={yoyAggregate}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(225, 15%, 18%)"
                />
                <XAxis
                  dataKey="year"
                  tick={{ fontSize: 11, fill: "hsl(220, 10%, 55%)" }}
                />
                <YAxis tick={{ fontSize: 11, fill: "hsl(220, 10%, 55%)" }} />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v: number) => formatCurrency(v)}
                />
                <Bar
                  dataKey="total"
                  fill="hsl(173, 58%, 39%)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {yoyTopCategories.rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Top categories by year
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="p-2 text-left text-xs font-medium text-muted-foreground uppercase">
                      Category
                    </th>
                    {yoyTopCategories.years.map((y) => (
                      <th
                        key={y}
                        className="p-2 text-right text-xs font-medium text-muted-foreground uppercase"
                      >
                        {y}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {yoyTopCategories.rows.map((row, idx) => (
                    <tr
                      key={String(row.category)}
                      className={`border-b border-border last:border-0 ${
                        idx % 2 === 0 ? "bg-card" : "bg-card/50"
                      }`}
                    >
                      <td className="p-2 font-medium">{String(row.category)}</td>
                      {yoyTopCategories.years.map((y) => (
                        <td
                          key={y}
                          className="p-2 text-right font-mono"
                        >
                          {formatCurrency(Number(row[String(y)] ?? 0))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Known Recurring Charges
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recurringCharges.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No subscription-basis lines in the projection.
            </div>
          ) : (
            <div className="space-y-2">
              {recurringCharges.map((li) => (
                <div
                  key={`${li.category_id ?? "uncat"}-${li.category_name}`}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0"
                >
                  <span className="font-medium text-sm">
                    {li.category_name || "Uncategorized"}
                  </span>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">monthly</span>
                    <span className="font-mono">
                      {formatCurrency(li.amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
