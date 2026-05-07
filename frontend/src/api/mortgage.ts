/**
 * Typed fetch client for Mortgage Payoff scenario endpoints.
 *
 * Backend contract: `backend/app/routers/mortgage_router.py`,
 * mounted at `/api/calculators/mortgage/scenarios`. Errors surface as
 * thrown `ApiError` instances with the HTTP status preserved so callers
 * (notably `useActiveScenario`) can swallow 404s as "no scenario yet".
 */

import { request } from "./_client";

export { ApiError } from "./_client";

const BASE = "/api/calculators/mortgage/scenarios";

export interface MortgageScenario {
  id: number;
  name: string;
  is_active: boolean;
  principal: number;
  years_left: number;
  interest_rate: number;
  monthly_payment: number;
  additional_monthly_payment: number;
  lump_sum_payment: number;
  investment_return_rate: number;
  investment_tax_rate: number;
  created_at: string;
  updated_at: string;
}

export interface MortgageScenarioCreate {
  name: string;
  principal: number;
  years_left: number;
  interest_rate: number;
  monthly_payment: number;
  additional_monthly_payment: number;
  lump_sum_payment: number;
  investment_return_rate: number;
  investment_tax_rate: number;
}

export type MortgageScenarioUpdate = Partial<MortgageScenarioCreate>;

export function listScenarios(): Promise<MortgageScenario[]> {
  return request<MortgageScenario[]>(BASE);
}

export function getActiveScenario(): Promise<MortgageScenario> {
  return request<MortgageScenario>(`${BASE}/active`);
}

export function getScenario(id: number): Promise<MortgageScenario> {
  return request<MortgageScenario>(`${BASE}/${id}`);
}

export function createScenario(payload: MortgageScenarioCreate): Promise<MortgageScenario> {
  return request<MortgageScenario>(BASE, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateScenario(
  id: number,
  payload: MortgageScenarioUpdate
): Promise<MortgageScenario> {
  return request<MortgageScenario>(`${BASE}/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function activateScenario(id: number): Promise<MortgageScenario> {
  return request<MortgageScenario>(`${BASE}/${id}/activate`, {
    method: "POST"
  });
}

export function deleteScenario(id: number): Promise<void> {
  return request<void>(`${BASE}/${id}`, { method: "DELETE" });
}
