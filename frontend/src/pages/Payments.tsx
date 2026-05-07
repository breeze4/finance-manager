/**
 * Payments page. Shows credit-card payment matches from `/api/payments`
 * (BECU checking debit paired to Chase CC payment), plus the unmatched
 * candidates pulled from `/api/transactions?is_transfer=false` and
 * narrowed client-side to the same filters `payment_service.detect_payments`
 * uses (BECU rows where `raw_description LIKE '%CHASE CREDIT CRD%'`,
 * Chase rows where `type === 'Payment'`).
 *
 * Field names stay snake_case to match the API boundary — the canonical
 * camelCase `Transaction` adapter is owned by Step 6 (Transactions page).
 * See `docs/handoff/step-5-payments.md`.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  detectPayments,
  listPayments,
  unmatchPayment,
  type PaymentMatchResponse,
} from "@/api/payments";
import {
  listTransactions,
  type Transaction,
} from "@/api/transactions";
import { formatCurrency, formatDate } from "@/lib/format";

const CANDIDATE_PAGE_SIZE = 200;

function isCheckingCandidate(t: Transaction): boolean {
  return /CHASE CREDIT CRD/i.test(t.rawDescription ?? "");
}

function isCcCandidate(t: Transaction): boolean {
  return t.type === "Payment";
}

function matchAmount(m: PaymentMatchResponse): number {
  return Math.abs(m.checking_transaction.amount);
}

export default function Payments() {
  const qc = useQueryClient();

  const paymentsQ = useQuery({
    queryKey: ["payments"],
    queryFn: listPayments,
  });

  const candidatesQ = useQuery({
    queryKey: ["transactions", { is_transfer: false, page_size: CANDIDATE_PAGE_SIZE }],
    queryFn: () =>
      listTransactions({ isTransfer: false, pageSize: CANDIDATE_PAGE_SIZE }),
  });

  const detectM = useMutation({
    mutationFn: detectPayments,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });

  const unmatchM = useMutation({
    mutationFn: (matchId: number) => unmatchPayment(matchId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });

  const matches = paymentsQ.data ?? [];

  const totalMatched = useMemo(
    () => matches.reduce((sum, m) => sum + matchAmount(m), 0),
    [matches]
  );

  const matchedTxnIds = useMemo(() => {
    const ids = new Set<number>();
    for (const m of matches) {
      ids.add(m.checking_transaction.id);
      ids.add(m.cc_transaction.id);
    }
    return ids;
  }, [matches]);

  const unmatched = useMemo(() => {
    const items = candidatesQ.data?.items ?? [];
    return items
      .filter((t) => !matchedTxnIds.has(t.id))
      .filter((t) => isCheckingCandidate(t) || isCcCandidate(t));
  }, [candidatesQ.data, matchedTxnIds]);

  if (paymentsQ.error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Failed to load payments:{" "}
        {paymentsQ.error instanceof Error
          ? paymentsQ.error.message
          : String(paymentsQ.error)}
      </div>
    );
  }

  if (paymentsQ.isLoading) {
    return (
      <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
        Loading payments…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Payments</h1>
          <p className="text-sm text-muted-foreground">
            Credit-card payments matched to checking-account debits.
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

      {unmatchM.error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          Unmatch failed:{" "}
          {unmatchM.error instanceof Error
            ? unmatchM.error.message
            : String(unmatchM.error)}
        </div>
      ) : null}

      <Card>
        <CardContent className="pt-6 flex items-center gap-6">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Matched Payments
            </p>
            <p className="text-2xl font-bold mt-1">{matches.length}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Total Matched
            </p>
            <p className="text-2xl font-bold mt-1">
              {formatCurrency(totalMatched)}
            </p>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-sm font-medium mb-3">Matched Payments</h2>
        {matches.length === 0 ? (
          <div className="rounded-lg border border-border p-6 text-sm text-muted-foreground text-center">
            No matched payments yet. Run "Re-detect" to find credit-card
            payments in your transaction history.
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
                    Transfer
                  </th>
                  <th className="p-3 text-right text-xs font-medium text-muted-foreground uppercase">
                    Amount
                  </th>
                  <th className="p-3 text-center text-xs font-medium text-muted-foreground uppercase">
                    Status
                  </th>
                  <th className="p-3 text-center text-xs font-medium text-muted-foreground uppercase">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m, i) => (
                  <tr
                    key={m.id}
                    className={`border-b border-border ${
                      i % 2 === 0 ? "bg-card" : "bg-card/50"
                    }`}
                  >
                    <td className="p-3 text-muted-foreground">
                      {formatDate(m.checking_transaction.date)}
                    </td>
                    <td className="p-3">
                      <span className="font-medium">
                        {m.checking_transaction.account_name}
                      </span>
                      <ArrowRight className="inline h-3 w-3 mx-2 text-muted-foreground" />
                      <span className="font-medium">
                        {m.cc_transaction.account_name}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono">
                      {formatCurrency(matchAmount(m))}
                    </td>
                    <td className="p-3 text-center">
                      <Badge className="bg-success/15 text-success border-0 text-xs">
                        Matched
                      </Badge>
                    </td>
                    <td className="p-3 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => unmatchM.mutate(m.id)}
                        disabled={
                          unmatchM.isPending && unmatchM.variables === m.id
                        }
                      >
                        {unmatchM.isPending && unmatchM.variables === m.id
                          ? "…"
                          : "Unmatch"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-medium mb-3">Unmatched Candidates</h2>
        {candidatesQ.isLoading ? (
          <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
            Loading candidates…
          </div>
        ) : unmatched.length === 0 ? (
          <div className="rounded-lg border border-border p-6 text-sm text-muted-foreground text-center">
            No unmatched candidates in the most recent {CANDIDATE_PAGE_SIZE}{" "}
            transactions.
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
                    Description
                  </th>
                  <th className="p-3 text-right text-xs font-medium text-muted-foreground uppercase">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {unmatched.map((t, i) => (
                  <tr
                    key={t.id}
                    className={`border-b border-border ${
                      i % 2 === 0 ? "bg-card" : "bg-card/50"
                    }`}
                  >
                    <td className="p-3 text-muted-foreground">
                      {formatDate(t.date)}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-xs">
                        {t.account}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {t.rawDescription}
                    </td>
                    <td className="p-3 text-right font-mono">
                      {formatCurrency(Math.abs(t.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
