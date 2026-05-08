/**
 * Categories management page.
 *
 * Lists all categories (system + user-created) with their transaction count.
 * Inline switch toggles `exclude_from_budget`; transactions in flagged
 * categories are filtered from budget actuals, historical analysis, stats,
 * forecasts, and subscription detection — same surfaces that drop transfers.
 *
 * Inline controls:
 *   - Bucket dropdown : sets `csp_bucket` (Fixed/Investments/Savings/Guilt-Free
 *                       or — for none). Income, Transfers, and excluded
 *                       categories should stay at —.
 *   - Pre-tax switch  : sets `is_pre_tax` for categories whose dollars come
 *                       out of paychecks before deposit (e.g. 401(k)).
 *   - Exclude switch  : sets `exclude_from_budget`.
 *
 * Row actions:
 *   - Edit   : opens the form modal in edit mode (rename + flag).
 *   - Delete : only enabled when transaction_count === 0; backend returns 409
 *              if any transaction still references it.
 */

import { useEffect, useState } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
  type CategoryCreate,
  type CategoryResponse,
  type CategoryUpdate,
  type CspBucket
} from "@/api/categories";

const CATEGORIES_KEY = ["categories"] as const;

// Radix Select disallows the empty string as an item value, so we use a
// sentinel for "no bucket" and convert at the boundary.
const NO_BUCKET = "__none__";

const BUCKET_LABELS: Record<CspBucket, string> = {
  fixed: "Fixed",
  investments: "Investments",
  savings: "Savings",
  guilt_free: "Guilt-Free"
};

const BUCKET_ORDER: CspBucket[] = ["fixed", "investments", "savings", "guilt_free"];

type FormMode = "create" | "edit";

export default function Categories() {
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("create");
  const [editTarget, setEditTarget] = useState<CategoryResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CategoryResponse | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const qc = useQueryClient();
  const categoriesQ = useQuery<CategoryResponse[]>({
    queryKey: CATEGORIES_KEY,
    queryFn: listCategories
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: CATEGORIES_KEY });

  const createMut = useMutation<CategoryResponse, Error, CategoryCreate>({
    mutationFn: createCategory,
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
      setFormError(null);
    },
    onError: err => {
      setFormError(err instanceof ApiError ? err.message : "Failed to create category");
    }
  });

  const updateMut = useMutation<
    CategoryResponse,
    Error,
    { id: number; payload: CategoryUpdate }
  >({
    mutationFn: ({ id, payload }) => updateCategory(id, payload),
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
      setFormError(null);
    },
    onError: err => {
      setFormError(err instanceof ApiError ? err.message : "Failed to update category");
    }
  });

  // Inline updates use the same updateCategory call but don't open the modal,
  // so we keep the mutation result silent and let invalidate refresh the row.
  const inlineMut = useMutation<
    CategoryResponse,
    Error,
    { id: number; payload: CategoryUpdate }
  >({
    mutationFn: ({ id, payload }) => updateCategory(id, payload),
    onSuccess: () => invalidate()
  });

  const deleteMut = useMutation<void, Error, number>({
    mutationFn: deleteCategory,
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
      setDeleteError(null);
    },
    onError: err => {
      setDeleteError(err instanceof ApiError ? err.message : "Failed to delete category");
    }
  });

  const categories = categoriesQ.data ?? [];

  const openCreate = () => {
    setFormMode("create");
    setEditTarget(null);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (cat: CategoryResponse) => {
    setFormMode("edit");
    setEditTarget(cat);
    setFormError(null);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Categories</h2>
          <p className="text-sm text-muted-foreground">
            Manage transaction categories. Assign each spending category to a
            Conscious Spending Plan bucket (Fixed, Investments, Savings, or
            Guilt-Free). Mark categories whose dollars come out of paychecks
            before deposit as Pre-tax. Toggle "Exclude from budget" to drop a
            category from spending stats and budget actuals entirely.
          </p>
        </div>
        <Button onClick={openCreate}>New category</Button>
      </header>

      <div className="rounded-lg border border-border bg-card shadow-sm">
        {categoriesQ.isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading categories…</div>
        ) : categories.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            No categories yet. Click "New category" to add one.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Transactions</TableHead>
                <TableHead>Bucket</TableHead>
                <TableHead>Pre-tax</TableHead>
                <TableHead>Exclude from budget</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {c.is_system ? "System" : "Custom"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {c.transaction_count}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={c.csp_bucket ?? NO_BUCKET}
                      onValueChange={v => {
                        const next: CspBucket | null =
                          v === NO_BUCKET ? null : (v as CspBucket);
                        inlineMut.mutate({ id: c.id, payload: { csp_bucket: next } });
                      }}
                    >
                      <SelectTrigger
                        className="h-8 w-36"
                        aria-label={`Bucket for ${c.name}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_BUCKET}>—</SelectItem>
                        {BUCKET_ORDER.map(b => (
                          <SelectItem key={b} value={b}>
                            {BUCKET_LABELS[b]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={c.is_pre_tax}
                      onCheckedChange={v =>
                        inlineMut.mutate({ id: c.id, payload: { is_pre_tax: v } })
                      }
                      aria-label={`Mark ${c.name} as pre-tax`}
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={c.exclude_from_budget}
                      onCheckedChange={v =>
                        inlineMut.mutate({
                          id: c.id,
                          payload: { exclude_from_budget: v }
                        })
                      }
                      aria-label={`Exclude ${c.name} from budget`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={c.transaction_count > 0}
                        title={
                          c.transaction_count > 0
                            ? "Cannot delete: transactions still reference this category"
                            : undefined
                        }
                        onClick={() => {
                          setDeleteError(null);
                          setDeleteTarget(c);
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

      <CategoryFormModal
        open={formOpen}
        mode={formMode}
        category={editTarget}
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
            <DialogTitle>Delete category?</DialogTitle>
            <DialogDescription>
              Permanently delete "{deleteTarget?.name}". Only available when no
              transactions reference the category.
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
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

interface CategoryFormModalProps {
  open: boolean;
  mode: FormMode;
  category: CategoryResponse | null;
  submitting: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onSubmitCreate: (payload: CategoryCreate) => void;
  onSubmitUpdate: (id: number, payload: CategoryUpdate) => void;
}

function CategoryFormModal({
  open,
  mode,
  category,
  submitting,
  errorMessage,
  onCancel,
  onSubmitCreate,
  onSubmitUpdate
}: CategoryFormModalProps) {
  const [name, setName] = useState("");
  const [excludeFromBudget, setExcludeFromBudget] = useState(false);
  const [bucketValue, setBucketValue] = useState<string>(NO_BUCKET);
  const [isPreTax, setIsPreTax] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && category) {
      setName(category.name);
      setExcludeFromBudget(category.exclude_from_budget);
      setBucketValue(category.csp_bucket ?? NO_BUCKET);
      setIsPreTax(category.is_pre_tax);
    } else {
      setName("");
      setExcludeFromBudget(false);
      setBucketValue(NO_BUCKET);
      setIsPreTax(false);
    }
  }, [open, mode, category]);

  const trimmedName = name.trim();
  const nameInvalid = trimmedName.length === 0;
  const isSystem = mode === "edit" && category?.is_system;

  const bucketPayload = (): CspBucket | null =>
    bucketValue === NO_BUCKET ? null : (bucketValue as CspBucket);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "create") {
      if (nameInvalid) return;
      onSubmitCreate({
        name: trimmedName,
        exclude_from_budget: excludeFromBudget,
        csp_bucket: bucketPayload(),
        is_pre_tax: isPreTax
      });
    } else if (mode === "edit" && category) {
      // System categories cannot be renamed via this form — only the flags are patched.
      const payload: CategoryUpdate = {
        exclude_from_budget: excludeFromBudget,
        csp_bucket: bucketPayload(),
        is_pre_tax: isPreTax
      };
      if (!isSystem && trimmedName !== category.name) {
        if (nameInvalid) return;
        payload.name = trimmedName;
      }
      onSubmitUpdate(category.id, payload);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onCancel()}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {mode === "create" ? "New category" : "Edit category"}
            </DialogTitle>
            <DialogDescription>
              {mode === "create"
                ? "Create a category. Assign a Conscious Spending Plan bucket and mark it pre-tax if its dollars come out of paychecks before deposit. Use 'Exclude from budget' to keep its transactions out of spending analysis."
                : isSystem
                  ? "System categories cannot be renamed. You can still adjust the bucket, pre-tax flag, and budget-exclusion flag."
                  : "Rename or adjust the bucket, pre-tax flag, and budget-exclusion flag."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="cat-name" className="text-sm font-medium">
                Name
              </label>
              <Input
                id="cat-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Mortgage Payoff"
                autoFocus={!isSystem}
                disabled={isSystem ?? false}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="cat-bucket" className="text-sm font-medium">
                Bucket
              </label>
              <Select value={bucketValue} onValueChange={setBucketValue}>
                <SelectTrigger id="cat-bucket" aria-label="Bucket">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_BUCKET}>— (no bucket)</SelectItem>
                  {BUCKET_ORDER.map(b => (
                    <SelectItem key={b} value={b}>
                      {BUCKET_LABELS[b]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Leave blank for income, transfer-only, and excluded categories.
              </p>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Pre-tax</p>
                <p className="text-xs text-muted-foreground">
                  Dollars come out of paychecks before deposit (e.g. 401(k),
                  employer health premium).
                </p>
              </div>
              <Switch
                checked={isPreTax}
                onCheckedChange={setIsPreTax}
                aria-label="Pre-tax"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Exclude from budget</p>
                <p className="text-xs text-muted-foreground">
                  Filter this category out of budget actuals, stats, historical
                  analysis, forecasts, and subscription detection.
                </p>
              </div>
              <Switch
                checked={excludeFromBudget}
                onCheckedChange={setExcludeFromBudget}
                aria-label="Exclude from budget"
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
            <Button
              type="submit"
              disabled={submitting || (mode === "create" && nameInvalid)}
            >
              {mode === "create" ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
