/**
 * Accounts CRUD page.
 *
 * Lists every account row, with toggle for archived rows. Row actions:
 *   - Edit  : opens AccountFormModal in edit mode
 *   - Archive : confirms then sets is_archived=true (soft hide)
 *   - Delete : confirms with hard-delete warning; backend returns 409 if any
 *              transaction references the account
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AccountFormModal, type AccountFormMode } from "@/components/AccountFormModal";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  ApiError,
  archiveAccount,
  createAccount,
  deleteAccount,
  listAccounts,
  updateAccount,
  type Account,
  type AccountCreate,
  type AccountType,
  type AccountUpdate
} from "@/api/accounts";

const TYPE_LABELS: Record<AccountType, string> = {
  checking: "Checking",
  savings: "Savings",
  credit_card: "Credit card",
  brokerage: "Brokerage",
  retirement: "Retirement",
  asset: "Asset"
};

const ACCOUNTS_KEY = (includeArchived: boolean) =>
  ["accounts", { includeArchived }] as const;

export default function Accounts() {
  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<AccountFormMode>("create");
  const [editTarget, setEditTarget] = useState<Account | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Account | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const qc = useQueryClient();
  const accountsQ = useQuery<Account[]>({
    queryKey: ACCOUNTS_KEY(showArchived),
    queryFn: () => listAccounts(showArchived)
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["accounts"] });
  };

  const createMut = useMutation<Account, Error, AccountCreate>({
    mutationFn: createAccount,
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
      setFormError(null);
    },
    onError: err => {
      setFormError(err instanceof ApiError ? err.message : "Failed to create account");
    }
  });

  const updateMut = useMutation<Account, Error, { id: number; payload: AccountUpdate }>({
    mutationFn: ({ id, payload }) => updateAccount(id, payload),
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
      setFormError(null);
    },
    onError: err => {
      setFormError(err instanceof ApiError ? err.message : "Failed to update account");
    }
  });

  const archiveMut = useMutation<void, Error, number>({
    mutationFn: archiveAccount,
    onSuccess: () => {
      invalidate();
      setArchiveTarget(null);
    }
  });

  const deleteMut = useMutation<void, Error, number>({
    mutationFn: deleteAccount,
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
      setDeleteError(null);
    },
    onError: err => {
      setDeleteError(
        err instanceof ApiError ? err.message : "Failed to delete account"
      );
    }
  });

  const accounts = accountsQ.data ?? [];

  const openCreate = () => {
    setFormMode("create");
    setEditTarget(null);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (account: Account) => {
    setFormMode("edit");
    setEditTarget(account);
    setFormError(null);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Accounts</h2>
          <p className="text-sm text-muted-foreground">
            Manage the accounts that transactions and balance snapshots roll up to.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={e => setShowArchived(e.target.checked)}
            />
            Show archived
          </label>
          <Button onClick={openCreate}>New account</Button>
        </div>
      </header>

      <div className="rounded-lg border border-border bg-card shadow-sm">
        {accountsQ.isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading accounts…</div>
        ) : accounts.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            No accounts yet. Click "New account" to add one.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Institution</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map(a => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell>{TYPE_LABELS[a.type]}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {a.institution ?? "—"}
                  </TableCell>
                  <TableCell>
                    {a.is_archived ? (
                      <span className="text-xs text-muted-foreground">Archived</span>
                    ) : (
                      <span className="text-xs text-foreground">Active</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(a)}>
                        Edit
                      </Button>
                      {!a.is_archived && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setArchiveTarget(a)}
                        >
                          Archive
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleteTarget(a);
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <AccountFormModal
        open={formOpen}
        mode={formMode}
        account={editTarget}
        submitting={createMut.isPending || updateMut.isPending}
        errorMessage={formError}
        onCancel={() => {
          setFormOpen(false);
          setFormError(null);
        }}
        onSubmitCreate={payload => createMut.mutate(payload)}
        onSubmitUpdate={(id, payload) => updateMut.mutate({ id, payload })}
      />

      <Dialog
        open={archiveTarget !== null}
        onOpenChange={o => !o && setArchiveTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive account?</DialogTitle>
            <DialogDescription>
              Archiving "{archiveTarget?.name}" hides it from default lists but
              preserves linked transactions. You can unarchive later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setArchiveTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => archiveTarget && archiveMut.mutate(archiveTarget.id)}
              disabled={archiveMut.isPending}
            >
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={o => {
          if (!o) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete account?</DialogTitle>
            <DialogDescription>
              Permanently delete "{deleteTarget?.name}". This fails if any
              transactions still reference the account — archive instead.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p className="text-sm text-destructive">{deleteError}</p>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setDeleteTarget(null);
                setDeleteError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
              disabled={deleteMut.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
