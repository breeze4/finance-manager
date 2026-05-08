/**
 * Typed fetch client for the /api/payments endpoints.
 *
 * Backend contract: `backend/app/routers/payment_router.py`. A
 * `PaymentMatchResponse` pairs a BECU checking debit (with raw description
 * containing "CHASE CREDIT CRD") to a Chase credit-card payment row. Field
 * names mirror the Pydantic schemas (snake_case) so the API boundary matches
 * the wire.
 *
 * The embedded transaction sub-shape is declared locally here as
 * `EmbeddedTransaction` rather than imported from `./transactions` — Step 6
 * (the Transactions page port) owns the canonical `Transaction` shape and
 * its camelCase adapter, and we don't want this page to depend on a
 * not-yet-finalised type. Snake_case stays at the API boundary; the
 * Payments page reads these fields directly without normalisation.
 */
import { API_BASE, request } from "./_client";

const BASE = `${API_BASE}/payments`;

export interface EmbeddedTransaction {
  id: number;
  account_id: number;
  account_name: string;
  date: string;
  raw_description: string;
  vendor: string;
  amount: number;
  category_id: number | null;
  category_name: string | null;
  type: string | null;
  is_transfer: boolean;
}

export interface PaymentMatchResponse {
  id: number;
  checking_transaction: EmbeddedTransaction;
  cc_transaction: EmbeddedTransaction;
  matched_at: string;
}

export interface PaymentDetectionResult {
  matches_found: number;
  total_matches: number;
}

export function listPayments(): Promise<PaymentMatchResponse[]> {
  return request<PaymentMatchResponse[]>(BASE);
}

export function detectPayments(): Promise<PaymentDetectionResult> {
  return request<PaymentDetectionResult>(`${BASE}/detect`, {
    method: "POST",
  });
}

export function unmatchPayment(matchId: number): Promise<void> {
  return request<void>(`${BASE}/${matchId}`, {
    method: "DELETE",
  });
}
