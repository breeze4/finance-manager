/**
 * Conscious Spending Plan — net-income editor.
 *
 * Static block intended to mount at the top of the Set Budget tab as an
 * interim placement. Slice 3 will absorb this into a redesigned dashboard.
 *
 * Surface area:
 *   - Header: shows the take-home amount currently in effect for *this*
 *     month (looked up via the step-function endpoint), plus a "From
 *     YYYY-MM" annotation when available, or a "Set net income" prompt.
 *   - "Edit" button: opens a Dialog with an amount input, an effective-
 *     month picker, and the detected paycheck suggestion as read-only
 *     context.
 *   - "View history" toggle: lists every period row chronologically.
 *
 * Data flow uses react-query with these keys:
 *   ["net-income", monthKey]   — current-month lookup
 *   ["net-income", "history"]  — full period history
 *   ["paycheck-suggest"]       — detected monthly net
 *
 * Setting a value invalidates all three so the header, history, and the
 * suggestion stay consistent.
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { ApiError } from "@/api/_client";
import {
  currentMonthKey,
  getNetIncome,
  getNetIncomeHistory,
  setNetIncome,
  suggestMonthlyNet,
  type NetIncomeForMonth,
  type NetIncomePeriod,
  type NetIncomeSetPayload,
  type PaycheckSuggestion
} from "@/api/net-income";
import { formatCurrency } from "@/lib/format";

const NET_INCOME_KEY = "net-income";
const PAYCHECK_KEY = "paycheck-suggest";

export function NetIncomeEditor() {
  const monthKey = useMemo(() => currentMonthKey(), []);
  const [editOpen, setEditOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const qc = useQueryClient();

  const currentQ = useQuery<NetIncomeForMonth>({
    queryKey: [NET_INCOME_KEY, monthKey],
    queryFn: () => getNetIncome(monthKey)
  });

  const historyQ = useQuery<NetIncomePeriod[]>({
    queryKey: [NET_INCOME_KEY, "history"],
    queryFn: getNetIncomeHistory,
    enabled: historyOpen
  });

  const suggestQ = useQuery<PaycheckSuggestion>({
    queryKey: [PAYCHECK_KEY],
    queryFn: suggestMonthlyNet
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [NET_INCOME_KEY] });
    qc.invalidateQueries({ queryKey: [PAYCHECK_KEY] });
  };

  const current = currentQ.data;
  const isLoading = currentQ.isLoading;

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Monthly net income</h2>
          <p className="text-xs text-muted-foreground">
            Take-home pay for this month. Used as the denominator in the
            Conscious Spending Plan.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditOpen(true)} disabled={isLoading}>
          {current?.amount == null ? "Set net income" : "Edit"}
        </Button>
      </header>

      <div className="mt-3 flex flex-wrap items-baseline gap-3">
        {isLoading ? (
          <span className="text-sm text-muted-foreground">Loading…</span>
        ) : current?.amount == null ? (
          <span className="text-sm text-muted-foreground">
            No net income set yet for {monthKey}.
          </span>
        ) : (
          <>
            <span className="text-2xl font-semibold tabular-nums">
              {formatCurrency(current.amount)}
            </span>
            {current.from_period && current.from_period.effective_month !== monthKey ? (
              <span className="text-xs text-muted-foreground">
                in effect since {current.from_period.effective_month}
              </span>
            ) : null}
          </>
        )}
      </div>

      <div className="mt-3 text-xs">
        <button
          type="button"
          onClick={() => setHistoryOpen(o => !o)}
          className="text-muted-foreground underline-offset-2 hover:underline"
        >
          {historyOpen ? "Hide history" : "View history"}
        </button>
      </div>

      {historyOpen ? (
        <div className="mt-3 rounded-md border border-border">
          {historyQ.isLoading ? (
            <p className="p-3 text-xs text-muted-foreground">Loading history…</p>
          ) : (historyQ.data ?? []).length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">
              No net-income entries yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Effective month</TableHead>
                  <TableHead className="text-right">Take-home</TableHead>
                  <TableHead>Set on</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(historyQ.data ?? []).map(row => (
                  <TableRow key={row.id}>
                    <TableCell>{row.effective_month}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(row.take_home_amount)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(row.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      ) : null}

      <NetIncomeEditDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        defaultAmount={current?.amount ?? null}
        defaultMonth={monthKey}
        suggestion={suggestQ.data?.suggested_monthly_net ?? null}
        onSaved={() => {
          invalidate();
          setEditOpen(false);
        }}
      />
    </section>
  );
}

interface EditDialogProps {
  open: boolean;
  onClose: () => void;
  defaultAmount: number | null;
  defaultMonth: string;
  suggestion: number | null;
  onSaved: () => void;
}

function NetIncomeEditDialog({
  open,
  onClose,
  defaultAmount,
  defaultMonth,
  suggestion,
  onSaved
}: EditDialogProps) {
  const [amount, setAmount] = useState<string>("");
  const [month, setMonth] = useState<string>(defaultMonth);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmount(defaultAmount != null ? String(defaultAmount) : "");
    setMonth(defaultMonth);
    setError(null);
  }, [open, defaultAmount, defaultMonth]);

  const mutation = useMutation<NetIncomePeriod, Error, NetIncomeSetPayload>({
    mutationFn: setNetIncome,
    onSuccess: onSaved,
    onError: err => {
      setError(err instanceof ApiError ? err.message : "Failed to save net income");
    }
  });

  const parsedAmount = parseFloat(amount);
  const amountInvalid = !Number.isFinite(parsedAmount) || parsedAmount <= 0;
  const monthInvalid = !/^\d{4}-(0[1-9]|1[0-2])$/.test(month);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (amountInvalid || monthInvalid) return;
    mutation.mutate({ effective_month: month, take_home_amount: parsedAmount });
  };

  const handleApplySuggestion = () => {
    if (suggestion == null) return;
    setAmount(String(suggestion));
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Set monthly net income</DialogTitle>
            <DialogDescription>
              From the effective month forward (until you change it again),
              this take-home amount is the Conscious Spending Plan denominator.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {suggestion != null ? (
              <div className="rounded-md border border-border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">
                  Detected from your paychecks
                </p>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <span className="text-base font-semibold tabular-nums">
                    {formatCurrency(suggestion)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleApplySuggestion}
                  >
                    Use this
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <label htmlFor="ni-amount" className="text-sm font-medium">
                Take-home amount (monthly)
              </label>
              <Input
                id="ni-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="8500.00"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="ni-month" className="text-sm font-medium">
                Effective month
              </label>
              <Input
                id="ni-month"
                type="month"
                value={month}
                onChange={e => setMonth(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Applies to this month and every month after, until you set a
                new value.
              </p>
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending || amountInvalid || monthInvalid}
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
