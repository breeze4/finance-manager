/**
 * Typed fetch client for the /api/net-income and /api/paycheck-detection
 * endpoints.
 *
 * Backend contract: `backend/app/routers/net_income_router.py`. Snake_case
 * is preserved at the boundary to match `categories.ts` / `subscriptions.ts`.
 *
 * `effective_month` and `month` cross the wire as `"YYYY-MM"` strings; the
 * backend stores them as a `YYYYMM` integer internally.
 */
import { request } from "./_client";

const BASE = "/api/net-income";
const PAYCHECK_BASE = "/api/paycheck-detection";

export interface NetIncomePeriod {
  id: number;
  effective_month: string; // "YYYY-MM"
  take_home_amount: number;
  created_at: string; // ISO8601
}

export interface NetIncomeForMonth {
  month: string; // "YYYY-MM"
  amount: number | null;
  from_period: NetIncomePeriod | null;
}

export interface NetIncomeSetPayload {
  effective_month: string; // "YYYY-MM"
  take_home_amount: number;
}

export interface PaycheckSuggestion {
  suggested_monthly_net: number | null;
}

export function getNetIncome(month: string): Promise<NetIncomeForMonth> {
  const url = `${BASE}?month=${encodeURIComponent(month)}`;
  return request<NetIncomeForMonth>(url);
}

export function setNetIncome(payload: NetIncomeSetPayload): Promise<NetIncomePeriod> {
  return request<NetIncomePeriod>(BASE, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function getNetIncomeHistory(): Promise<NetIncomePeriod[]> {
  return request<NetIncomePeriod[]>(`${BASE}/history`);
}

export function suggestMonthlyNet(): Promise<PaycheckSuggestion> {
  return request<PaycheckSuggestion>(`${PAYCHECK_BASE}/suggest`);
}

/** Today's month formatted as "YYYY-MM". */
export function currentMonthKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
