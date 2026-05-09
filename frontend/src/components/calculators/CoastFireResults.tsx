/**
 * Coast FIRE results panel.
 *
 * Eight result tiles, each wrapped in `MathTooltip`, plus two charts. Tooltip
 * copy (formula text, value substitution templates, educational explanations)
 * is ported verbatim from the Pinia store's `tooltipData` computed in
 * `legacy-vue-calc/src/stores/coastFire.ts` — DO NOT paraphrase.
 */

import { useMemo } from "react";

import { MathTooltip } from "@/components/calculators/MathTooltip";
import { ProjectionLineChart } from "@/components/calculators/charts/ProjectionLineChart";
import {
  adjustTargetForInflation,
  calculateAdditionalSavingsNeeded,
  calculateCoastFireAge,
  calculateCoastFireNumber,
  calculateExpensesFromTarget,
  calculateFutureValue,
  calculateRealReturnRate,
  calculateTargetFromMonthlyExpenses,
  calculateYearsToRetirement,
  coastFireProjectionToRecharts,
  generateCoastFireProjectionChart,
  generateRequiredSavingsByAgeChart,
  isCoastFireReady,
  requiredSavingsByAgeToRecharts,
  type FormulaValues
} from "@/lib/math";
import type { CoastFireScenarioCreate } from "@/api/coastFire";

type State = CoastFireScenarioCreate;

/* -------------------------------------------------------------------------- */
/* Derived values — mirror the Pinia store's computed properties.             */
/* -------------------------------------------------------------------------- */

export interface CoastFireDerived {
  yearsToRetirement: number;
  realReturnRate: number;
  effectiveReturnRate: number;
  futureValueOfCurrentSavings: number;
  targetFromMonthlyExpenses: number;
  targetFromYearlyExpenses: number;
  monthlyFromTarget: number;
  activeTargetAmount: number;
  inflationAdjustedTarget: number;
  isCoastFIREReady: boolean;
  additionalSavingsNeeded: number;
  coastFIREAge: number;
  coastFIRENumber: number;
}

export function computeCoastFireDerived(s: State): CoastFireDerived {
  const yearsToRetirement = calculateYearsToRetirement(s.current_age, s.retirement_age);

  const realReturnRate = s.use_real_returns
    ? calculateRealReturnRate(s.expected_return_rate / 100, s.inflation_rate / 100) * 100
    : s.expected_return_rate;

  const effectiveReturnRate = s.use_real_returns ? realReturnRate : s.expected_return_rate;

  const targetFromMonthlyExpenses =
    s.monthly_expenses <= 0 || s.withdrawal_rate <= 0
      ? 0
      : Math.round(
          calculateTargetFromMonthlyExpenses(s.monthly_expenses, s.withdrawal_rate / 100)
        );

  const targetFromYearlyExpenses =
    s.yearly_expenses <= 0 || s.withdrawal_rate <= 0
      ? 0
      : Math.round(s.yearly_expenses / (s.withdrawal_rate / 100));

  const monthlyFromTarget =
    s.target_retirement_amount <= 0 || s.withdrawal_rate <= 0
      ? 0
      : calculateExpensesFromTarget(
          s.target_retirement_amount,
          s.withdrawal_rate / 100
        ) / 12;

  let activeTargetAmount = s.target_retirement_amount;
  if (s.last_edited_field === "monthly" && s.monthly_expenses > 0) {
    activeTargetAmount = targetFromMonthlyExpenses;
  } else if (s.last_edited_field === "yearly" && s.yearly_expenses > 0) {
    activeTargetAmount = targetFromYearlyExpenses;
  }

  const inflationAdjustedTarget = s.use_real_returns
    ? activeTargetAmount
    : adjustTargetForInflation(
        activeTargetAmount,
        s.inflation_rate / 100,
        yearsToRetirement
      );

  const rate = effectiveReturnRate / 100;
  const futureValueOfCurrentSavings = calculateFutureValue(
    s.current_savings,
    rate,
    yearsToRetirement
  );

  const ready = isCoastFireReady(
    s.current_savings,
    inflationAdjustedTarget,
    rate,
    yearsToRetirement
  );

  const additionalSavingsNeeded = calculateAdditionalSavingsNeeded(
    s.current_savings,
    inflationAdjustedTarget,
    rate,
    yearsToRetirement
  );

  let coastFIREAge: number;
  if (ready) {
    coastFIREAge = s.current_age;
  } else if (s.current_savings <= 0) {
    coastFIREAge = s.current_age + 100;
  } else {
    try {
      coastFIREAge = calculateCoastFireAge(
        s.current_savings,
        inflationAdjustedTarget,
        rate,
        s.current_age
      );
    } catch {
      const yearsNeeded =
        Math.log(inflationAdjustedTarget / s.current_savings) / Math.log(1 + rate);
      coastFIREAge = Math.ceil(s.current_age + yearsNeeded);
    }
  }

  const coastFIRENumber = calculateCoastFireNumber(
    inflationAdjustedTarget,
    rate,
    yearsToRetirement
  );

  return {
    yearsToRetirement,
    realReturnRate,
    effectiveReturnRate,
    futureValueOfCurrentSavings,
    targetFromMonthlyExpenses,
    targetFromYearlyExpenses,
    monthlyFromTarget,
    activeTargetAmount,
    inflationAdjustedTarget,
    isCoastFIREReady: ready,
    additionalSavingsNeeded,
    coastFIREAge,
    coastFIRENumber
  };
}

/* -------------------------------------------------------------------------- */
/* Tooltip data — shape mirrors the Pinia store's tooltipData computed        */
/* exactly. Strings ported verbatim.                                          */
/* -------------------------------------------------------------------------- */

export interface CoastFireTooltipPayload {
  title: string;
  formula: string;
  values: FormulaValues;
  calculation: string | string[];
  result: string;
  explanation: string;
}

export type CoastFireTooltipKey =
  | "yearsToRetirement"
  | "realReturnRate"
  | "futureValue"
  | "inflationAdjustedTarget"
  | "coastFIREReady"
  | "additionalSavingsNeeded"
  | "coastFIRENumber"
  | "coastFIREAge"
  | "monthlyFromTarget";

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

export function coastFireTooltipData(
  s: State,
  d: CoastFireDerived
): Record<CoastFireTooltipKey, CoastFireTooltipPayload> {
  return {
    yearsToRetirement: {
      title: "Years to Retirement Calculation",
      formula: "Years = Retirement Age - Current Age",
      values: {
        retirementAge: s.retirement_age,
        currentAge: s.current_age,
        years: d.yearsToRetirement
      },
      calculation: "{retirementAge} - {currentAge} = {years} years",
      result: `${d.yearsToRetirement} years until retirement`,
      explanation: "Time available for compound growth to work on your investments."
    },

    realReturnRate: {
      title: "Fisher Equation (Real Returns)",
      formula: "Real Rate = (1 + nominal) ÷ (1 + inflation) - 1",
      values: {
        nominalRate: Math.round(s.expected_return_rate * 10) / 10,
        inflationRate: Math.round(s.inflation_rate * 10) / 10,
        realRate: Math.round(d.realReturnRate * 10) / 10
      },
      calculation: [
        "(1 + {nominalRate}) ÷ (1 + {inflationRate}) - 1",
        "= {realRateCalculation} - 1",
        "= {realRate}%"
      ],
      result: `${d.realReturnRate.toFixed(2)}% inflation-adjusted return`,
      explanation:
        "Why not simple subtraction? The Fisher equation accounts for the compounding interaction between inflation and returns."
    },

    futureValue: {
      title: "Future Value of Current Savings",
      formula: "FV = PV × (1 + r)^t",
      values: {
        currentSavings: s.current_savings,
        effectiveRate: Math.round(d.effectiveReturnRate * 10) / 10,
        years: d.yearsToRetirement,
        futureValue: Math.round(d.futureValueOfCurrentSavings),
        multiplier:
          Math.round(
            Math.pow(1 + d.effectiveReturnRate / 100, d.yearsToRetirement) * 1000
          ) / 1000
      },
      calculation: [
        "FV = {currentSavings} × (1 + {effectiveRate})^{years}",
        "= {currentSavings} × {multiplier}",
        "= {futureValue}"
      ],
      result: `Your current savings will grow to ${usd(d.futureValueOfCurrentSavings)}`,
      explanation: "Compound interest allows your money to grow exponentially over time."
    },

    inflationAdjustedTarget: {
      title: s.use_real_returns
        ? "Target Amount (Real Returns)"
        : "Inflation-Adjusted Target",
      formula: s.use_real_returns
        ? "Target = Original Target (no adjustment needed)"
        : "Adjusted Target = Original × (1 + inflation)^years",
      values: {
        originalTarget: d.activeTargetAmount,
        inflationRate: Math.round(s.inflation_rate * 10) / 10,
        years: d.yearsToRetirement,
        adjustedTarget: d.inflationAdjustedTarget
      },
      calculation: s.use_real_returns
        ? ["Target remains {originalTarget} (using real returns)"]
        : [
            "Adjusted = {originalTarget} × (1 + {inflationRate})^{years}",
            "= {originalTarget} × {inflationMultiplier}",
            "= {adjustedTarget}"
          ],
      result: `Target: ${usd(d.inflationAdjustedTarget)}`,
      explanation: s.use_real_returns
        ? "Using real returns, so target stays in today's purchasing power."
        : "Target adjusted for inflation to maintain purchasing power at retirement."
    },

    coastFIREReady: {
      title: "Coast FIRE Ready Check",
      formula: "Coast FIRE Ready = Future Value ≥ Target Amount",
      values: {
        futureValue: d.futureValueOfCurrentSavings,
        target: d.inflationAdjustedTarget,
        isReady: d.isCoastFIREReady ? 1 : 0,
        comparisonResult: d.isCoastFIREReady ? "TRUE" : "FALSE"
      },
      calculation: ["{futureValue} ≥ {target}", "= {comparisonResult}"],
      result: d.isCoastFIREReady
        ? "YES - You are Coast FIRE ready!"
        : "NO - Not Coast FIRE ready yet",
      explanation: d.isCoastFIREReady
        ? "Your current savings will grow enough to meet your retirement goal."
        : "You need to save more to let compound interest reach your target."
    },

    additionalSavingsNeeded: {
      title: "Additional Savings Needed Now",
      formula: "Additional Needed = Target Present Value - Current Savings",
      values: {
        targetPV: d.coastFIRENumber,
        currentSavings: s.current_savings,
        additional: d.additionalSavingsNeeded
      },
      calculation: [
        "Target Present Value = {targetPV}",
        "Additional Needed = {targetPV} - {currentSavings}",
        "= {additional}"
      ],
      result: d.isCoastFIREReady
        ? "No additional savings needed!"
        : `Save ${usd(d.additionalSavingsNeeded)} more today`,
      explanation:
        "This is the lump sum you need to add today to reach Coast FIRE immediately."
    },

    coastFIRENumber: {
      title: "Coast FIRE Number at Current Age",
      formula: "Coast FIRE Number = Target ÷ (1 + r)^t",
      values: {
        target: d.inflationAdjustedTarget,
        rate: Math.round(d.effectiveReturnRate * 10) / 10,
        years: d.yearsToRetirement,
        coastNumber: d.coastFIRENumber,
        divisor:
          Math.round(
            Math.pow(1 + d.effectiveReturnRate / 100, d.yearsToRetirement) * 1000
          ) / 1000
      },
      calculation: [
        "Coast FIRE Number = {target} ÷ (1 + {rate})^{years}",
        "= {target} ÷ {divisor}",
        "= {coastNumber}"
      ],
      result: `${usd(d.coastFIRENumber)} needed at age ${s.current_age}`,
      explanation:
        "This is the exact amount you need saved right now to coast to your retirement goal with compound growth."
    },

    coastFIREAge: {
      title: "Coast FIRE Age Calculation",
      formula: d.isCoastFIREReady
        ? "Already Coast FIRE ready at current age"
        : "Years Needed = ln(Target ÷ Current) ÷ ln(1 + r)",
      values: {
        currentAge: s.current_age,
        target: d.inflationAdjustedTarget,
        currentSavings: s.current_savings,
        rate: Math.round(d.effectiveReturnRate * 10) / 10,
        coastAge: d.coastFIREAge
      },
      calculation: d.isCoastFIREReady
        ? ["You are already Coast FIRE ready!"]
        : [
            "Years = ln({target} ÷ {currentSavings}) ÷ ln(1 + {rate})",
            "= ln({ratio}) ÷ ln({onePlusRate})",
            "= {yearsNeeded} years",
            "Coast FIRE Age = {currentAge} + {yearsNeeded} = {coastAge}"
          ],
      result: d.isCoastFIREReady
        ? `Coast FIRE ready now at age ${s.current_age}`
        : `Coast FIRE ready at age ${d.coastFIREAge}`,
      explanation: d.isCoastFIREReady
        ? "Your current savings are sufficient to reach your retirement goal."
        : "Age when your current savings (with no additions) will be enough to coast to retirement."
    },

    monthlyFromTarget: {
      title: "Monthly Spending from Target",
      formula: "Monthly = (Target × Withdrawal Rate) ÷ 12",
      values: {
        target: s.target_retirement_amount,
        withdrawalRate: Math.round(s.withdrawal_rate * 10) / 10,
        monthly: d.monthlyFromTarget
      },
      calculation: [
        "Monthly = ({target} × {withdrawalRate}%) ÷ 12",
        "= ({target} × {withdrawalRateDecimal}) ÷ 12",
        "= {annualWithdrawal} ÷ 12",
        "= {monthly}"
      ],
      result: `${usd(d.monthlyFromTarget)} available monthly`,
      explanation: `Based on the ${s.withdrawal_rate}% safe withdrawal rate from your target portfolio.`
    }
  };
}

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

export interface CoastFireResultsProps {
  state: State;
}

const formatPct = (n: number) => `${n}%`;

export function CoastFireResults({ state }: CoastFireResultsProps) {
  const derived = useMemo(() => computeCoastFireDerived(state), [state]);
  const tooltips = useMemo(() => coastFireTooltipData(state, derived), [state, derived]);

  const projectionRows = useMemo(() => {
    // Guard against invariant-violating intermediate states while the user
    // is mid-typing inputs (e.g. typing "40" into current age while
    // retirement age is still 30). The chart fn throws on those; bail to an
    // empty series until inputs are consistent.
    if (state.current_savings < 0) return [];
    if (state.current_age < 0) return [];
    if (state.retirement_age < state.current_age) return [];
    const chart = generateCoastFireProjectionChart(
      state.current_savings,
      state.current_age,
      state.retirement_age,
      derived.effectiveReturnRate / 100,
      derived.activeTargetAmount,
      state.inflation_rate / 100,
      state.use_real_returns
    );
    return coastFireProjectionToRecharts(chart);
  }, [state, derived]);

  const requiredSavingsRows = useMemo(() => {
    if (derived.activeTargetAmount <= 0) return [];
    if (state.retirement_age <= 0) return [];
    const chart = generateRequiredSavingsByAgeChart(
      derived.activeTargetAmount,
      state.retirement_age,
      derived.effectiveReturnRate / 100,
      state.inflation_rate / 100,
      state.use_real_returns
    );
    return requiredSavingsByAgeToRecharts(chart);
  }, [state, derived]);

  const showRealReturnRate = state.use_real_returns && state.inflation_rate > 0;
  const showCoastFireAge = !derived.isCoastFIREReady;
  const showMonthlySpending = state.target_retirement_amount > 0;

  return (
    <div className="space-y-6">
      <h3 className="text-base font-semibold">Results</h3>

      <div
        className={`rounded border-l-4 p-4 ${
          derived.isCoastFIREReady
            ? "border-green-500 bg-green-500/5"
            : "border-destructive bg-destructive/5"
        }`}
      >
        <h4 className="mb-1 text-sm font-semibold">Coast FIRE Status</h4>
        <MathTooltip {...tooltips.coastFIREReady}>
          <span className="text-base font-medium">
            {derived.isCoastFIREReady
              ? "You are Coast FIRE ready!"
              : "Not Coast FIRE ready yet"}
          </span>
        </MathTooltip>
      </div>

      <ResultRow label="Years to Retirement:">
        <MathTooltip {...tooltips.yearsToRetirement}>
          <span className="numeric font-semibold">{derived.yearsToRetirement} years</span>
        </MathTooltip>
      </ResultRow>

      {showRealReturnRate && (
        <ResultRow label="Real Return Rate:">
          <MathTooltip {...tooltips.realReturnRate}>
            <span className="numeric font-semibold">
              {formatPct(Number(derived.realReturnRate.toFixed(2)))}
            </span>
          </MathTooltip>
        </ResultRow>
      )}

      <ResultRow label="Future Value of Current Savings:">
        <MathTooltip {...tooltips.futureValue}>
          <span className="numeric font-semibold">
            {usd(derived.futureValueOfCurrentSavings)}
          </span>
        </MathTooltip>
      </ResultRow>

      <ResultRow
        label={`Target Retirement Amount${
          !state.use_real_returns ? " (Today's $)" : ""
        }:`}
      >
        <MathTooltip {...tooltips.inflationAdjustedTarget}>
          <span className="numeric font-semibold">{usd(derived.activeTargetAmount)}</span>
        </MathTooltip>
      </ResultRow>

      {showMonthlySpending && (
        <ResultRow label="Monthly Spending Available:">
          <MathTooltip {...tooltips.monthlyFromTarget}>
            <span className="numeric font-semibold">{usd(derived.monthlyFromTarget)}</span>
          </MathTooltip>
        </ResultRow>
      )}

      {!derived.isCoastFIREReady && (
        <ResultRow label="Additional Savings Needed Now:">
          <MathTooltip {...tooltips.additionalSavingsNeeded}>
            <span className="numeric font-semibold text-destructive">
              {usd(derived.additionalSavingsNeeded)}
            </span>
          </MathTooltip>
        </ResultRow>
      )}

      {showCoastFireAge && (
        <ResultRow label="Coast FIRE Age:">
          <MathTooltip {...tooltips.coastFIREAge}>
            <span className="numeric font-semibold">{derived.coastFIREAge} years old</span>
          </MathTooltip>
        </ResultRow>
      )}

      <ResultRow label="Coast FIRE Number at Current Age:">
        <MathTooltip {...tooltips.coastFIRENumber}>
          <span className="numeric font-semibold">{usd(derived.coastFIRENumber)}</span>
        </MathTooltip>
      </ResultRow>

      <div className="space-y-2 pt-4">
        <h4 className="text-sm font-semibold">Savings Projection</h4>
        <ProjectionLineChart
          data={projectionRows as unknown as Record<string, unknown>[]}
          xKey="age"
          valueKey="value"
          targetKey="target"
          valueLabel="Projected savings"
          targetLabel="Target"
          valueFormatter={usd}
        />
      </div>

      <div className="space-y-2 pt-2">
        <h4 className="text-sm font-semibold">Required Savings by Age</h4>
        <ProjectionLineChart
          data={requiredSavingsRows as unknown as Record<string, unknown>[]}
          xKey="age"
          valueKey="requiredSavings"
          valueLabel="Required savings"
          valueFormatter={usd}
        />
      </div>
    </div>
  );
}

interface ResultRowProps {
  label: string;
  children: React.ReactNode;
}

function ResultRow({ label, children }: ResultRowProps) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span>{children}</span>
    </div>
  );
}
