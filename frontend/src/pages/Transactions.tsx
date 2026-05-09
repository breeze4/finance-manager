/**
 * Transactions page. Paginated list bound to `/api/transactions` with
 * server-side filters (search, category, date range...) and client-side
 * filtering only for things the API doesn't expose. Inline category-edit
 * and bulk-update mutations both invalidate the broad `["transactions"]`
 * key so dependent queries (Overview top-vendors, Payments candidates)
 * see the new state.
 *
 * Similar-transactions on row expand: extra `listTransactions({ vendor })`
 * query keyed by vendor name. Cheap to keep cached because the same
 * vendor is often re-expanded in a session.
 */

import { Fragment, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronDown, ChevronRight, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listCategories, type CategoryResponse } from "@/api/categories";
import {
  bulkUpdateTransactions,
  listTransactions,
  updateTransaction,
  type Transaction,
} from "@/api/transactions";
import { formatCurrency, formatDate } from "@/lib/format";
import { useGlobalFilters } from "@/hooks/useGlobalFilters";

const PAGE_SIZE = 25;
const ALL = "All";
const UNCLASSIFIED = "Unclassified";

type SortKey = "date" | "amount" | "vendor";
type SortDir = "asc" | "desc";

interface FilterState {
  search: string;
  category: string;
  page: number;
  sortBy: SortKey;
  sortDir: SortDir;
}

const INITIAL_FILTERS: FilterState = {
  search: "",
  category: ALL,
  page: 1,
  sortBy: "date",
  sortDir: "desc",
};

const DEFAULT_SORT_DIR: Record<SortKey, SortDir> = {
  date: "desc",
  amount: "desc",
  vendor: "asc",
};

function categoryQueryParam(
  category: string,
  categories: CategoryResponse[]
): { categoryId?: number; isUncategorized?: boolean } {
  if (category === ALL) return {};
  if (category === UNCLASSIFIED) return { isUncategorized: true };
  const match = categories.find((c) => c.name === category);
  return match ? { categoryId: match.id } : {};
}

function SortHeader({
  label,
  sortKey,
  active,
  dir,
  align,
  onToggle,
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  dir: SortDir;
  align: "left" | "right";
  onToggle: (k: SortKey) => void;
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onToggle(sortKey)}
      className={`inline-flex items-center gap-1 text-xs font-medium uppercase ${
        active ? "text-foreground" : "text-muted-foreground"
      } hover:text-foreground transition-colors ${
        align === "right" ? "flex-row-reverse" : ""
      }`}
    >
      <span>{label}</span>
      <Icon className="h-3 w-3" />
    </button>
  );
}

function SimilarTransactions({
  vendor,
  excludeId,
}: {
  vendor: string;
  excludeId: number;
}) {
  const q = useQuery({
    queryKey: ["transactions", "similar", vendor],
    queryFn: () => listTransactions({ vendor, pageSize: 5 }),
    enabled: vendor.length > 0,
  });
  const items = (q.data?.items ?? []).filter((t) => t.id !== excludeId).slice(0, 4);
  if (q.isLoading) {
    return <div className="text-xs text-muted-foreground">Loading…</div>;
  }
  if (items.length === 0) {
    return <div className="text-xs text-muted-foreground">No similar transactions.</div>;
  }
  return (
    <div className="mt-1 space-y-1">
      {items.map((s) => (
        <div
          key={s.id}
          className="flex justify-between text-xs py-1 px-2 rounded bg-card"
        >
          <span className="text-muted-foreground">{formatDate(s.date)}</span>
          <span className={s.amount < 0 ? "text-destructive" : "text-success"}>
            {formatCurrency(s.amount)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Transactions() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const { accountId, resolvedRange } = useGlobalFilters();
  const { dateFrom, dateTo } = resolvedRange;

  useEffect(() => {
    setFilters((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 }));
  }, [accountId, dateFrom, dateTo]);

  const categoriesQ = useQuery({
    queryKey: ["categories"],
    queryFn: listCategories,
  });
  const categoryList = categoriesQ.data ?? [];

  const queryParams = useMemo(() => {
    const params = categoryQueryParam(filters.category, categoryList);
    return {
      ...params,
      accountId: accountId ?? undefined,
      dateFrom,
      dateTo,
      search: filters.search.trim() || undefined,
      page: filters.page,
      pageSize: PAGE_SIZE,
      sortBy: filters.sortBy,
      sortDir: filters.sortDir,
    };
  }, [filters, categoryList, accountId, dateFrom, dateTo]);

  const toggleSort = (key: SortKey) => {
    setFilters((prev) => {
      if (prev.sortBy === key) {
        return { ...prev, sortDir: prev.sortDir === "asc" ? "desc" : "asc", page: 1 };
      }
      return { ...prev, sortBy: key, sortDir: DEFAULT_SORT_DIR[key], page: 1 };
    });
  };

  const txnsQ = useQuery({
    queryKey: ["transactions", "list", queryParams],
    queryFn: () => listTransactions(queryParams),
  });

  const unclassifiedQ = useQuery({
    queryKey: ["transactions", "unclassified-count", accountId],
    queryFn: () =>
      listTransactions({
        accountId: accountId ?? undefined,
        isUncategorized: true,
        page: 1,
        pageSize: 1,
      }),
  });
  const unclassifiedCount = unclassifiedQ.data?.total ?? 0;

  // After a category change, the backend returns vendorMatchCount of OTHER
  // unverified rows that share the vendor. We surface a one-click "apply to
  // those too" hint instead of doing it silently. Cleared on dismiss or after
  // the user accepts.
  const [vendorHint, setVendorHint] = useState<
    | {
        kind: "single";
        id: number;
        categoryId: number;
        categoryName: string;
        vendor: string;
        count: number;
      }
    | {
        kind: "bulk";
        ids: number[];
        categoryId: number;
        categoryName: string;
        count: number;
      }
    | null
  >(null);

  const updateM = useMutation({
    mutationFn: ({ id, categoryId, applyToVendor }: { id: number; categoryId: number | null; applyToVendor?: boolean }) =>
      updateTransaction(id, { categoryId, applyToVendor }),
    onSuccess: (result, variables) => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      // Only single-row category-set fires the hint. Clearing (categoryId=null)
      // and apply_to_vendor explicit-true paths skip it.
      if (
        variables.categoryId !== null &&
        !variables.applyToVendor &&
        result.vendorMatchCount > 0
      ) {
        const cat = categoryList.find((c) => c.id === variables.categoryId);
        if (cat) {
          setVendorHint({
            kind: "single",
            id: variables.id,
            categoryId: variables.categoryId,
            categoryName: cat.name,
            vendor: result.transaction.vendor,
            count: result.vendorMatchCount,
          });
        }
      } else {
        setVendorHint(null);
      }
    },
  });

  const bulkM = useMutation({
    mutationFn: ({ ids, categoryId, applyToVendor }: { ids: number[]; categoryId: number; applyToVendor?: boolean }) =>
      bulkUpdateTransactions({ ids, categoryId, applyToVendor }),
    onSuccess: (result, variables) => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      setSelectedRows(new Set());
      if (!variables.applyToVendor && result.vendorMatchCount > 0) {
        const cat = categoryList.find((c) => c.id === variables.categoryId);
        if (cat) {
          setVendorHint({
            kind: "bulk",
            ids: variables.ids,
            categoryId: variables.categoryId,
            categoryName: cat.name,
            count: result.vendorMatchCount,
          });
        }
      } else {
        setVendorHint(null);
      }
    },
  });

  const items: Transaction[] = txnsQ.data?.items ?? [];
  const total = txnsQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggleSelect = (id: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setPage = (p: number) =>
    setFilters((prev) => ({ ...prev, page: Math.max(1, Math.min(p, totalPages)) }));

  const handleCategoryChange = (id: number, value: string) => {
    if (value === UNCLASSIFIED) {
      updateM.mutate({ id, categoryId: null });
      return;
    }
    const match = categoryList.find((c) => c.name === value);
    if (!match) return;
    updateM.mutate({ id, categoryId: match.id });
  };

  const handleBulkAssign = (value: string) => {
    const match = categoryList.find((c) => c.name === value);
    if (!match) return;
    bulkM.mutate({ ids: Array.from(selectedRows), categoryId: match.id });
  };

  if (txnsQ.error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Failed to load transactions:{" "}
        {txnsQ.error instanceof Error ? txnsQ.error.message : String(txnsQ.error)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search vendor, description…"
            value={filters.search}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, search: e.target.value, page: 1 }))
            }
            className="pl-9 h-8 text-sm bg-secondary border-border"
          />
        </div>
        <Select
          value={filters.category}
          onValueChange={(v) =>
            setFilters((prev) => ({ ...prev, category: v, page: 1 }))
          }
        >
          <SelectTrigger className="w-[180px] h-8 text-xs bg-secondary border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Categories</SelectItem>
            <SelectItem value={UNCLASSIFIED}>Unclassified</SelectItem>
            {categoryList.map((c) => (
              <SelectItem key={c.id} value={c.name}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {unclassifiedCount > 0 && filters.category !== UNCLASSIFIED && (
          <Badge
            variant="outline"
            className="cursor-pointer border-warning text-warning hover:bg-warning/10"
            onClick={() =>
              setFilters((prev) => ({ ...prev, category: UNCLASSIFIED, page: 1 }))
            }
          >
            {unclassifiedCount} unclassified
          </Badge>
        )}
        {selectedRows.size > 0 && (
          <>
            <Badge variant="secondary" className="text-xs">
              {selectedRows.size} selected
            </Badge>
            <Select onValueChange={handleBulkAssign}>
              <SelectTrigger className="w-[180px] h-8 text-xs bg-secondary border-border">
                <SelectValue placeholder="Assign category…" />
              </SelectTrigger>
              <SelectContent>
                {categoryList.map((c) => (
                  <SelectItem key={c.id} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </div>

      {vendorHint ? (
        <div className="rounded-lg border border-border bg-secondary/60 p-3 text-sm flex items-center justify-between gap-3 flex-wrap">
          <span className="text-muted-foreground">
            {vendorHint.kind === "single" ? (
              <>
                Updated 1 transaction. Also reclassify <strong>{vendorHint.count}</strong> other
                unverified transaction{vendorHint.count === 1 ? "" : "s"} from{" "}
                <strong>{vendorHint.vendor}</strong> as{" "}
                <strong>{vendorHint.categoryName}</strong> and create a rule?
              </>
            ) : (
              <>
                Updated {vendorHint.ids.length} transactions. Also reclassify{" "}
                <strong>{vendorHint.count}</strong> other unverified transaction
                {vendorHint.count === 1 ? "" : "s"} from these vendors as{" "}
                <strong>{vendorHint.categoryName}</strong> and create rules?
              </>
            )}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setVendorHint(null)}
              disabled={updateM.isPending || bulkM.isPending}
            >
              Dismiss
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (vendorHint.kind === "single") {
                  updateM.mutate({
                    id: vendorHint.id,
                    categoryId: vendorHint.categoryId,
                    applyToVendor: true,
                  });
                } else {
                  bulkM.mutate({
                    ids: vendorHint.ids,
                    categoryId: vendorHint.categoryId,
                    applyToVendor: true,
                  });
                }
              }}
              disabled={updateM.isPending || bulkM.isPending}
            >
              Apply to all
            </Button>
          </div>
        </div>
      ) : null}

      {bulkM.error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          Bulk update failed:{" "}
          {bulkM.error instanceof Error ? bulkM.error.message : String(bulkM.error)}
        </div>
      ) : null}
      {updateM.error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          Category update failed:{" "}
          {updateM.error instanceof Error ? updateM.error.message : String(updateM.error)}
        </div>
      ) : null}

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="p-3 w-8"></th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase w-6"></th>
                <th className="p-3 text-left">
                  <SortHeader
                    label="Date"
                    sortKey="date"
                    active={filters.sortBy === "date"}
                    dir={filters.sortDir}
                    align="left"
                    onToggle={toggleSort}
                  />
                </th>
                <th className="p-3 text-left">
                  <SortHeader
                    label="Vendor"
                    sortKey="vendor"
                    active={filters.sortBy === "vendor"}
                    dir={filters.sortDir}
                    align="left"
                    onToggle={toggleSort}
                  />
                </th>
                <th className="p-3 text-right">
                  <SortHeader
                    label="Amount"
                    sortKey="amount"
                    active={filters.sortBy === "amount"}
                    dir={filters.sortDir}
                    align="right"
                    onToggle={toggleSort}
                  />
                </th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">Category</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase">Account</th>
                <th className="p-3 text-center text-xs font-medium text-muted-foreground uppercase w-12">✓</th>
              </tr>
            </thead>
            <tbody>
              {txnsQ.isLoading ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-sm text-muted-foreground">
                    Loading transactions…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-sm text-muted-foreground">
                    No transactions match the current filters.
                  </td>
                </tr>
              ) : (
                items.map((t, i) => (
                  <Fragment key={t.id}>
                    <tr
                      className={`border-b border-border cursor-pointer transition-colors hover:bg-secondary/30 ${
                        i % 2 === 0 ? "bg-card" : "bg-card/50"
                      }`}
                      onClick={() => setExpandedRow(expandedRow === t.id ? null : t.id)}
                    >
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedRows.has(t.id)}
                          onCheckedChange={() => toggleSelect(t.id)}
                        />
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {expandedRow === t.id ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground whitespace-nowrap">
                        {formatDate(t.date)}
                      </td>
                      <td className="p-3">
                        <div className="font-medium">{t.vendor}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {t.rawDescription}
                        </div>
                      </td>
                      <td
                        className={`p-3 text-right font-mono font-medium whitespace-nowrap ${
                          t.amount < 0 ? "text-destructive" : "text-success"
                        }`}
                      >
                        {formatCurrency(t.amount)}
                      </td>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={t.category || UNCLASSIFIED}
                          onValueChange={(v) => handleCategoryChange(t.id, v)}
                        >
                          <SelectTrigger className="h-7 text-xs bg-transparent border-0 hover:bg-secondary/40 px-2 w-auto min-w-[120px]">
                            <SelectValue>
                              {t.category ? (
                                <Badge variant="secondary" className="text-xs font-normal">
                                  {t.category}
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-xs border-warning/50 text-warning"
                                >
                                  —
                                </Badge>
                              )}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={UNCLASSIFIED}>—</SelectItem>
                            {categoryList.map((c) => (
                              <SelectItem key={c.id} value={c.name}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-xs font-normal">
                          {t.account}
                        </Badge>
                      </td>
                      <td className="p-3 text-center">
                        <Check
                          className={`h-4 w-4 mx-auto ${
                            t.verified ? "text-success" : "text-muted-foreground/30"
                          }`}
                        />
                      </td>
                    </tr>
                    {expandedRow === t.id && (
                      <tr className="bg-secondary/20">
                        <td colSpan={8} className="p-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                            <div>
                              <span className="text-muted-foreground">Raw Description</span>
                              <p className="mt-1 font-mono">{t.rawDescription}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Type</span>
                              <p className="mt-1">{t.type ?? "—"}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Post Date</span>
                              <p className="mt-1">{formatDate(t.postDate)}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Source</span>
                              <p className="mt-1">{t.sourceFile}</p>
                            </div>
                          </div>
                          <div className="mt-3">
                            <span className="text-xs text-muted-foreground">
                              Similar Transactions
                            </span>
                            <SimilarTransactions vendor={t.vendor} excludeId={t.id} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {total} transaction{total === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-2">
          <button
            className="px-2 py-1 rounded bg-secondary hover:bg-accent disabled:opacity-30"
            disabled={filters.page <= 1}
            onClick={() => setPage(filters.page - 1)}
          >
            Prev
          </button>
          <span>
            Page {filters.page} of {totalPages}
          </span>
          <button
            className="px-2 py-1 rounded bg-secondary hover:bg-accent disabled:opacity-30"
            disabled={filters.page >= totalPages}
            onClick={() => setPage(filters.page + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
