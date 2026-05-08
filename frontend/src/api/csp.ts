/**
 * Typed fetch client for the /api/csp endpoints.
 *
 * Backend contract: `backend/app/routers/csp_router.py`. The wire format
 * is snake_case Pydantic; this module mirrors those names directly so
 * the page code can read fields like `unbucketed_categories` without an
 * extra adapter (matches `categories.ts` style; `budget.ts` is the
 * outlier with a name-keyed adapter, which we don't need here).
 *
 * Both `mode=planning` and `mode=actuals` are supported. The two share
 * the `BucketRollup` shape; on the actuals path the `planned_percentage`
 * and `tracking_status` fields are populated, on planning they are null.
 */
import { request } from "./_client";
import type { CspBucket } from "./categories";

const BASE = "/api/csp";

export type CspMode = "planning" | "actuals";
export type BucketStatus = "under" | "in-range" | "over";
/**
 * Actuals-only bucket-level tracking signal. Computed from the delta
 * between actual percentage and the planning rollup's percentage for the
 * same month (±2 percentage-point tolerance).
 */
export type TrackingStatus = "on-track" | "over-plan" | "under-plan";

export interface BucketRollup {
  bucket: CspBucket;
  numerator: number;
  denominator: number;
  /** Percent of denominator, 1 decimal (e.g. 50.0). */
  percentage: number;
  ramit_min: number;
  /** null for Investments — open-ended ceiling. */
  ramit_max: number | null;
  status: BucketStatus;
  /** True only for Investments when status==="over" — UI labels "over (ok)". */
  is_open_ended_over: boolean;
  /** Actuals only — the planning rollup's % for the same month. Null on planning. */
  planned_percentage: number | null;
  /** Actuals only — ±2 pt tolerance band against `planned_percentage`. Null on planning. */
  tracking_status: TrackingStatus | null;
}

export interface UnbucketedCategory {
  id: number;
  name: string;
}

export interface PlanningRollup {
  /** "YYYY-MM" string. */
  month: string;
  mode: CspMode;
  month_yyyymm: number;
  /** take_home + pre_tax_total, or 0 if no net-income period applies. */
  denominator: number;
  /** Take-home from net_income_service for this month, or null if unset. */
  take_home: number | null;
  /** Sum of all pre-tax category baselines (for tooltip composition). */
  pre_tax_total: number;
  has_net_income: boolean;
  /** Always four records, in canonical order: fixed, investments, savings, guilt_free. */
  buckets: BucketRollup[];
  /** Spending categories with NULL csp_bucket — UI surfaces a warning banner. */
  unbucketed_categories: UnbucketedCategory[];
}

/**
 * Same shape as `PlanningRollup` (the wire response is structurally
 * identical), but the buckets carry the actuals-mode `planned_percentage`
 * and `tracking_status` fields. Aliased so call-site types stay readable.
 */
export type ActualsRollup = PlanningRollup;

/** Fetch the planning-mode rollup for the given "YYYY-MM" month. */
export function getPlanningRollup(month: string): Promise<PlanningRollup> {
  const url = `${BASE}/rollup?month=${encodeURIComponent(month)}&mode=planning`;
  return request<PlanningRollup>(url);
}

/** Fetch the actuals-mode rollup for the given "YYYY-MM" month. */
export function getActualsRollup(month: string): Promise<ActualsRollup> {
  const url = `${BASE}/rollup?month=${encodeURIComponent(month)}&mode=actuals`;
  return request<ActualsRollup>(url);
}
