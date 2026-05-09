/**
 * Typed fetch client for the /api/transactions endpoints.
 *
 * Backend contract: `backend/app/routers/transaction_router.py`. The wire
 * format is snake_case Pydantic; this module is the only place that touches
 * those names — the public surface (`Transaction`, `ListTransactionsParams`,
 * `TransactionUpdatePayload`, `BulkUpdatePayload`) is camelCase so the rest
 * of the app never has to think about boundary translation.
 *
 * Why the adapter normalises nullable fields:
 *   - `category_name` / `memo`: backend returns `null` for "unset"; the
 *     mockup component code relies on truthy checks (`t.category ? ... : ...`)
 *     and `.includes(...)` against `t.memo` for free-text search. Mapping
 *     `null → ""` keeps that idiom working without component-side guards.
 *   - `post_date`: nullable on the wire; the detail panel always wants a
 *     date to format, so we fall back to `date` when it's missing.
 */

import { API_BASE, request } from "./_client";

const BASE = `${API_BASE}/transactions`;

// ---- public camelCase Transaction (canonical app-wide shape) ----

export interface Transaction {
  id: number;
  date: string;
  vendor: string;
  rawDescription: string;
  memo: string;
  amount: number;
  category: string;
  categoryId: number | null;
  account: string;
  accountId: number;
  type: string | null;
  verified: boolean;
  isTransfer: boolean;
  postDate: string;
  sourceFile: string;
}

export interface PaginatedTransactionsResult {
  items: Transaction[];
  total: number;
  page: number;
  pageSize: number;
}

// ---- query params / payloads (camelCase in, snake_case to wire) ----

export interface ListTransactionsParams {
  accountId?: number;
  categoryId?: number;
  vendor?: string;
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
  isVerified?: boolean;
  isUncategorized?: boolean;
  isTransfer?: boolean;
  search?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface TransactionUpdatePayload {
  categoryId?: number | null;
  isVerified?: boolean;
  vendor?: string;
  memo?: string;
  /**
   * When true and ``categoryId`` is set, also reclassifies all other
   * unverified transactions matching the same vendor and creates/updates
   * a classification rule. Default false — change only the target row.
   */
  applyToVendor?: boolean;
}

export interface UpdateTransactionResult {
  transaction: Transaction;
  /** Count of OTHER unverified transactions matching the vendor that were
   * NOT touched (because ``applyToVendor`` was false). The UI uses this to
   * surface a hint offering to bulk-apply. Zero when ``applyToVendor`` was
   * true or when no siblings exist. */
  vendorMatchCount: number;
}

export interface BulkUpdatePayload {
  ids: number[];
  categoryId?: number | null;
  isVerified?: boolean;
  applyToVendor?: boolean;
}

export interface BulkUpdateResult {
  updated: number;
  /** See ``UpdateTransactionResult.vendorMatchCount``. */
  vendorMatchCount: number;
}

// ---- private wire types + adapter ----

interface TransactionResponseRaw {
  id: number;
  source_file: string;
  account_id: number;
  account_name: string;
  date: string;
  post_date: string | null;
  raw_description: string;
  vendor: string;
  amount: number;
  source_category: string | null;
  category_id: number | null;
  category_name: string | null;
  type: string | null;
  is_verified: boolean;
  is_transfer: boolean;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

interface PaginatedTransactionsRaw {
  items: TransactionResponseRaw[];
  total: number;
  page: number;
  page_size: number;
}

function toTransaction(raw: TransactionResponseRaw): Transaction {
  return {
    id: raw.id,
    date: raw.date,
    vendor: raw.vendor,
    rawDescription: raw.raw_description,
    memo: raw.memo ?? "",
    amount: raw.amount,
    category: raw.category_name ?? "",
    categoryId: raw.category_id,
    account: raw.account_name,
    accountId: raw.account_id,
    type: raw.type,
    verified: raw.is_verified,
    isTransfer: raw.is_transfer,
    postDate: raw.post_date ?? raw.date,
    sourceFile: raw.source_file,
  };
}

// ---- public functions ----

export function listTransactions(
  params: ListTransactionsParams = {}
): Promise<PaginatedTransactionsResult> {
  const qs = new URLSearchParams();
  if (params.accountId != null) qs.set("account_id", String(params.accountId));
  if (params.categoryId != null) qs.set("category_id", String(params.categoryId));
  if (params.vendor) qs.set("vendor", params.vendor);
  if (params.dateFrom) qs.set("date_from", params.dateFrom);
  if (params.dateTo) qs.set("date_to", params.dateTo);
  if (params.amountMin != null) qs.set("amount_min", String(params.amountMin));
  if (params.amountMax != null) qs.set("amount_max", String(params.amountMax));
  if (params.isVerified != null) qs.set("is_verified", String(params.isVerified));
  if (params.isUncategorized != null) qs.set("is_uncategorized", String(params.isUncategorized));
  if (params.isTransfer != null) qs.set("is_transfer", String(params.isTransfer));
  if (params.search) qs.set("search", params.search);
  if (params.sortBy) qs.set("sort_by", params.sortBy);
  if (params.sortDir) qs.set("sort_dir", params.sortDir);
  if (params.page != null) qs.set("page", String(params.page));
  if (params.pageSize != null) qs.set("page_size", String(params.pageSize));
  const query = qs.toString();
  return request<PaginatedTransactionsRaw>(
    `${BASE}${query ? `?${query}` : ""}`
  ).then((raw) => ({
    items: raw.items.map(toTransaction),
    total: raw.total,
    page: raw.page,
    pageSize: raw.page_size,
  }));
}

export function getTransaction(id: number): Promise<Transaction> {
  return request<TransactionResponseRaw>(`${BASE}/${id}`).then(toTransaction);
}

interface UpdateTransactionResultRaw {
  transaction: TransactionResponseRaw;
  vendor_match_count: number;
}

interface BulkUpdateResultRaw {
  updated: number;
  vendor_match_count: number;
}

export function updateTransaction(
  id: number,
  payload: TransactionUpdatePayload
): Promise<UpdateTransactionResult> {
  const body: Record<string, unknown> = {};
  if (payload.categoryId !== undefined) body.category_id = payload.categoryId;
  if (payload.isVerified !== undefined) body.is_verified = payload.isVerified;
  if (payload.vendor !== undefined) body.vendor = payload.vendor;
  if (payload.memo !== undefined) body.memo = payload.memo;
  if (payload.applyToVendor !== undefined) body.apply_to_vendor = payload.applyToVendor;
  return request<UpdateTransactionResultRaw>(`${BASE}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  }).then((raw) => ({
    transaction: toTransaction(raw.transaction),
    vendorMatchCount: raw.vendor_match_count,
  }));
}

export function bulkUpdateTransactions(
  payload: BulkUpdatePayload
): Promise<BulkUpdateResult> {
  const body: Record<string, unknown> = { ids: payload.ids };
  if (payload.categoryId !== undefined) body.category_id = payload.categoryId;
  if (payload.isVerified !== undefined) body.is_verified = payload.isVerified;
  if (payload.applyToVendor !== undefined) body.apply_to_vendor = payload.applyToVendor;
  return request<BulkUpdateResultRaw>(`${BASE}/bulk-update`, {
    method: "POST",
    body: JSON.stringify(body),
  }).then((raw) => ({
    updated: raw.updated,
    vendorMatchCount: raw.vendor_match_count,
  }));
}
