/**
 * Typed fetch client for ``/api/payments``.
 *
 * Backend contract: ``backend/app/routers/payment_router.py``. Returns
 * positive-amount transactions on credit-card accounts, optionally
 * filtered by ``account_id`` / ``start_date`` / ``end_date``. Field names
 * mirror the wire (snake_case) since this list is rendered without
 * normalisation.
 */
import { API_BASE, request } from "./_client";

const BASE = `${API_BASE}/payments`;

export interface PaymentListItem {
  id: number;
  date: string;
  account_id: number;
  account_name: string;
  vendor: string;
  amount: number;
}

export interface ListPaymentsParams {
  accountId?: number | null;
  startDate?: string | null;
  endDate?: string | null;
}

export function listPayments(params: ListPaymentsParams = {}): Promise<PaymentListItem[]> {
  const qs = new URLSearchParams();
  if (params.accountId != null) qs.append("account_id", String(params.accountId));
  if (params.startDate) qs.append("start_date", params.startDate);
  if (params.endDate) qs.append("end_date", params.endDate);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return request<PaymentListItem[]>(`${BASE}${suffix}`);
}

export interface PaymentSeriesBucket {
  label: string;
  charges_total: number;
  payments_total: number;
}

export interface PaymentSeriesResponse {
  bucket_size: "month" | "quarter" | "year";
  buckets: PaymentSeriesBucket[];
}

export interface GetSeriesParams {
  accountId?: number | null;
  startDate?: string | null;
  endDate?: string | null;
}

export function getSeries(params: GetSeriesParams = {}): Promise<PaymentSeriesResponse> {
  const qs = new URLSearchParams();
  if (params.accountId != null) qs.append("account_id", String(params.accountId));
  if (params.startDate) qs.append("start_date", params.startDate);
  if (params.endDate) qs.append("end_date", params.endDate);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return request<PaymentSeriesResponse>(`${BASE}/series${suffix}`);
}
