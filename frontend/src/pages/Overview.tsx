/**
 * Overview dashboard. Hooks four backend queries:
 *   - /api/stats/summary       — totals + top categories
 *   - /api/stats/monthly?year= — spending-by-month bars
 *   - /api/transactions        — recent rows for top-vendors and monthly income
 *
 * Top-vendors and monthly-income come from a transactions fetch because the
 * stats router does not expose either. See `docs/handoff/step-3-overview.md`
 * for the rationale and v1 limits.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMonthly, getSummary } from "@/api/stats";
import { listTransactions, type Transaction } from "@/api/transactions";
import { formatCurrency } from "@/lib/format";

const CHART_COLORS = [
  "hsl(173, 58%, 39%)",
  "hsl(220, 70%, 55%)",
  "hsl(280, 60%, 55%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 65%, 51%)",
  "hsl(152, 56%, 39%)",
  "hsl(320, 60%, 50%)",
  "hsl(200, 70%, 50%)",
];

const TXN_PAGE_SIZE = 200;

const MONTH_LABELS = [
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

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "hsl(225, 22%, 11%)",
    border: "1px solid hsl(225, 15%, 18%)",
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: "hsl(220, 15%, 85%)" },
};

interface MonthlyRow {
  month: string;
  spending: number;
  income: number;
}

function buildMonthlySpending(
  months: { month: number; total: number }[]
): Map<number, number> {
  const out = new Map<number, number>();
  for (const row of months) {
    out.set(row.month, (out.get(row.month) ?? 0) + row.total);
  }
  return out;
}

function buildMonthlyIncome(
  txns: Transaction[],
  year: number
): Map<number, number> {
  const out = new Map<number, number>();
  for (const t of txns) {
    if (t.isTransfer) continue;
    if (t.amount <= 0) continue;
    const d = new Date(`${t.date}T00:00:00`);
    if (d.getFullYear() !== year) continue;
    const m = d.getMonth() + 1;
    out.set(m, (out.get(m) ?? 0) + t.amount);
  }
  return out;
}

function buildVendorTotals(
  txns: Transaction[]
): { name: string; total: number }[] {
  const totals = new Map<string, number>();
  for (const t of txns) {
    if (t.isTransfer) continue;
    if (t.amount >= 0) continue;
    const v = t.vendor || "Unknown";
    totals.set(v, (totals.get(v) ?? 0) + Math.abs(t.amount));
  }
  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, total]) => ({ name, total: Math.round(total) }));
}

export default function Overview() {
  const year = new Date().getFullYear();

  const summaryQ = useQuery({
    queryKey: ["stats", "summary", { dateFrom: null, dateTo: null }],
    queryFn: () => getSummary(),
  });

  const monthlyQ = useQuery({
    queryKey: ["stats", "monthly", { year }],
    queryFn: () => getMonthly(year),
  });

  const txnsQ = useQuery({
    queryKey: ["transactions", "for-top-vendors", { year, pageSize: TXN_PAGE_SIZE }],
    queryFn: () =>
      listTransactions({
        isTransfer: false,
        page: 1,
        pageSize: TXN_PAGE_SIZE,
      }),
  });

  const monthlyData = useMemo<MonthlyRow[]>(() => {
    if (!monthlyQ.data) return [];
    const spending = buildMonthlySpending(monthlyQ.data.months);
    const income = buildMonthlyIncome(txnsQ.data?.items ?? [], year);
    const rows: MonthlyRow[] = [];
    for (let m = 1; m <= 12; m += 1) {
      const s = spending.get(m) ?? 0;
      const i = income.get(m) ?? 0;
      if (s === 0 && i === 0) continue;
      rows.push({
        month: `${MONTH_LABELS[m - 1]} ${String(year).slice(2)}`,
        spending: Math.round(s),
        income: Math.round(i),
      });
    }
    return rows;
  }, [monthlyQ.data, txnsQ.data, year]);

  const categoryData = useMemo(() => {
    if (!summaryQ.data) return [];
    return summaryQ.data.top_categories.slice(0, 8).map((c) => ({
      name: c.category_name,
      value: Math.round(c.total),
    }));
  }, [summaryQ.data]);

  const vendorData = useMemo(() => {
    if (!txnsQ.data) return [];
    return buildVendorTotals(txnsQ.data.items);
  }, [txnsQ.data]);

  const isLoading = summaryQ.isLoading || monthlyQ.isLoading || txnsQ.isLoading;
  const error = summaryQ.error ?? monthlyQ.error ?? txnsQ.error;

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Failed to load overview: {error instanceof Error ? error.message : String(error)}
      </div>
    );
  }

  const summary = summaryQ.data;
  const savingsRatePct = summary ? summary.savings_rate * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Spending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary ? formatCurrency(summary.total_spending) : "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Income
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">
              {summary ? formatCurrency(summary.total_income) : "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Savings Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary ? `${savingsRatePct.toFixed(1)}%` : "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary ? summary.transaction_count : "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Spending Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
                Loading…
              </div>
            ) : monthlyData.length === 0 ? (
              <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
                No data for {year}.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(225, 15%, 18%)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(220, 10%, 55%)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(220, 10%, 55%)" }} />
                  <Tooltip {...tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="spending" fill="hsl(173, 58%, 39%)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Category Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
                Loading…
              </div>
            ) : categoryData.length === 0 ? (
              <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
                No category data.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="value"
                    paddingAngle={2}
                    isAnimationActive={false}
                  >
                    {categoryData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    formatter={(value: string) => (
                      <span className="text-muted-foreground">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Income vs Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
                Loading…
              </div>
            ) : monthlyData.length === 0 ? (
              <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
                No data for {year}.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(225, 15%, 18%)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(220, 10%, 55%)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(220, 10%, 55%)" }} />
                  <Tooltip {...tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="income" fill="hsl(152, 56%, 39%)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="spending" fill="hsl(0, 55%, 45%)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Top Vendors</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
                Loading…
              </div>
            ) : vendorData.length === 0 ? (
              <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
                No vendor data.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={vendorData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(225, 15%, 18%)" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(220, 10%, 55%)" }} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fontSize: 11, fill: "hsl(220, 10%, 55%)" }}
                    width={120}
                  />
                  <Tooltip {...tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="total" fill="hsl(220, 70%, 55%)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
