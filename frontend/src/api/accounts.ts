/**
 * Typed fetch client for the /api/accounts endpoints.
 *
 * Backend contract: `backend/app/routers/account_router.py`. Errors surface
 * as thrown `ApiError` instances with the HTTP status preserved.
 */

const BASE = "/api/accounts";

export type AccountType =
  | "checking"
  | "savings"
  | "credit_card"
  | "brokerage"
  | "retirement"
  | "asset";

export const ACCOUNT_TYPES: AccountType[] = [
  "checking",
  "savings",
  "credit_card",
  "brokerage",
  "retirement",
  "asset"
];

export interface Account {
  id: number;
  name: string;
  type: AccountType;
  institution: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface AccountCreate {
  name: string;
  type: AccountType;
  institution?: string | null;
}

export interface AccountUpdate {
  name?: string;
  type?: AccountType;
  institution?: string | null;
}

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

export function listAccounts(includeArchived = false): Promise<Account[]> {
  const qs = includeArchived ? "?include_archived=true" : "";
  return request<Account[]>(`${BASE}${qs}`);
}

export function createAccount(payload: AccountCreate): Promise<Account> {
  return request<Account>(BASE, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateAccount(id: number, payload: AccountUpdate): Promise<Account> {
  return request<Account>(`${BASE}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function archiveAccount(id: number): Promise<void> {
  return request<void>(`${BASE}/${id}/archive`, { method: "POST" });
}

export function deleteAccount(id: number): Promise<void> {
  return request<void>(`${BASE}/${id}`, { method: "DELETE" });
}
