/**
 * Recent transactions list for the Overview pace dashboard.
 *
 * Owns its own TanStack Query against the existing `listTransactions`
 * client. Step 5: accepts a `dateFrom` / `dateTo` from the picker and
 * filters the txns query accordingly. The query key embeds the range so
 * picker change triggers a refetch.
 *
 * Read-only / compact: no bulk-select, no inline category editor, no
 * row expand. Visual layout mirrors the Transactions page row cells
 * (date / vendor / amount / category badge).
 */
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";
import { listTransactions, type Transaction } from "@/api/transactions";

const PAGE_SIZE = 10;

export interface RecentTransactionsListProps {
  dateFrom?: string;
  dateTo?: string;
}

function CategoryBadge({ category }: { category: string }) {
  if (!category) {
    return (
      <Badge variant="outline" className="text-xs border-warning/50 text-warning">
        —
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-xs font-normal">
      {category}
    </Badge>
  );
}

function Row({ t, zebra }: { t: Transaction; zebra: boolean }) {
  return (
    <tr
      className={`border-b border-border last:border-b-0 ${
        zebra ? "bg-card/50" : "bg-card"
      }`}
    >
      <td className="p-3 text-muted-foreground whitespace-nowrap">
        {formatDate(t.date)}
      </td>
      <td className="p-3">
        <div className="font-medium">{t.vendor}</div>
      </td>
      <td
        className={`p-3 text-right font-mono font-medium whitespace-nowrap ${
          t.amount < 0 ? "text-destructive" : "text-success"
        }`}
      >
        {formatCurrency(t.amount)}
      </td>
      <td className="p-3">
        <CategoryBadge category={t.category} />
      </td>
    </tr>
  );
}

export function RecentTransactionsList({
  dateFrom,
  dateTo,
}: RecentTransactionsListProps = {}) {
  const q = useQuery({
    queryKey: ["overview", "recent-transactions", { dateFrom, dateTo }],
    queryFn: () =>
      listTransactions({
        isTransfer: false,
        page: 1,
        pageSize: PAGE_SIZE,
        sortBy: "date",
        sortDir: "desc",
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
      }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent transactions</CardTitle>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : q.error ? (
          <div className="text-sm text-destructive">
            Failed to load recent transactions:{" "}
            {q.error instanceof Error ? q.error.message : String(q.error)}
          </div>
        ) : !q.data || q.data.items.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No transactions yet.
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/50 border-b border-border">
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">
                    Date
                  </th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">
                    Vendor
                  </th>
                  <th className="p-3 text-right text-xs font-medium text-muted-foreground uppercase">
                    Amount
                  </th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">
                    Category
                  </th>
                </tr>
              </thead>
              <tbody>
                {q.data.items.map((t, i) => (
                  <Row key={t.id} t={t} zebra={i % 2 === 1} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
