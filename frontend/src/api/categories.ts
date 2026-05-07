/**
 * Typed fetch client for the /api/categories endpoints.
 *
 * Backend contract: `backend/app/routers/category_router.py`. The response
 * shape is simple enough that we keep snake_case at the API boundary —
 * `is_system` and `transaction_count` are read directly by callers, no
 * camelCase adapter layer. Same convention as `subscriptions.ts`.
 */
import { request } from "./_client";

const BASE = "/api/categories";

export interface CategoryResponse {
  id: number;
  name: string;
  is_system: boolean;
  transaction_count: number;
}

export interface CategoryCreate {
  name: string;
}

export interface CategoryUpdate {
  name: string;
}

export function listCategories(): Promise<CategoryResponse[]> {
  return request<CategoryResponse[]>(BASE);
}

export function createCategory(payload: CategoryCreate): Promise<CategoryResponse> {
  return request<CategoryResponse>(BASE, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateCategory(
  id: number,
  payload: CategoryUpdate
): Promise<CategoryResponse> {
  return request<CategoryResponse>(`${BASE}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteCategory(id: number): Promise<void> {
  return request<void>(`${BASE}/${id}`, { method: "DELETE" });
}
