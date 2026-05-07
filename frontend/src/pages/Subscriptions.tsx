/**
 * Subscriptions page. Lists detected fixed and variable recurring charges
 * from `/api/subscriptions` and exposes the `/detect` re-scan as a button.
 *
 * The backend stores fixed and variable subs in one `subscriptions` table,
 * discriminated by `subscription_type`. The mockup splits them across two
 * tabs (Fixed / Recurring), so the page partitions the single API response
 * client-side. Field names stay snake_case to match the API boundary
 * (smaller resource — no camelCase adapter, per the plan).
 *
 * The mockup includes a per-row sparkline driven by a `history[]` array
 * that the backend does not surface. The trend column is omitted here;
 * adding it would require a per-vendor history endpoint or an extra
 * transactions fetch per row. See `docs/handoff/step-4-subscriptions.md`.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  detectSubscriptions,
  listSubscriptions,
  type SubscriptionResponse,
} from "@/api/subscriptions";
import { formatCurrency } from "@/lib/format";

const COLORS = [
  "hsl(173, 58%, 39%)",
  "hsl(220, 70%, 55%)",
  "hsl(280, 60%, 55%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 65%, 51%)",
  "hsl(152, 56%, 39%)",
  "hsl(320, 60%, 50%)",
  "hsl(200, 70%, 50%)",
];

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "hsl(225, 22%, 11%)",
    border: "1px solid hsl(225, 15%, 18%)",
    borderRadius: 8,
    fontSize: 12,
  },
};

function categoryLabel(s: SubscriptionResponse): string {
  return s.category_name ?? "Uncategorized";
}

export default function Subscriptions() {
  const qc = useQueryClient();

  const subsQ = useQuery({
    queryKey: ["subscriptions"],
    queryFn: listSubscriptions,
  });

  const detectM = useMutation({
    mutationFn: detectSubscriptions,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscriptions"] }),
  });

  const active = useMemo(
    () => (subsQ.data ?? []).filter((s) => s.is_active),
    [subsQ.data]
  );
  const fixed = useMemo(
    () => active.filter((s) => s.subscription_type === "fixed"),
    [active]
  );
  const variable = useMemo(
    () => active.filter((s) => s.subscription_type !== "fixed"),
    [active]
  );

  const totalFixedAnnual = useMemo(
    () => fixed.reduce((sum, s) => sum + s.annual_estimate, 0),
    [fixed]
  );
  const totalVariableAnnual = useMemo(
    () => variable.reduce((sum, s) => sum + s.annual_estimate, 0),
    [variable]
  );

  const pieData = useMemo(() => {
    const totals = new Map<string, number>();
    for (const s of fixed) {
      const key = categoryLabel(s);
      totals.set(key, (totals.get(key) ?? 0) + s.annual_estimate);
    }
    return Array.from(totals.entries()).map(([name, value]) => ({
      name,
      value: Math.round(value),
    }));
  }, [fixed]);

  if (subsQ.error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Failed to load subscriptions:{" "}
        {subsQ.error instanceof Error
          ? subsQ.error.message
          : String(subsQ.error)}
      </div>
    );
  }

  if (subsQ.isLoading) {
    return (
      <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
        Loading subscriptions…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Subscriptions</h1>
          <p className="text-sm text-muted-foreground">
            Detected recurring charges from your transaction history.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => detectM.mutate()}
          disabled={detectM.isPending}
        >
          {detectM.isPending ? "Detecting…" : "Re-detect"}
        </Button>
      </div>

      {detectM.error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          Detection failed:{" "}
          {detectM.error instanceof Error
            ? detectM.error.message
            : String(detectM.error)}
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Fixed Subscriptions
            </p>
            <p className="text-2xl font-bold mt-1">{fixed.length}</p>
            <p className="text-xs text-muted-foreground mt-1">
              totaling {formatCurrency(totalFixedAnnual)}/yr
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Recurring Expenses
            </p>
            <p className="text-2xl font-bold mt-1">{variable.length}</p>
            <p className="text-xs text-muted-foreground mt-1">
              averaging {formatCurrency(totalVariableAnnual)}/yr
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center justify-center">
            {pieData.length === 0 ? (
              <div className="h-[120px] flex items-center justify-center text-xs text-muted-foreground">
                No category data.
              </div>
            ) : (
              <ResponsiveContainer width={160} height={120}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={50}
                    dataKey="value"
                    paddingAngle={2}
                    isAnimationActive={false}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(v: number) => formatCurrency(v)}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="fixed">
        <TabsList className="bg-secondary">
          <TabsTrigger value="fixed">Fixed Subscriptions</TabsTrigger>
          <TabsTrigger value="recurring">Recurring Expenses</TabsTrigger>
        </TabsList>

        <TabsContent value="fixed" className="mt-4">
          {fixed.length === 0 ? (
            <div className="rounded-lg border border-border p-6 text-sm text-muted-foreground text-center">
              No fixed subscriptions detected.
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary/50 border-b border-border">
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Vendor
                    </th>
                    <th className="p-3 text-right text-xs font-medium text-muted-foreground uppercase">
                      Amount
                    </th>
                    <th className="p-3 text-center text-xs font-medium text-muted-foreground uppercase">
                      Freq
                    </th>
                    <th className="p-3 text-right text-xs font-medium text-muted-foreground uppercase">
                      Annual
                    </th>
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Category
                    </th>
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Last Charge
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {fixed.map((s, i) => (
                    <tr
                      key={s.id}
                      className={`border-b border-border ${
                        i % 2 === 0 ? "bg-card" : "bg-card/50"
                      }`}
                    >
                      <td className="p-3 font-medium">{s.vendor}</td>
                      <td className="p-3 text-right font-mono">
                        {s.amount != null ? formatCurrency(s.amount) : "—"}
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant="secondary" className="text-xs">
                          {s.frequency}
                        </Badge>
                      </td>
                      <td className="p-3 text-right font-mono text-muted-foreground">
                        {formatCurrency(s.annual_estimate)}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-xs">
                          {categoryLabel(s)}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {s.last_charge_date}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="recurring" className="mt-4">
          {variable.length === 0 ? (
            <div className="rounded-lg border border-border p-6 text-sm text-muted-foreground text-center">
              No variable recurring expenses detected.
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary/50 border-b border-border">
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Vendor
                    </th>
                    <th className="p-3 text-right text-xs font-medium text-muted-foreground uppercase">
                      Range
                    </th>
                    <th className="p-3 text-right text-xs font-medium text-muted-foreground uppercase">
                      Annual
                    </th>
                    <th className="p-3 text-center text-xs font-medium text-muted-foreground uppercase">
                      Freq
                    </th>
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Category
                    </th>
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Last Charge
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {variable.map((s, i) => (
                    <tr
                      key={s.id}
                      className={`border-b border-border ${
                        i % 2 === 0 ? "bg-card" : "bg-card/50"
                      }`}
                    >
                      <td className="p-3 font-medium">{s.vendor}</td>
                      <td className="p-3 text-right font-mono text-muted-foreground">
                        {s.amount_min != null && s.amount_max != null
                          ? `${formatCurrency(s.amount_min)} – ${formatCurrency(
                              s.amount_max
                            )}`
                          : "—"}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {formatCurrency(s.annual_estimate)}
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant="secondary" className="text-xs">
                          {s.frequency}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-xs">
                          {categoryLabel(s)}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {s.last_charge_date}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
