/**
 * Batch modal for entering manual balance snapshots.
 *
 * Renders one row per active account:
 *   - left: account name + small type badge
 *   - right: dollar input (no prefill — only a hint of the previous value)
 *
 * Inputs left blank are not submitted. The date picker defaults to today
 * but is editable for backdating. Save POSTs to `/api/snapshots/batch` and
 * closes on success.
 */

import { useEffect, useState } from "react";

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
import type { Account, AccountType } from "@/api/accounts";
import type { LatestBalance, SnapshotBatchEntry } from "@/api/snapshots";

const TYPE_LABELS: Record<AccountType, string> = {
  checking: "Checking",
  savings: "Savings",
  credit_card: "Credit card",
  brokerage: "Brokerage",
  retirement: "Retirement",
  asset: "Asset"
};

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatHintAmount(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export interface SnapshotBatchModalProps {
  open: boolean;
  onCancel: () => void;
  onSubmit: (asOfDate: string, entries: SnapshotBatchEntry[]) => void;
  accounts: Account[];
  latestBalances: LatestBalance[];
  submitting?: boolean;
  errorMessage?: string | null;
}

export function SnapshotBatchModal({
  open,
  onCancel,
  onSubmit,
  accounts,
  latestBalances,
  submitting = false,
  errorMessage = null
}: SnapshotBatchModalProps) {
  const [asOfDate, setAsOfDate] = useState<string>(todayIso());
  const [values, setValues] = useState<Record<number, string>>({});
  const [localError, setLocalError] = useState<string | null>(null);

  // Reset form when the modal opens.
  useEffect(() => {
    if (!open) return;
    setAsOfDate(todayIso());
    setValues({});
    setLocalError(null);
  }, [open]);

  const lastByAccount: Record<number, LatestBalance | undefined> = {};
  for (const lb of latestBalances) {
    lastByAccount[lb.account_id] = lb;
  }

  const activeAccounts = accounts.filter(a => !a.is_archived);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const entries: SnapshotBatchEntry[] = [];
    for (const a of activeAccounts) {
      const raw = (values[a.id] ?? "").trim();
      if (raw === "") continue;
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        setLocalError(`"${raw}" is not a valid number for ${a.name}`);
        return;
      }
      if (n < 0) {
        setLocalError(`Balance for ${a.name} must be 0 or greater`);
        return;
      }
      entries.push({ account_id: a.id, balance: n });
    }

    if (entries.length === 0) {
      setLocalError("Enter at least one balance to save.");
      return;
    }

    onSubmit(asOfDate, entries);
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Snapshot balances</DialogTitle>
            <DialogDescription>
              Enter today's balance for any account you want to record. Leave
              blank to skip.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="snap-date" className="text-sm font-medium">
                As of date
              </label>
              <Input
                id="snap-date"
                type="date"
                value={asOfDate}
                onChange={e => setAsOfDate(e.target.value)}
                max={todayIso()}
              />
            </div>

            <div className="space-y-3">
              {activeAccounts.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No active accounts. Add one on the Accounts page first.
                </p>
              )}
              {activeAccounts.map(a => {
                const last = lastByAccount[a.id];
                const inputId = `snap-bal-${a.id}`;
                return (
                  <div key={a.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <label
                        htmlFor={inputId}
                        className="flex flex-1 flex-col text-sm"
                      >
                        <span className="font-medium">{a.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {TYPE_LABELS[a.type]}
                        </span>
                      </label>
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground text-sm">$</span>
                        <Input
                          id={inputId}
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={values[a.id] ?? ""}
                          onChange={e =>
                            setValues(v => ({ ...v, [a.id]: e.target.value }))
                          }
                          className="w-32"
                        />
                      </div>
                    </div>
                    {last && last.balance != null && last.as_of_date && (
                      <p className="text-xs text-muted-foreground pl-1">
                        last: ${formatHintAmount(last.balance)} on{" "}
                        {last.as_of_date}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {(localError || errorMessage) && (
              <p className="text-sm text-destructive">
                {localError ?? errorMessage}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || activeAccounts.length === 0}
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
