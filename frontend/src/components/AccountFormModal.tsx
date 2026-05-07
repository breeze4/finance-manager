/**
 * Create/edit modal for accounts. Used in both modes:
 *   - mode="create" : empty form, "Create" button submits a POST.
 *   - mode="edit"   : pre-populated from `account`, "Save" submits a PATCH.
 *
 * The parent owns the open state and the submit mutation. This component
 * focuses on form rendering and local validation only.
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  ACCOUNT_TYPES,
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

export type AccountFormMode = "create" | "edit";

export interface AccountFormModalProps {
  open: boolean;
  mode: AccountFormMode;
  account?: Account | null;
  onSubmitCreate?: (payload: AccountCreate) => void;
  onSubmitUpdate?: (id: number, payload: AccountUpdate) => void;
  onCancel: () => void;
  submitting?: boolean;
  errorMessage?: string | null;
}

export function AccountFormModal({
  open,
  mode,
  account,
  onSubmitCreate,
  onSubmitUpdate,
  onCancel,
  submitting = false,
  errorMessage = null
}: AccountFormModalProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("checking");
  const [institution, setInstitution] = useState("");

  // Reset form when the dialog opens or the account changes.
  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && account) {
      setName(account.name);
      setType(account.type);
      setInstitution(account.institution ?? "");
    } else {
      setName("");
      setType("checking");
      setInstitution("");
    }
  }, [open, mode, account]);

  const trimmedName = name.trim();
  const isValid = trimmedName.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    const cleanInstitution = institution.trim() === "" ? null : institution.trim();
    if (mode === "create" && onSubmitCreate) {
      onSubmitCreate({ name: trimmedName, type, institution: cleanInstitution });
    } else if (mode === "edit" && account && onSubmitUpdate) {
      onSubmitUpdate(account.id, {
        name: trimmedName,
        type,
        institution: cleanInstitution
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onCancel()}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {mode === "create" ? "New account" : "Edit account"}
            </DialogTitle>
            <DialogDescription>
              {mode === "create"
                ? "Add a new account. Linked transactions will use it via account ID."
                : "Update this account's name, type, or institution."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="acct-name" className="text-sm font-medium">
                Name
              </label>
              <Input
                id="acct-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Chase CC"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="acct-type" className="text-sm font-medium">
                Type
              </label>
              <Select value={type} onValueChange={v => setType(v as AccountType)}>
                <SelectTrigger id="acct-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map(t => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="acct-inst" className="text-sm font-medium">
                Institution (optional)
              </label>
              <Input
                id="acct-inst"
                value={institution}
                onChange={e => setInstitution(e.target.value)}
                placeholder="Chase"
              />
            </div>

            {errorMessage && (
              <p className="text-sm text-destructive">{errorMessage}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || submitting}>
              {mode === "create" ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
