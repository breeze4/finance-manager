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
import { API_BASE, request } from "./_client";

const BASE = `${API_BASE}/subscriptions`;

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

/**
 * One row in the remaining-subscriptions list.
 *
 * Mirrors `RemainingSubscription` in `backend/app/schemas/subscription.py`.
 * Frontend v1 only displays `total` and `count` from the parent response,
 * but the row shape is exposed for future detail surfacing.
 */
export interface RemainingSubscription {
  id: number;
  vendor: string;
  expected_date: string; // YYYY-MM-DD
  expected_amount: number;
  category_id: number | null;
  category_name: string;
}

export interface RemainingSubscriptionsResponse {
  total: number;
  count: number;
  subscriptions: RemainingSubscription[];
}

/**
 * Fetch active subscriptions whose next-expected-charge falls inside
 * `[dateFrom, dateTo]` and have not yet matched a transaction.
 *
 * The endpoint returns 204 No Content for ranges that aren't the
 * in-progress current month. `request<T>` resolves 204 to `undefined`,
 * which TanStack Query rejects as a queryFn return value, so we coerce
 * to `null` here. Callers branch on `null` to hide the dashboard card.
 */
export function getRemainingSubscriptions(args: {
  dateFrom: string;
  dateTo: string;
}): Promise<RemainingSubscriptionsResponse | null> {
  const qs = new URLSearchParams({
    date_from: args.dateFrom,
    date_to: args.dateTo,
  });
  return request<RemainingSubscriptionsResponse | undefined>(
    `${BASE}/remaining?${qs.toString()}`,
  ).then((data) => data ?? null);
}
