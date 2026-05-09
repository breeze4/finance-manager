/**
 * CategoryDrilldown — per-row transaction list for an expanded variance row.
 *
 * Lazy-mounted by `BudgetVarianceChart` only when the row is expanded.
 * Fires its own `["transactions", "for-budget-drilldown", ...]` query so
 * each row's data fetches independently and is cached separately.
 *
 * Outflows-only — actual spend in the parent chart is the absolute outflow
 * total, so the drilldown filters to negative-amount rows for visual parity.
 */
import { useQuery } from "@tanstack/react-query";

import { listTransactions, type Transaction } from "@/api/transactions";
import { formatCurrency } from "@/lib/format";

interface CategoryDrilldownProps {
  categoryId: number;
  monthKeyStr: string;
}

export function CategoryDrilldown({ categoryId, monthKeyStr }: CategoryDrilldownProps) {
  const [year, mo] = monthKeyStr.split("-").map((p) => parseInt(p, 10));
  // Last day of the queried month.
  const lastDay = new Date(year, mo, 0).getDate();
  const dateFrom = `${year}-${String(mo).padStart(2, "0")}-01`;
  const dateTo = `${year}-${String(mo).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const txnsQ = useQuery<{ items: Transaction[] }>({
    queryKey: ["transactions", "for-budget-drilldown", { categoryId, monthKeyStr }],
    queryFn: () =>
      listTransactions({
        categoryId,
        dateFrom,
        dateTo,
        isTransfer: false,
        pageSize: 200,
        sortBy: "date",
        sortDir: "asc",
      }),
  });

  const txns = txnsQ.data?.items ?? [];
  // Outflows only — actual spend in the chart is the absolute outflow total.
  const outflows = txns.filter((t) => t.amount < 0);

  if (txnsQ.isLoading) {
    return (
      <div className="px-2 py-2 text-[10px] font-mono text-muted-foreground">
        Loading transactions…
      </div>
    );
  }
  if (outflows.length === 0) {
    return (
      <div className="px-2 py-2 text-[10px] font-mono text-muted-foreground">
        No transactions this month.
      </div>
    );
  }

  return (
    <div className="py-1 mb-2 rounded overflow-hidden">
      <div
        className="flex items-center text-[9px] font-mono text-muted-foreground/50 px-2 py-1"
        style={{ backgroundColor: "#151d35" }}
      >
        <div className="w-7 shrink-0" />
        <div className="w-16 shrink-0">Date</div>
        <div className="w-32 shrink-0">Vendor</div>
        <div className="w-20 shrink-0 text-right">Amount</div>
      </div>
      {outflows.map((t, ti) => (
        <div
          key={t.id}
          className="flex items-center text-[10px] font-mono h-5"
          style={{ backgroundColor: ti % 2 === 0 ? "#1a2340" : "#151d35" }}
        >
          <div className="w-7 shrink-0" />
          <div className="w-16 shrink-0 pl-2 text-muted-foreground/50">
            {t.date.slice(5)}
          </div>
          <div className="w-32 shrink-0 text-muted-foreground truncate">
            {t.vendor}
          </div>
          <div className="w-20 shrink-0 text-right text-muted-foreground">
            {formatCurrency(Math.abs(t.amount))}
          </div>
        </div>
      ))}
    </div>
  );
}
