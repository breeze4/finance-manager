/**
 * Typed fetch client for the /api/stats/monthly-pace endpoint
 * (Overview redesign — Step 1).
 *
 * Backend contract: `backend/app/routers/stats_router.py`. Wire format is
 * snake_case Pydantic; this module mirrors those names directly so the
 * page code reads `actual_mtd`, `expected_mtd`, etc., without translation
 * (matches the `csp.ts` style for new API clients).
 *
 * Step 1 emits ``mode = "pace"`` only. Step 5 will introduce
 * ``"actual_vs_budget"`` for arbitrary ranges; the type union here is
 * pre-positioned so consumers can branch on `mode` without a contract
 * change.
 */
import { API_BASE, request } from "./_client";

const BASE = `${API_BASE}/stats`;

export type CspBucket = "fixed" | "investments" | "savings" | "guilt_free";
export type PaceMode = "pace" | "actual_vs_budget";

export interface CategoryPaceRow {
  /** Null for the synthetic Uncategorized row. */
  category_id: number | null;
  category_name: string;
  /** One of the four CspBucket values, or null for Uncategorized. */
  bucket: CspBucket | null;
  actual_mtd: number;
  expected_mtd: number;
  full_budget: number;
}

export interface BucketPaceRollup {
  bucket: CspBucket;
  actual: number;
  expected: number;
  /** Full-month budget sum across this bucket's categories. */
  budget: number;
  /** Categories that belong to this bucket only. */
  categories: CategoryPaceRow[];
}

export interface PaceHeadline {
  actual_total: number;
  expected_total: number;
  /** actual_total - expected_total. Sign drives the headline copy. */
  variance: number;
}

export interface MonthlyPaceResponse {
  mode: PaceMode;
  headline: PaceHeadline;
  /** Always four entries, in canonical order: fixed, investments, savings, guilt_free. */
  buckets: BucketPaceRollup[];
  /** Flat list of every category included in the math, plus an
   *  Uncategorized synthetic row when relevant. */
  categories: CategoryPaceRow[];
  /** ISO YYYY-MM-DD; echoed back from the request. */
  date_from: string;
  /** ISO YYYY-MM-DD; echoed back from the request. */
  date_to: string;
}

export function getMonthlyPace({
  dateFrom,
  dateTo,
}: {
  dateFrom: string;
  dateTo: string;
}): Promise<MonthlyPaceResponse> {
  const url = `${BASE}/monthly-pace?date_from=${encodeURIComponent(
    dateFrom,
  )}&date_to=${encodeURIComponent(dateTo)}`;
  return request<MonthlyPaceResponse>(url);
}

// ---------------------------------------------------------------------------
// Spending-trend chart (Step 3)
// ---------------------------------------------------------------------------

export interface TrendMonth {
  /** "YYYY-MM" — stable string for Recharts XAxis dataKey. */
  month: string;
  /** Sum of non-transfer, non-pre-tax outflow magnitudes in the month
   *  (truncated to the requested range). Positive number. */
  actual: number;
  /** Sum of effective monthly budgets (override > baseline) for the same
   *  set of categories for the month. Always the FULL-month figure. */
  expected: number;
}

export interface SpendingTrendResponse {
  /** ISO YYYY-MM-DD; echoed back from the request. */
  date_from: string;
  /** ISO YYYY-MM-DD; echoed back from the request. */
  date_to: string;
  /** One entry per calendar month any of whose days falls in the range,
   *  in chronological order. Empty when the range is empty. */
  months: TrendMonth[];
}

export function getSpendingTrend({
  dateFrom,
  dateTo,
}: {
  dateFrom: string;
  dateTo: string;
}): Promise<SpendingTrendResponse> {
  const url = `${BASE}/spending-trend?date_from=${encodeURIComponent(
    dateFrom,
  )}&date_to=${encodeURIComponent(dateTo)}`;
  return request<SpendingTrendResponse>(url);
}
