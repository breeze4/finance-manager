/**
 * Net Worth page (table-only — chart is added by plan 07).
 *
 * Shows latest balance per active account. "Snapshot today" opens the batch
 * entry modal. After save, the latest-balances query is invalidated so the
 * table updates.
 *
 * Layout landmarks for plan 07:
 *   - <header>            : page heading + "Snapshot today" button
 *   - <Chart placeholder> : INSERT BETWEEN header and the latest-balance card
 *   - <Card>              : latest-balance card containing the shadcn Table
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { DateRangePicker } from "@/components/DateRangePicker";
import { NetWorthChart } from "@/components/NetWorthChart";
import { SnapshotBatchModal } from "@/components/SnapshotBatchModal";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { listAccounts, type Account, type AccountType } from "@/api/accounts";
import {
  ApiError,
  getLatestBalances,
  getNetWorthSeries,
  postSnapshotBatch,
  type LatestBalance,
  type NetWorthPoint,
  type SnapshotBatchEntry,
  type SnapshotBatchResponse
} from "@/api/snapshots";

const TYPE_LABELS: Record<AccountType, string> = {
  checking: "Checking",
  savings: "Savings",
  credit_card: "Credit card",
  brokerage: "Brokerage",
  retirement: "Retirement",
  asset: "Asset"
};

const ACCOUNTS_KEY = ["accounts", { includeArchived: false }] as const;
const LATEST_KEY = ["net-worth", "latest"] as const;
const SERIES_KEY_PREFIX = ["net-worth", "series"] as const;

function formatBalance(balance: number, type: AccountType): string {
  const formatted = balance.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  if (type === "credit_card") {
    return `−$${formatted}`;
  }
  return `$${formatted}`;
}

export default function NetWorth() {
  const [modalOpen, setModalOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);
  const qc = useQueryClient();

  const accountsQ = useQuery<Account[]>({
    queryKey: ACCOUNTS_KEY,
    queryFn: () => listAccounts(false)
  });

  const latestQ = useQuery<LatestBalance[]>({
    queryKey: LATEST_KEY,
    queryFn: getLatestBalances
  });

  const seriesQ = useQuery<NetWorthPoint[]>({
    queryKey: [...SERIES_KEY_PREFIX, { start: rangeStart, end: rangeEnd }] as const,
    queryFn: () => getNetWorthSeries(rangeStart, rangeEnd)
  });

  const saveMut = useMutation<
    SnapshotBatchResponse,
    Error,
    { asOfDate: string; entries: SnapshotBatchEntry[] }
  >({
    mutationFn: ({ asOfDate, entries }) => postSnapshotBatch(asOfDate, entries),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LATEST_KEY });
      qc.invalidateQueries({ queryKey: SERIES_KEY_PREFIX });
      setModalOpen(false);
      setSubmitError(null);
    },
    onError: err => {
      setSubmitError(
        err instanceof ApiError ? err.message : "Failed to save snapshots"
      );
    }
  });

  const accounts = accountsQ.data ?? [];
  const latest = latestQ.data ?? [];
  const series = seriesQ.data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Net Worth</h2>
          <p className="text-sm text-muted-foreground">
            Latest balance per account. Use "Snapshot today" to record new
            balances.
          </p>
        </div>
        <Button
          onClick={() => {
            setSubmitError(null);
            setModalOpen(true);
          }}
        >
          Snapshot today
        </Button>
      </header>

      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-medium">Net worth over time</h3>
          <DateRangePicker
            start={rangeStart}
            end={rangeEnd}
            onChange={(s, e) => {
              setRangeStart(s);
              setRangeEnd(e);
            }}
          />
        </div>
        <NetWorthChart data={series} loading={seriesQ.isLoading} />
      </div>

      <div className="rounded-lg border border-border bg-card shadow-sm">
        {latestQ.isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">
            Loading balances…
          </div>
        ) : latest.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            No active accounts. Add one on the Accounts page first.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>As of</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {latest.map(row => (
                <TableRow key={row.account_id}>
                  <TableCell className="font-medium">
                    {row.account_name}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs rounded-md border border-border px-2 py-0.5 text-muted-foreground">
                      {TYPE_LABELS[row.account_type]}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.balance == null
                      ? "—"
                      : formatBalance(row.balance, row.account_type)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.as_of_date ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <SnapshotBatchModal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onSubmit={(asOfDate, entries) => saveMut.mutate({ asOfDate, entries })}
        accounts={accounts}
        latestBalances={latest}
        submitting={saveMut.isPending}
        errorMessage={submitError}
      />
    </div>
  );
}
