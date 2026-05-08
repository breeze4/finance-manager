/**
 * Shared fetch helper and `ApiError` class used by every typed client in
 * this directory. Resource-specific modules import `request` and `ApiError`
 * from here rather than inlining the same boilerplate.
 */

// Mirrors Vite's configured base path so dev (proxy) and prod (mounted at
// /finance/) both resolve to the right backend URL. Strips a trailing slash
// so callers can write `${API_BASE}/foo` without doubling the separator.
const RAW_BASE = (import.meta.env?.BASE_URL ?? "/").replace(/\/+$/, "");
export const API_BASE = `${RAW_BASE}/api`;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
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
