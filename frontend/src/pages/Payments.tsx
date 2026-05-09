/**
 * Payments page. Lists positive-amount transactions on credit-card
 * accounts (payments, refunds, credits), scoped by a page-level account
 * selector ("All CCs" by default) and the global date range picker.
 *
 * Backend contract: ``GET /api/payments`` (see
 * ``backend/app/routers/payment_router.py``). The matching infrastructure
 * (matched / unmatched tables, detect endpoint) was removed — see
 * ``docs/specs/2026-05-08-04-payments-redesign.md``.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listAccounts, type Account } from "@/api/accounts";
import { listPayments, type PaymentListItem } from "@/api/payments";
import { formatCurrency, formatDate } from "@/lib/format";
import { useGlobalFilters } from "@/hooks/useGlobalFilters";

const ALL_CCS = "all";

export default function Payments() {
  const { resolvedRange } = useGlobalFilters();
  const [selectedAccount, setSelectedAccount] = useState<string>(ALL_CCS);

  const accountsQ = useQuery({
    queryKey: ["accounts"],
    queryFn: () => listAccounts(false),
  });
  const ccAccounts: Account[] = useMemo(
    () => (accountsQ.data ?? []).filter((a) => a.type === "credit_card"),
    [accountsQ.data],
  );

  const accountId =
    selectedAccount === ALL_CCS ? null : Number(selectedAccount);

  const paymentsQ = useQuery({
    queryKey: [
      "payments",
      {
        accountId,
        startDate: resolvedRange.dateFrom ?? null,
        endDate: resolvedRange.dateTo ?? null,
      },
    ],
    queryFn: () =>
      listPayments({
        accountId,
        startDate: resolvedRange.dateFrom ?? null,
        endDate: resolvedRange.dateTo ?? null,
      }),
  });

  const items: PaymentListItem[] = paymentsQ.data ?? [];
  const total = useMemo(
    () => items.reduce((sum, p) => sum + p.amount, 0),
    [items],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Payments</h1>
          <p className="text-sm text-muted-foreground">
            Positive-amount activity on credit-card accounts (payments, refunds,
            credits) for the active date range.
          </p>
        </div>
        <Select value={selectedAccount} onValueChange={setSelectedAccount}>
          <SelectTrigger className="w-[200px] h-8 text-xs bg-secondary border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CCS}>All CCs</SelectItem>
            {ccAccounts.map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-6 rounded-lg border border-border bg-card p-4">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            Payments
          </p>
          <p className="text-2xl font-bold mt-1">{items.length}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            Total
          </p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(total)}</p>
        </div>
      </div>

      {paymentsQ.error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load payments:{" "}
          {paymentsQ.error instanceof Error
            ? paymentsQ.error.message
            : String(paymentsQ.error)}
        </div>
      ) : paymentsQ.isLoading ? (
        <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          Loading payments…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-border p-6 text-sm text-muted-foreground text-center">
          No credit-card payments in this date range.
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
                  Account
                </th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Vendor
                </th>
                <th className="p-3 text-right text-xs font-medium text-muted-foreground uppercase">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((p, i) => (
                <tr
                  key={p.id}
                  className={`border-b border-border ${
                    i % 2 === 0 ? "bg-card" : "bg-card/50"
                  }`}
                >
                  <td className="p-3 text-muted-foreground whitespace-nowrap">
                    {formatDate(p.date)}
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className="text-xs font-normal">
                      {p.account_name}
                    </Badge>
                  </td>
                  <td className="p-3">{p.vendor}</td>
                  <td className="p-3 text-right font-mono">
                    {formatCurrency(p.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
