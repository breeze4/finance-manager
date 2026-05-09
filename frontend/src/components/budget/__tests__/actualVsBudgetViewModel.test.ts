/**
 * Pure-function tests for the Actual-vs-Budget view-model. Mirrors the
 * style of `lib/math/__tests__/coastFire.test.ts`: literal fixtures, no
 * React, vitest only.
 *
 * Eight cases per the spec at
 * `docs/specs/2026-05-08-03-budget-page-split.md` →
 * "Testing Strategy" → "New unit tests".
 */
import { describe, it, expect } from "vitest";

import {
  buildActualByCatMonth,
  buildBucketSections,
  buildMonthAnnotations,
  buildVarianceRows,
  groupRowsByBucket,
  type RowsByBucket,
  type VarianceRow,
} from "../actualVsBudgetViewModel";
import type {
  ActualVsBudgetEntry,
  ActualVsBudgetResult,
  BudgetState,
} from "@/api/budget";
import type { ActualsRollup, BucketRollup } from "@/api/csp";

// ─── Fixture helpers ───────────────────────────────────────────────────────

function makeEntry(over: Partial<ActualVsBudgetEntry>): ActualVsBudgetEntry {
  return {
    categoryId: 0,
    categoryName: "",
    month: 1,
    budgetTarget: 0,
    actualSpend: 0,
    difference: 0,
    percentage: 0,
    cspBucket: null,
    isPreTax: false,
    ...over,
  };
}

function makeRow(over: Partial<VarianceRow>): VarianceRow {
  return {
    categoryId: 0,
    category: "",
    budget: 0,
    baseBudget: 0,
    carryover: 0,
    actual: 0,
    remaining: 0,
    pct: 0,
    rollover: false,
    ...over,
  };
}

function makeBucketRollup(over: Partial<BucketRollup>): BucketRollup {
  return {
    bucket: "fixed",
    numerator: 0,
    denominator: 0,
    percentage: 0,
    ramit_min: 0,
    ramit_max: 0,
    status: "in-range",
    is_open_ended_over: false,
    planned_percentage: null,
    tracking_status: null,
    ...over,
  };
}

// ─── buildVarianceRows ─────────────────────────────────────────────────────

describe("buildVarianceRows", () => {
  it("rollover-mode budget — server-applied carryover surfaces as carryover", () => {
    // Baseline 300, no March override; rolloverMode true; server returned
    // budgetTarget 350 (with the prior month's underspend rolled in).
    // actualSpend 200. Expected: baseBudget=300 (baseline), budget=350,
    // carryover=50 (effective - baseBudget), pct=round(200/350*100)=57,
    // remaining=150.
    const budgets: BudgetState = {
      Groceries: {
        categoryId: 101,
        categoryName: "Groceries",
        baselineMonthly: 300,
        rolloverMode: true,
        monthlyOverrides: {},
      },
    };
    const actual: ActualVsBudgetResult = {
      entries: [
        makeEntry({
          categoryId: 101,
          categoryName: "Groceries",
          month: 3,
          budgetTarget: 350,
          actualSpend: 200,
        }),
      ],
      monthlyRollups: [],
    };
    const lookup = buildActualByCatMonth(actual);
    const out = buildVarianceRows(budgets, lookup, "2026-03", 3);

    expect(out).toHaveLength(1);
    const r = out[0].row;
    expect(r.budget).toBe(350);
    expect(r.baseBudget).toBe(300);
    expect(r.carryover).toBe(50);
    expect(r.actual).toBe(200);
    expect(Math.round(r.pct)).toBe(57);
    expect(r.remaining).toBe(150);
  });

  it("explicit override no rollover — baseBudget tracks the override; no carryover", () => {
    // Override 500 for March, baseline 300, rolloverMode false. Server
    // returns budgetTarget 500 (just the override). Expected:
    // baseBudget=500, budget=500, carryover=0.
    const budgets: BudgetState = {
      Groceries: {
        categoryId: 101,
        categoryName: "Groceries",
        baselineMonthly: 300,
        rolloverMode: false,
        monthlyOverrides: { "2026-03": 500 },
      },
    };
    const actual: ActualVsBudgetResult = {
      entries: [
        makeEntry({
          categoryId: 101,
          categoryName: "Groceries",
          month: 3,
          budgetTarget: 500,
          actualSpend: 100,
        }),
      ],
      monthlyRollups: [],
    };
    const lookup = buildActualByCatMonth(actual);
    const out = buildVarianceRows(budgets, lookup, "2026-03", 3);

    const r = out[0].row;
    expect(r.baseBudget).toBe(500);
    expect(r.budget).toBe(500);
    expect(r.carryover).toBe(0);
  });

  it("actuals miss — actual=0, remaining=baseline, pct=0 (no NaN)", () => {
    // Category with no actual entry for the month. Effective falls back
    // to baseline. pct guards against divide-by-zero.
    const budgets: BudgetState = {
      Groceries: {
        categoryId: 101,
        categoryName: "Groceries",
        baselineMonthly: 250,
        rolloverMode: false,
        monthlyOverrides: {},
      },
    };
    const actual: ActualVsBudgetResult = {
      entries: [],
      monthlyRollups: [],
    };
    const lookup = buildActualByCatMonth(actual);
    const out = buildVarianceRows(budgets, lookup, "2026-03", 3);

    const r = out[0].row;
    expect(r.actual).toBe(0);
    expect(r.budget).toBe(250);
    expect(r.remaining).toBe(250);
    expect(r.pct).toBe(0);
    expect(Number.isNaN(r.pct)).toBe(false);
  });
});

// ─── groupRowsByBucket ─────────────────────────────────────────────────────

describe("groupRowsByBucket", () => {
  it("places null-bucket rows in `other`; valid buckets go to their group", () => {
    const rows = [
      { row: makeRow({ categoryId: 1, category: "Rent" }), bucket: "fixed" as const },
      { row: makeRow({ categoryId: 2, category: "401k" }), bucket: "investments" as const },
      { row: makeRow({ categoryId: 3, category: "Emergency" }), bucket: "savings" as const },
      { row: makeRow({ categoryId: 4, category: "Dining" }), bucket: "guilt_free" as const },
      { row: makeRow({ categoryId: 5, category: "Mystery" }), bucket: null },
    ];
    const out = groupRowsByBucket(rows);

    expect(out.groups.fixed.map((r) => r.categoryId)).toEqual([1]);
    expect(out.groups.investments.map((r) => r.categoryId)).toEqual([2]);
    expect(out.groups.savings.map((r) => r.categoryId)).toEqual([3]);
    expect(out.groups.guilt_free.map((r) => r.categoryId)).toEqual([4]);
    expect(out.other.map((r) => r.categoryId)).toEqual([5]);
  });

  it("preserves canonical bucket order in iteration regardless of input order", () => {
    const rows = [
      { row: makeRow({ categoryId: 4 }), bucket: "guilt_free" as const },
      { row: makeRow({ categoryId: 3 }), bucket: "savings" as const },
      { row: makeRow({ categoryId: 1 }), bucket: "fixed" as const },
      { row: makeRow({ categoryId: 2 }), bucket: "investments" as const },
    ];
    const out = groupRowsByBucket(rows);
    const order = Object.keys(out.groups);
    expect(order).toEqual(["fixed", "investments", "savings", "guilt_free"]);
  });
});

// ─── buildMonthAnnotations ─────────────────────────────────────────────────

describe("buildMonthAnnotations", () => {
  it("only emits annotations for months present in monthlyRollups", () => {
    const availableMonths = ["2026-01", "2026-02", "2026-03"];
    const monthlyRollups: ActualVsBudgetResult["monthlyRollups"] = [
      { month: 1, totalBudgeted: 1000, totalActual: 800, difference: 200, percentage: 80 },
      { month: 2, totalBudgeted: 1000, totalActual: 1100, difference: -100, percentage: 110 },
    ];
    const out = buildMonthAnnotations(availableMonths, monthlyRollups);
    expect(Object.keys(out).sort()).toEqual(["2026-01", "2026-02"]);
    expect(out["2026-03"]).toBeUndefined();
  });

  it("produces three distinct color buckets at under/near/over thresholds", () => {
    const availableMonths = ["2026-01", "2026-02", "2026-03"];
    const monthlyRollups: ActualVsBudgetResult["monthlyRollups"] = [
      // pct < 85: under (teal)
      { month: 1, totalBudgeted: 1000, totalActual: 500, difference: 500, percentage: 50 },
      // pct between 85 and 115 inclusive: near (amber)
      { month: 2, totalBudgeted: 1000, totalActual: 1000, difference: 0, percentage: 100 },
      // pct > 115: over (red)
      { month: 3, totalBudgeted: 1000, totalActual: 1500, difference: -500, percentage: 150 },
    ];
    const out = buildMonthAnnotations(availableMonths, monthlyRollups);
    expect(out["2026-01"].color).toBe("hsl(173, 40%, 50%)");
    expect(out["2026-02"].color).toBe("hsl(45, 90%, 50%)");
    expect(out["2026-03"].color).toBe("hsl(0, 60%, 50%)");
    expect(out["2026-01"].pct).toBe("50%");
    expect(out["2026-02"].pct).toBe("100%");
    expect(out["2026-03"].pct).toBe("150%");
    // Sign convention: diff = totalActual - totalBudgeted, then
    // sign = diff >= 0 ? "+" : "-". So an under-budget month has
    // diff < 0 → "-", and an over-budget month has diff > 0 → "+".
    expect(out["2026-01"].delta).toBe("-$500");
    expect(out["2026-02"].delta).toBe("+$0");
    expect(out["2026-03"].delta).toBe("+$500");
  });
});

// ─── buildBucketSections ──────────────────────────────────────────────────

describe("buildBucketSections", () => {
  it("omits buckets with no rows; emits sections for non-empty buckets in canonical order", () => {
    const rowsByBucket: RowsByBucket = {
      groups: {
        fixed: [makeRow({ categoryId: 1, budget: 1000, actual: 800 })],
        investments: [],
        savings: [makeRow({ categoryId: 2, budget: 200, actual: 50 })],
        guilt_free: [],
      },
      other: [],
    };
    const actualsRollup: ActualsRollup = {
      month: "2026-03",
      mode: "actuals",
      month_yyyymm: 202603,
      denominator: 4000,
      take_home: 4000,
      pre_tax_total: 0,
      has_net_income: true,
      buckets: [
        makeBucketRollup({ bucket: "fixed" }),
        makeBucketRollup({ bucket: "investments" }),
        makeBucketRollup({ bucket: "savings" }),
        makeBucketRollup({ bucket: "guilt_free" }),
      ],
      unbucketed_categories: [],
    };
    const out = buildBucketSections(rowsByBucket, actualsRollup);

    expect(out.map((s) => s.bucket)).toEqual(["fixed", "savings"]);
    expect(out[0].totalBudget).toBe(1000);
    expect(out[0].totalActual).toBe(800);
    expect(out[1].totalBudget).toBe(200);
    expect(out[1].totalActual).toBe(50);
  });
});
