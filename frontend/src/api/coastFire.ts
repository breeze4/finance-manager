/**
 * Typed fetch client for Coast FIRE scenario endpoints.
 *
 * Backend contract: `backend/app/routers/coast_fire_router.py`,
 * mounted at `/api/calculators/coast-fire/scenarios`. Errors surface as
 * thrown `ApiError` instances with the HTTP status preserved so callers
 * (notably `useActiveScenario`) can swallow 404s as "no scenario yet".
 */

const BASE = "/api/calculators/coast-fire/scenarios";

export interface CoastFireScenario {
  id: number;
  name: string;
  is_active: boolean;
  current_age: number;
  retirement_age: number;
  current_savings: number;
  expected_return_rate: number;
  target_retirement_amount: number;
  monthly_expenses: number;
  yearly_expenses: number;
  withdrawal_rate: number;
  inflation_rate: number;
  use_real_returns: boolean;
  last_edited_field: "target" | "monthly" | "yearly";
  created_at: string;
  updated_at: string;
}

export interface CoastFireScenarioCreate {
  name: string;
  current_age: number;
  retirement_age: number;
  current_savings: number;
  expected_return_rate: number;
  target_retirement_amount: number;
  monthly_expenses: number;
  yearly_expenses: number;
  withdrawal_rate: number;
  inflation_rate: number;
  use_real_returns: boolean;
  last_edited_field: "target" | "monthly" | "yearly";
}

export type CoastFireScenarioUpdate = Partial<CoastFireScenarioCreate>;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const resp = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const body = await resp.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // keep statusText
    }
    throw new ApiError(resp.status, detail);
  }
  if (resp.status === 204) {
    return undefined as T;
  }
  return (await resp.json()) as T;
}

export function listScenarios(): Promise<CoastFireScenario[]> {
  return request<CoastFireScenario[]>(BASE);
}

export function getActiveScenario(): Promise<CoastFireScenario> {
  return request<CoastFireScenario>(`${BASE}/active`);
}

export function getScenario(id: number): Promise<CoastFireScenario> {
  return request<CoastFireScenario>(`${BASE}/${id}`);
}

export function createScenario(payload: CoastFireScenarioCreate): Promise<CoastFireScenario> {
  return request<CoastFireScenario>(BASE, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateScenario(
  id: number,
  payload: CoastFireScenarioUpdate
): Promise<CoastFireScenario> {
  return request<CoastFireScenario>(`${BASE}/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function activateScenario(id: number): Promise<CoastFireScenario> {
  return request<CoastFireScenario>(`${BASE}/${id}/activate`, {
    method: "POST"
  });
}

export function deleteScenario(id: number): Promise<void> {
  return request<void>(`${BASE}/${id}`, { method: "DELETE" });
}
