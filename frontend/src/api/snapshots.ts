/**
 * Typed fetch client for the snapshot + net-worth endpoints.
 *
 * Backend contract: `backend/app/routers/snapshots_router.py`. Errors
 * surface as thrown `ApiError` instances with the HTTP status preserved.
 *
 * Plan 07 will add `getNetWorthSeries` here for the time-series chart.
 */

import type { AccountType } from "@/api/accounts";
import { API_BASE, request } from "./_client";

export { ApiError } from "./_client";

export interface SnapshotBatchEntry {
  account_id: number;
  balance: number | null;
  notes?: string | null;
}

export interface SnapshotBatchResponse {
  written: number;
}

export interface LatestBalance {
  account_id: number;
  account_name: string;
  account_type: AccountType;
  balance: number | null;
  as_of_date: string | null;
}

export function postSnapshotBatch(
  asOfDate: string,
  entries: SnapshotBatchEntry[]
): Promise<SnapshotBatchResponse> {
  return request<SnapshotBatchResponse>(`${API_BASE}/snapshots/batch`, {
    method: "POST",
    body: JSON.stringify({ as_of_date: asOfDate, entries })
  });
}

export function getLatestBalances(): Promise<LatestBalance[]> {
  return request<LatestBalance[]>(`${API_BASE}/net-worth/latest`);
}

export interface NetWorthPoint {
  date: string; // ISO YYYY-MM-DD from the backend
  net_worth: number;
}

export function getNetWorthSeries(
  startDate?: string | null,
  endDate?: string | null
): Promise<NetWorthPoint[]> {
  const params = new URLSearchParams();
  if (startDate) params.append("start_date", startDate);
  if (endDate) params.append("end_date", endDate);
  const qs = params.toString();
  return request<NetWorthPoint[]>(qs ? `${API_BASE}/net-worth?${qs}` : `${API_BASE}/net-worth`);
}
