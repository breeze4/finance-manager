/**
 * Typed fetch client for the /api/subscriptions endpoints.
 *
 * Backend contract: `backend/app/routers/subscription_router.py`. Field names
 * mirror the Pydantic schemas (snake_case) so the API boundary matches the wire.
 *
 * `subscription_type` is `"fixed"` (low coefficient-of-variation) or
 * `"variable"` (everything else); the backend stores both kinds in one table
 * and the page splits them client-side. `amount` is set on fixed subs;
 * `amount_min`/`amount_max` are set on variable subs (`annual_estimate` is
 * always populated).
 */
import { request } from "./_client";

const BASE = "/api/subscriptions";

export interface SubscriptionResponse {
  id: number;
  vendor: string;
  frequency: string;
  subscription_type: string;
  amount: number | null;
  amount_min: number | null;
  amount_max: number | null;
  annual_estimate: number;
  last_charge_date: string;
  category_id: number | null;
  category_name: string | null;
  is_active: boolean;
  detected_at: string;
}

export interface SubscriptionUpdate {
  is_active?: boolean | null;
  category_id?: number | null;
}

export interface SubscriptionDetectionResult {
  subscriptions_found: number;
  total_active: number;
}

export function listSubscriptions(): Promise<SubscriptionResponse[]> {
  return request<SubscriptionResponse[]>(BASE);
}

export function detectSubscriptions(): Promise<SubscriptionDetectionResult> {
  return request<SubscriptionDetectionResult>(`${BASE}/detect`, {
    method: "POST",
  });
}

export function updateSubscription(
  id: number,
  payload: SubscriptionUpdate
): Promise<SubscriptionResponse> {
  return request<SubscriptionResponse>(`${BASE}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
