/**
 * Typed fetch client for the /api/budget endpoints.
 *
 * Backend contract: `backend/app/routers/budget_router.py`. The wire format is
 * snake_case Pydantic; this module is the only place that touches those names.
 * The public surface (`BudgetState`, `BudgetEntry`, `CategoryHistoricalStats`,
 * etc.) is camelCase so the rest of the app never has to think about boundary
 * translation.
 *
 * Why the read adapter flattens to a `Record<categoryName, BudgetEntry>`:
 * The mockup-derived component code keys budgets by category *name* (it iterates
 * `Object.keys(budgets)` and looks up rows by name). The backend stores per
 * (category_id, year, month: int). The adapter converts `monthly_overrides` from
 * `{month: int, amount}[]` into `Record<"YYYY-MM", number>` so the page can
 * preserve its mockup-shaped data flow, while still exposing `categoryId` on
 * each entry so writes can target the right backend row.
 *
 * Mutations don't try to merge return values into a cache — call sites should
 * invalidate `["budget", { year }]` and `["budget", "actual", { year }]` and
 * let TanStack Query refetch. The query payloads are small.
 */

import { API_BASE, request } from "./_client";

const BASE = `${API_BASE}/budget`;

// ---- public types ----

export interface BudgetEntry {
  categoryId: number;
  categoryName: string;
  baselineMonthly: number;
  rolloverMode: boolean;
  /** Keyed by "YYYY-MM" within the queried year. */
  monthlyOverrides: Record<string, number>;
}

/** Keyed by category name (the mockup-shaped lookup the page uses). */
export type BudgetState = Record<string, BudgetEntry>;

export interface CategoryHistoricalStats {
  categoryId: number;
  categoryName: string;
  monthlyAverage: number;
  monthlyMedian: number;
  monthlyMin: number;
  monthlyMax: number;
  stdDev: number;
  coefficientOfVariation: number;
  confidenceIntervalLow: number;
  confidenceIntervalHigh: number;
  trend: "increasing" | "decreasing" | "stable";
  /** Months (1-12) flagged as seasonal spikes. */
  seasonalMonths: number[];
  monthsOfData: number;
  /** Keyed "YYYY-MM" → spend total. */
  monthlyTotals: Record<string, number>;
}

export interface ActualVsBudgetEntry {
  categoryId: number;
  categoryName: string;
  month: number;
  budgetTarget: number;
  actualSpend: number;
  /** Positive = under budget. */
  difference: number;
  percentage: number;
  /** CSP bucket of the underlying category, or null if unbucketed. */
  cspBucket: string | null;
  /** True for pre-tax categories — actualSpend mirrors budgetTarget. */
  isPreTax: boolean;
}

export interface MonthlyRollup {
  month: number;
  totalBudgeted: number;
  totalActual: number;
  difference: number;
  percentage: number;
}

export interface ActualVsBudgetResult {
  entries: ActualVsBudgetEntry[];
  monthlyRollups: MonthlyRollup[];
}

export interface BudgetSuggestion {
  categoryId: number;
  categoryName: string;
  baselineMonthly: number;
  /** Keyed by month number (1-12). */
  monthlySuggestions: Record<number, number>;
  basis: string;
}

// ---- private wire types + adapters ----

interface MonthlyOverrideRaw {
  month: number;
  amount: number;
}

interface BudgetResponseRaw {
  id: number;
  category_id: number;
  category_name: string | null;
  year: number;
  monthly_amount: number;
  rollover_mode: boolean;
  monthly_overrides: MonthlyOverrideRaw[];
  created_at: string;
  updated_at: string;
}

interface CategoryHistoricalStatsRaw {
  category_id: number;
  category_name: string;
  monthly_average: number;
  monthly_median: number;
  monthly_min: number;
  monthly_max: number;
  std_dev: number;
  coefficient_of_variation: number;
  confidence_interval_low: number;
  confidence_interval_high: number;
  trend: string;
  seasonal_months: number[];
  months_of_data: number;
  monthly_totals: Record<string, number>;
}

interface ActualVsBudgetEntryRaw {
  category_id: number;
  category_name: string;
  month: number;
  budget_target: number;
  actual_spend: number;
  difference: number;
  percentage: number;
  csp_bucket: string | null;
  is_pre_tax: boolean;
}

interface MonthlyRollupRaw {
  month: number;
  total_budgeted: number;
  total_actual: number;
  difference: number;
  percentage: number;
}

interface ActualVsBudgetResultRaw {
  entries: ActualVsBudgetEntryRaw[];
  monthly_rollups: MonthlyRollupRaw[];
}

interface BudgetSuggestionRaw {
  category_id: number;
  category_name: string;
  baseline_monthly: number;
  monthly_suggestions: Record<string, number>;
  basis: string;
}

function toBudgetEntry(raw: BudgetResponseRaw, year: number): BudgetEntry {
  const overrides: Record<string, number> = {};
  for (const o of raw.monthly_overrides) {
    const key = `${year}-${String(o.month).padStart(2, "0")}`;
    overrides[key] = o.amount;
  }
  return {
    categoryId: raw.category_id,
    categoryName: raw.category_name ?? `Category ${raw.category_id}`,
    baselineMonthly: raw.monthly_amount,
    rolloverMode: raw.rollover_mode,
    monthlyOverrides: overrides,
  };
}

function toBudgetState(raws: BudgetResponseRaw[], year: number): BudgetState {
  const out: BudgetState = {};
  for (const raw of raws) {
    const entry = toBudgetEntry(raw, year);
    out[entry.categoryName] = entry;
  }
  return out;
}

function toHistoricalStats(
  raw: CategoryHistoricalStatsRaw
): CategoryHistoricalStats {
  // Backend trend is a free string; constrain to the union the page renders.
  const trend: CategoryHistoricalStats["trend"] =
    raw.trend === "increasing" || raw.trend === "decreasing" ? raw.trend : "stable";
  return {
    categoryId: raw.category_id,
    categoryName: raw.category_name,
    monthlyAverage: raw.monthly_average,
    monthlyMedian: raw.monthly_median,
    monthlyMin: raw.monthly_min,
    monthlyMax: raw.monthly_max,
    stdDev: raw.std_dev,
    coefficientOfVariation: raw.coefficient_of_variation,
    confidenceIntervalLow: raw.confidence_interval_low,
    confidenceIntervalHigh: raw.confidence_interval_high,
    trend,
    seasonalMonths: raw.seasonal_months,
    monthsOfData: raw.months_of_data,
    monthlyTotals: raw.monthly_totals,
  };
}

function toActualVsBudget(raw: ActualVsBudgetResultRaw): ActualVsBudgetResult {
  return {
    entries: raw.entries.map((e) => ({
      categoryId: e.category_id,
      categoryName: e.category_name,
      month: e.month,
      budgetTarget: e.budget_target,
      actualSpend: e.actual_spend,
      difference: e.difference,
      percentage: e.percentage,
      cspBucket: e.csp_bucket,
      isPreTax: e.is_pre_tax,
    })),
    monthlyRollups: raw.monthly_rollups.map((m) => ({
      month: m.month,
      totalBudgeted: m.total_budgeted,
      totalActual: m.total_actual,
      difference: m.difference,
      percentage: m.percentage,
    })),
  };
}

function toSuggestion(raw: BudgetSuggestionRaw): BudgetSuggestion {
  // Pydantic serialises int dict keys as strings. Coerce back to numbers so
  // callers can index by month: 1..12.
  const monthly: Record<number, number> = {};
  for (const [k, v] of Object.entries(raw.monthly_suggestions)) {
    monthly[Number(k)] = v;
  }
  return {
    categoryId: raw.category_id,
    categoryName: raw.category_name,
    baselineMonthly: raw.baseline_monthly,
    monthlySuggestions: monthly,
    basis: raw.basis,
  };
}

// ---- public functions ----

export function getBudgets(year: number): Promise<BudgetState> {
  return request<BudgetResponseRaw[]>(`${BASE}?year=${year}`).then((raws) =>
    toBudgetState(raws, year)
  );
}

export function getHistorical(year?: number): Promise<CategoryHistoricalStats[]> {
  const qs = year != null ? `?year=${year}` : "";
  return request<CategoryHistoricalStatsRaw[]>(`${BASE}/historical${qs}`).then(
    (raws) => raws.map(toHistoricalStats)
  );
}

export function getActualVsBudget(year: number): Promise<ActualVsBudgetResult> {
  return request<ActualVsBudgetResultRaw>(`${BASE}/actual/${year}`).then(
    toActualVsBudget
  );
}

export function getSuggestions(year: number): Promise<BudgetSuggestion[]> {
  return request<BudgetSuggestionRaw[]>(`${BASE}/suggestions/${year}`).then(
    (raws) => raws.map(toSuggestion)
  );
}

export function setBudget(
  categoryId: number,
  year: number,
  payload: { monthlyAmount: number; rolloverMode: boolean }
): Promise<BudgetEntry> {
  const body = {
    monthly_amount: payload.monthlyAmount,
    rollover_mode: payload.rolloverMode,
  };
  return request<BudgetResponseRaw>(`${BASE}/${categoryId}/${year}`, {
    method: "PUT",
    body: JSON.stringify(body),
  }).then((raw) => toBudgetEntry(raw, year));
}

export function setMonthlyOverride(
  categoryId: number,
  year: number,
  month: number,
  amount: number
): Promise<{ month: number; amount: number }> {
  return request<MonthlyOverrideRaw>(
    `${BASE}/${categoryId}/${year}/${month}`,
    {
      method: "PUT",
      body: JSON.stringify({ amount }),
    }
  );
}

export function deleteMonthlyOverride(
  categoryId: number,
  year: number,
  month: number
): Promise<void> {
  return request<void>(`${BASE}/${categoryId}/${year}/${month}`, {
    method: "DELETE",
  });
}
