/**
 * Typed fetch client for the /api/stats endpoints.
 *
 * Backend contract: `backend/app/routers/stats_router.py`. Field names mirror
 * the Pydantic schemas (snake_case) so the API boundary matches the wire.
 *
 * Note on `savings_rate`: backend returns a fraction (0.0-1.0), not a percent.
 * Note on `total_spending` and `top_categories[].total`: positive (already
 * abs-d server-side). `MonthlyCategorySpending.total` is also positive.
 */

import { request } from "./_client";

const BASE = "/api/stats";

export interface CategorySummary {
  category_id: number | null;
  category_name: string;
  total: number;
  percentage: number;
}

export interface SummaryResponse {
  total_spending: number;
  total_income: number;
  savings_rate: number;
  transaction_count: number;
  top_categories: CategorySummary[];
}

export interface MonthlyCategorySpending {
  month: number;
  category_id: number | null;
  category_name: string;
  total: number;
}

export interface MonthlyStatsResponse {
  year: number;
  months: MonthlyCategorySpending[];
}

export function getSummary(
  dateFrom?: string | null,
  dateTo?: string | null
): Promise<SummaryResponse> {
  const params = new URLSearchParams();
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);
  const qs = params.toString();
  return request<SummaryResponse>(`${BASE}/summary${qs ? `?${qs}` : ""}`);
}

export function getMonthly(
  year: number,
  categoryId?: number | null
): Promise<MonthlyStatsResponse> {
  const params = new URLSearchParams({ year: String(year) });
  if (categoryId != null) params.set("category_id", String(categoryId));
  return request<MonthlyStatsResponse>(`${BASE}/monthly?${params.toString()}`);
}
