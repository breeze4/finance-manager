/**
 * Typed fetch client for the /api/forecast endpoints.
 *
 * Backend contract: `backend/app/routers/forecast_router.py`. Field names
 * mirror the Pydantic schemas (snake_case) so the API boundary matches the
 * wire.
 *
 * `MonthForecastResponse.status` is `"actual"` (past months), `"partial"`
 * (current month, has actual-to-date plus projected remainder), or
 * `"projected"` (future months). The Forecast page drives chart styling
 * (solid vs dashed) and table formatting off this field, not a date
 * comparison.
 *
 * `ForecastLineItemResponse.basis` describes how each line was derived. For
 * the SimpleForecaster the values are `"actual"`, `"partial"`, `"seasonal"`,
 * `"average"`, or `"subscription"`. Only `"subscription"` lines are exposed
 * as known recurring charges in the page UI.
 *
 * `YoYEntryResponse.annual_totals` is a `{ year: number → total: number }`
 * map. The backend pre-sorts results by sum-of-totals desc, so taking the
 * top N is just `.slice(0, N)`.
 */
import { request } from "./_client";

const BASE = "/api/forecast";

export interface ForecastLineItemResponse {
  category_id: number | null;
  category_name: string;
  amount: number;
  basis: string;
}

export interface MonthForecastResponse {
  month: number;
  status: "actual" | "partial" | "projected";
  total: number;
  line_items: ForecastLineItemResponse[];
}

export interface ForecastResponse {
  year: number;
  method: string;
  months: MonthForecastResponse[];
  annual_total: number;
}

export interface YoYEntryResponse {
  category_id: number | null;
  category_name: string;
  annual_totals: Record<string, number>;
}

export interface MethodsResponse {
  methods: string[];
}

export function getForecast(
  year: number,
  method?: string
): Promise<ForecastResponse> {
  const params = new URLSearchParams();
  if (method) params.set("method", method);
  const qs = params.toString();
  return request<ForecastResponse>(`${BASE}/${year}${qs ? `?${qs}` : ""}`);
}

export function getYoY(): Promise<YoYEntryResponse[]> {
  return request<YoYEntryResponse[]>(`${BASE}/yoy`);
}

export function getMethods(): Promise<MethodsResponse> {
  return request<MethodsResponse>(`${BASE}/methods`);
}
