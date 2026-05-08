/**
 * Categories management page.
 *
 * Lists all categories (system + user-created) with their transaction count.
 * Inline switch toggles `exclude_from_budget`; transactions in flagged
 * categories are filtered from budget actuals, historical analysis, stats,
 * forecasts, and subscription detection — same surfaces that drop transfers.
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
  type CategoryUpdate
} from "@/api/categories";

const CATEGORIES_KEY = ["categories"] as const;

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

  // Inline-toggle uses the same updateCategory call but doesn't open the modal,
  // so we keep the mutation result silent and let invalidate refresh the row.
  const toggleMut = useMutation<
    CategoryResponse,
    Error,
    { id: number; exclude_from_budget: boolean }
  >({
    mutationFn: ({ id, exclude_from_budget }) =>
      updateCategory(id, { exclude_from_budget }),
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
            Manage transaction categories. Toggle "Exclude from budget" to hide
            a category from spending stats, budget actuals, historical analysis,
            and forecasts (e.g. mortgage payoff, principal-only payments).
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
                    <Switch
                      checked={c.exclude_from_budget}
                      onCheckedChange={v =>
                        toggleMut.mutate({ id: c.id, exclude_from_budget: v })
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

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && category) {
      setName(category.name);
      setExcludeFromBudget(category.exclude_from_budget);
    } else {
      setName("");
      setExcludeFromBudget(false);
    }
  }, [open, mode, category]);

  const trimmedName = name.trim();
  const nameInvalid = trimmedName.length === 0;
  const isSystem = mode === "edit" && category?.is_system;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "create") {
      if (nameInvalid) return;
      onSubmitCreate({ name: trimmedName, exclude_from_budget: excludeFromBudget });
    } else if (mode === "edit" && category) {
      // System categories cannot be renamed via this form — only the flag is patched.
      const payload: CategoryUpdate = { exclude_from_budget: excludeFromBudget };
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
                ? "Create a category. Mark it 'Exclude from budget' to keep its transactions out of spending analysis."
                : isSystem
                  ? "System categories cannot be renamed. You can still toggle the budget-exclusion flag."
                  : "Rename or toggle the budget-exclusion flag."}
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
