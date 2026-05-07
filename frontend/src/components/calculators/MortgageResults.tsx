/**
 * Mortgage Payoff results panel.
 *
 * Ten result tiles, each wrapped in `MathTooltip`, plus three charts. Tooltip
 * copy (formula text, value substitution templates, educational explanations)
 * is ported verbatim from the Pinia store's `tooltipData` computed in
 * `legacy-vue-calc/src/stores/mortgagePayoff.ts` — DO NOT paraphrase.
 */

import { useMemo } from "react";

import { MathTooltip } from "@/components/calculators/MathTooltip";
import { ComparisonLineChart } from "@/components/calculators/charts/ComparisonLineChart";
import {
  calculateAfterTaxReturn,
  calculateInvestmentValue,
  calculateMonthlyRate,
  calculatePayoff,
  determineBetterStrategy,
  generateInterestComparisonChart,
  generateInvestmentComparisonChart,
  generateMortgageBalanceChart,
  interestComparisonToRecharts,
  investmentComparisonToRecharts,
  mortgageBalanceToRecharts,
  type FormulaValues
} from "@/lib/math";
import type { MortgageScenarioCreate } from "@/api/mortgage";

type State = MortgageScenarioCreate;

/* -------------------------------------------------------------------------- */
/* Derived values — mirror the Pinia store's computed properties.             */
/* -------------------------------------------------------------------------- */

export interface MortgageDerived {
  monthlyInterestRate: number;
  totalMonths: number;
  basePayoffMonths: number;
  baseTotalInterest: number;
  acceleratedPayoffMonths: number;
  acceleratedTotalInterest: number;
  monthsSaved: number;
  interestSaved: number;
  totalMonthlyContributions: number;
  totalLumpSumContributions: number;
  totalAllContributions: number;
  investmentGrossReturn: number;
  investmentProfit: number;
  investmentTaxes: number;
  investmentNetReturn: number;
  investmentNetBenefit: number;
  betterStrategy: "payoff" | "invest";
}

function safePayoff(
  principal: number,
  monthlyPayment: number,
  monthlyRate: number,
  lumpSum: number
): { months: number; totalInterest: number } {
  try {
    const result = calculatePayoff(principal, monthlyPayment, monthlyRate, lumpSum);
    return { months: result.months, totalInterest: result.totalInterest };
  } catch {
    if (principal <= 0 || monthlyPayment <= 0) {
      return { months: 0, totalInterest: 0 };
    }
    if (monthlyPayment <= principal * monthlyRate) {
      return { months: 9999, totalInterest: principal * 10 };
    }
    return { months: 0, totalInterest: 0 };
  }
}

export function computeMortgageDerived(s: State): MortgageDerived {
  const monthlyInterestRate =
    s.interest_rate < 0 ? 0 : calculateMonthlyRate(s.interest_rate);
  const totalMonths = s.years_left * 12;

  const base = safePayoff(s.principal, s.monthly_payment, monthlyInterestRate, 0);
  const accelerated = safePayoff(
    s.principal,
    s.monthly_payment + s.additional_monthly_payment,
    monthlyInterestRate,
    s.lump_sum_payment
  );

  const monthsSaved = base.months - accelerated.months;
  const interestSaved = base.totalInterest - accelerated.totalInterest;

  // Investment comparison uses the accelerated payoff months when valid,
  // falling back to the base months or the original loan term — same logic
  // as the Pinia store.
  const months =
    accelerated.months >= 9999
      ? base.months >= 9999
        ? totalMonths
        : base.months
      : accelerated.months;

  const totalMonthlyContributions = s.additional_monthly_payment * months;
  const totalLumpSumContributions = s.lump_sum_payment;
  const totalAllContributions = totalMonthlyContributions + totalLumpSumContributions;

  const monthlyReturn = s.investment_return_rate / 100 / 12;
  let investmentGrossReturn = 0;
  try {
    investmentGrossReturn = calculateInvestmentValue(
      s.lump_sum_payment,
      s.additional_monthly_payment,
      monthlyReturn,
      months
    ).grossReturn;
  } catch {
    investmentGrossReturn = 0;
  }

  const investmentProfit = Math.max(
    0,
    investmentGrossReturn - totalAllContributions
  );
  const investmentTaxes = investmentProfit * (s.investment_tax_rate / 100);

  let investmentNetReturn = investmentGrossReturn;
  try {
    investmentNetReturn = calculateAfterTaxReturn(
      investmentGrossReturn,
      totalAllContributions,
      s.investment_tax_rate / 100
    ).netReturn;
  } catch {
    investmentNetReturn = investmentGrossReturn;
  }

  const investmentNetBenefit = investmentNetReturn - totalAllContributions;

  let betterStrategy: "payoff" | "invest";
  try {
    betterStrategy = determineBetterStrategy(
      Math.max(0, interestSaved),
      investmentNetBenefit
    );
  } catch {
    betterStrategy = "payoff";
  }

  return {
    monthlyInterestRate,
    totalMonths,
    basePayoffMonths: base.months,
    baseTotalInterest: base.totalInterest,
    acceleratedPayoffMonths: accelerated.months,
    acceleratedTotalInterest: accelerated.totalInterest,
    monthsSaved,
    interestSaved,
    totalMonthlyContributions,
    totalLumpSumContributions,
    totalAllContributions,
    investmentGrossReturn,
    investmentProfit,
    investmentTaxes,
    investmentNetReturn,
    investmentNetBenefit,
    betterStrategy
  };
}

/* -------------------------------------------------------------------------- */
/* Tooltip data — shape mirrors the Pinia store's tooltipData computed        */
/* exactly. Strings ported verbatim.                                          */
/* -------------------------------------------------------------------------- */

export interface MortgageTooltipPayload {
  title: string;
  formula: string;
  values: FormulaValues;
  calculation: string | string[];
  result: string;
  explanation: string;
}

export type MortgageTooltipKey =
  | "monthlyInterestRate"
  | "basePayoffTime"
  | "acceleratedPayoffTime"
  | "interestSaved"
  | "totalContributions"
  | "investmentGrossReturn"
  | "investmentProfit"
  | "investmentTaxes"
  | "investmentNetReturn"
  | "investmentNetBenefit"
  | "strategyRecommendation";

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(n);

export function mortgageTooltipData(
  s: State,
  d: MortgageDerived
): Record<MortgageTooltipKey, MortgageTooltipPayload> {
  const monthlyRatePct = (d.monthlyInterestRate * 100).toFixed(3);
  const investmentMonthlyReturn = ((s.investment_return_rate / 100 / 12) * 100).toFixed(3);

  return {
    monthlyInterestRate: {
      title: "Monthly Interest Rate Calculation",
      formula: "Monthly Rate = Annual Rate ÷ 12",
      values: {
        annualRate: s.interest_rate,
        monthlyRate: monthlyRatePct
      },
      calculation: ["{annualRate}% ÷ 12 = {monthlyRate}%"],
      result: `${monthlyRatePct}% per month`,
      explanation:
        "Standard mortgage calculation - annual rate divided by 12 months for monthly compounding."
    },

    basePayoffTime: {
      title: "Base Payoff Time Calculation",
      formula: "Amortization Schedule: Monthly payments until balance = 0",
      values: {
        principal: s.principal,
        monthlyPayment: s.monthly_payment,
        monthlyRate: monthlyRatePct,
        months: d.basePayoffMonths
      },
      calculation: [
        "Each month: Interest = Balance × {monthlyRate}%",
        "Principal Payment = {monthlyPayment} - Interest",
        "New Balance = Balance - Principal Payment",
        "Repeat until balance reaches $0"
      ],
      result: `${Math.floor(d.basePayoffMonths / 12)} years, ${d.basePayoffMonths % 12} months`,
      explanation: "Standard amortization schedule with regular monthly payments only."
    },

    acceleratedPayoffTime: {
      title: "Accelerated Payoff Time Calculation",
      formula: "Modified Amortization: Regular + Extra payments until balance = 0",
      values: {
        principal: s.principal,
        regularPayment: s.monthly_payment,
        extraMonthly: s.additional_monthly_payment,
        lumpSum: s.lump_sum_payment,
        totalPayment: s.monthly_payment + s.additional_monthly_payment,
        months: d.acceleratedPayoffMonths
      },
      calculation: [
        "Total Monthly Payment = {regularPayment} + {extraMonthly} = {totalPayment}",
        "Lump Sum Applied: {lumpSum}",
        "Each month: Interest = Balance × Monthly Rate",
        "Principal Payment = {totalPayment} - Interest",
        "Extra payments reduce principal faster"
      ],
      result: `${Math.floor(d.acceleratedPayoffMonths / 12)} years, ${d.acceleratedPayoffMonths % 12} months`,
      explanation: "Amortization with extra payments - additional amounts go directly to principal."
    },

    interestSaved: {
      title: "Interest Saved Calculation",
      formula: "Interest Saved = Base Total Interest - Accelerated Total Interest",
      values: {
        baseTotalInterest: d.baseTotalInterest,
        acceleratedTotalInterest: d.acceleratedTotalInterest,
        interestSaved: d.interestSaved
      },
      calculation: [
        "Base Total Interest = {baseTotalInterest}",
        "Accelerated Total Interest = {acceleratedTotalInterest}",
        "Interest Saved = {baseTotalInterest} - {acceleratedTotalInterest}",
        "= {interestSaved}"
      ],
      result: `Save ${usd(d.interestSaved)}`,
      explanation:
        "Extra payments reduce the loan balance faster, so less interest accrues over the life of the loan."
    },

    totalContributions: {
      title: "Total Contributions Calculation",
      formula: "Total = (Extra Monthly × Months) + Lump Sum",
      values: {
        extraMonthly: s.additional_monthly_payment,
        months: d.acceleratedPayoffMonths,
        monthlyTotal: d.totalMonthlyContributions,
        lumpSum: s.lump_sum_payment,
        totalAll: d.totalAllContributions
      },
      calculation: [
        "Monthly Contributions = {extraMonthly} × {months} = {monthlyTotal}",
        "Lump Sum Contributions = {lumpSum}",
        "Total All Contributions = {monthlyTotal} + {lumpSum} = {totalAll}"
      ],
      result: `Total extra payments: ${usd(d.totalAllContributions)}`,
      explanation:
        "Sum of all additional money put toward the mortgage beyond regular payments."
    },

    investmentGrossReturn: {
      title: "Investment Gross Return Calculation",
      formula: "Compound Growth: Lump Sum + Monthly Contributions",
      values: {
        lumpSum: s.lump_sum_payment,
        monthlyContrib: s.additional_monthly_payment,
        monthlyReturn: investmentMonthlyReturn,
        months: d.acceleratedPayoffMonths,
        grossReturn: d.investmentGrossReturn
      },
      calculation: [
        "Monthly Return Rate = {monthlyReturn}%",
        "Lump Sum Growth: {lumpSum} × (1 + rate)^{months}",
        "Monthly Contributions: {monthlyContrib}/month compounded",
        "Total Investment Value = Lump Sum FV + Monthly FV"
      ],
      result: `Investment grows to ${usd(d.investmentGrossReturn)}`,
      explanation:
        "If extra payments were invested instead, this would be the gross return before taxes."
    },

    investmentProfit: {
      title: "Investment Profit Calculation",
      formula: "Profit = Gross Investment Return - Total Amount Invested",
      values: {
        grossReturn: d.investmentGrossReturn,
        totalInvested: d.totalAllContributions,
        profit: d.investmentProfit
      },
      calculation: [
        "Gross Investment Return = {grossReturn}",
        "Total Amount Invested = {totalInvested}",
        "Taxable Profit = {grossReturn} - {totalInvested}",
        "= {profit}"
      ],
      result: `Taxable profit: ${usd(d.investmentProfit)}`,
      explanation:
        "Only the profit portion (gains) of your investment is subject to capital gains tax, not the entire return."
    },

    investmentTaxes: {
      title: "Capital Gains Tax Calculation",
      formula: "Taxes Owed = Investment Profit × Tax Rate",
      values: {
        profit: d.investmentProfit,
        taxRate: s.investment_tax_rate,
        taxes: d.investmentTaxes
      },
      calculation: [
        "Investment Profit = {profit}",
        "Capital Gains Tax Rate = {taxRate}%",
        "Taxes Owed = {profit} × {taxRate}%",
        "= {taxes}"
      ],
      result: `Capital gains tax: ${usd(d.investmentTaxes)}`,
      explanation:
        "Capital gains tax is only applied to the profit portion of your investment, reducing your net return."
    },

    investmentNetReturn: {
      title: "Investment Net Return (After Tax)",
      formula: "Net Return = Gross Return - (Profit × Tax Rate)",
      values: {
        grossReturn: d.investmentGrossReturn,
        totalInvested: d.totalAllContributions,
        profit: d.investmentProfit,
        taxRate: s.investment_tax_rate,
        taxes: d.investmentTaxes,
        netReturn: d.investmentNetReturn
      },
      calculation: [
        "Gross Return = {grossReturn}",
        "Total Invested = {totalInvested}",
        "Taxable Profit = {grossReturn} - {totalInvested} = {profit}",
        "Taxes = {profit} × {taxRate}% = {taxes}",
        "Net Return = {grossReturn} - {taxes} = {netReturn}"
      ],
      result: `After-tax investment value: ${usd(d.investmentNetReturn)}`,
      explanation:
        "Investment return after capital gains taxes - the real value you would keep."
    },

    investmentNetBenefit: {
      title: "Investment Net Benefit (True Gain)",
      formula: "Net Benefit = After-Tax Investment Value - Total Amount Invested",
      values: {
        netReturn: d.investmentNetReturn,
        totalInvested: d.totalAllContributions,
        netBenefit: d.investmentNetBenefit
      },
      calculation: [
        "After-Tax Investment Value = {netReturn}",
        "Total Amount Invested = {totalInvested}",
        "Net Benefit = {netReturn} - {totalInvested}",
        "= {netBenefit}"
      ],
      result: `True investment gain: ${usd(d.investmentNetBenefit)}`,
      explanation:
        "This is your actual financial benefit from investing - what you gain above your initial investment, directly comparable to interest saved."
    },

    strategyRecommendation: {
      title: "Strategy Recommendation Analysis",
      formula: "Compare: Interest Saved vs Investment Net Benefit",
      values: {
        interestSaved: d.interestSaved,
        investmentNetBenefit: d.investmentNetBenefit,
        totalInvested: d.totalAllContributions,
        netReturn: d.investmentNetReturn,
        betterStrategy: d.betterStrategy,
        difference: Math.abs(d.interestSaved - d.investmentNetBenefit)
      },
      calculation: [
        "Mortgage Payoff Benefit = {interestSaved}",
        "Investment Net Benefit = {netReturn} - {totalInvested} = {investmentNetBenefit}",
        "Difference = {difference}",
        `Better Strategy: ${d.betterStrategy === "payoff" ? "Pay Off Mortgage" : "Invest Extra Payments"}`
      ],
      result: `Recommendation: ${
        d.betterStrategy === "payoff" ? "Pay off mortgage early" : "Invest the extra payments"
      }`,
      explanation:
        d.betterStrategy === "payoff"
          ? "Paying off the mortgage saves more money than investing after taxes."
          : "Investing the extra payments yields better returns than the interest saved."
    }
  };
}

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

export interface MortgageResultsProps {
  state: State;
}

function formatMonths(months: number): string {
  if (!Number.isFinite(months) || months <= 0) return "0 months";
  const years = Math.floor(months / 12);
  const remaining = months % 12;
  if (years === 0) return `${remaining} months`;
  if (remaining === 0) return `${years} years`;
  return `${years} years, ${remaining} months`;
}

export function MortgageResults({ state }: MortgageResultsProps) {
  const derived = useMemo(() => computeMortgageDerived(state), [state]);
  const tooltips = useMemo(() => mortgageTooltipData(state, derived), [state, derived]);

  // Charts — wrap in try/catch since the underlying generators throw on
  // unpayable scenarios (payment <= interest).
  const balanceRows = useMemo(() => {
    try {
      const chart = generateMortgageBalanceChart(
        state.principal,
        state.monthly_payment,
        state.additional_monthly_payment,
        derived.monthlyInterestRate,
        state.lump_sum_payment
      );
      return mortgageBalanceToRecharts(chart);
    } catch {
      return [];
    }
  }, [state, derived.monthlyInterestRate]);

  const interestRows = useMemo(() => {
    try {
      const chart = generateInterestComparisonChart(
        state.principal,
        state.monthly_payment,
        state.additional_monthly_payment,
        derived.monthlyInterestRate,
        state.lump_sum_payment
      );
      return interestComparisonToRecharts(chart);
    } catch {
      return [];
    }
  }, [state, derived.monthlyInterestRate]);

  const investmentResult = useMemo(() => {
    try {
      const chart = generateInvestmentComparisonChart(
        state.principal,
        state.monthly_payment,
        state.additional_monthly_payment,
        derived.monthlyInterestRate,
        state.lump_sum_payment,
        state.investment_return_rate / 100 / 12,
        state.investment_tax_rate / 100
      );
      return investmentComparisonToRecharts(chart);
    } catch {
      return { rows: [], crossoverMonth: undefined };
    }
  }, [state, derived.monthlyInterestRate]);

  return (
    <div className="space-y-6">
      <h3 className="text-base font-semibold">Results</h3>

      <div className="space-y-4">
        <h4 className="text-sm font-semibold">Payoff Comparison</h4>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded border border-border bg-muted/30 p-3">
            <h5 className="mb-2 text-sm font-semibold">Current Schedule</h5>
            <ResultRow label="Time to Payoff:">
              <MathTooltip {...tooltips.basePayoffTime}>
                <span className="numeric font-semibold">
                  {formatMonths(derived.basePayoffMonths)}
                </span>
              </MathTooltip>
            </ResultRow>
            <ResultRow label="Total Interest:">
              <span className="numeric font-semibold">{usd(derived.baseTotalInterest)}</span>
            </ResultRow>
          </div>

          <div className="rounded border border-primary/40 bg-primary/5 p-3">
            <h5 className="mb-2 text-sm font-semibold">With Extra Payments</h5>
            <ResultRow label="Time to Payoff:">
              <MathTooltip {...tooltips.acceleratedPayoffTime}>
                <span className="numeric font-semibold text-emerald-600">
                  {formatMonths(derived.acceleratedPayoffMonths)}
                </span>
              </MathTooltip>
            </ResultRow>
            <ResultRow label="Total Interest:">
              <span className="numeric font-semibold text-emerald-600">
                {usd(derived.acceleratedTotalInterest)}
              </span>
            </ResultRow>
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded bg-blue-500/5 p-4">
        <h4 className="text-sm font-semibold">Savings Summary</h4>
        <ResultRow label="Monthly Interest Rate:">
          <MathTooltip {...tooltips.monthlyInterestRate}>
            <span className="numeric font-semibold">
              {(derived.monthlyInterestRate * 100).toFixed(3)}%
            </span>
          </MathTooltip>
        </ResultRow>
        <ResultRow label="Time Saved:">
          <span className="numeric font-semibold">{formatMonths(derived.monthsSaved)}</span>
        </ResultRow>
        <ResultRow label="Interest Saved:">
          <MathTooltip {...tooltips.interestSaved}>
            <span className="numeric font-semibold">{usd(derived.interestSaved)}</span>
          </MathTooltip>
        </ResultRow>
      </div>

      <div className="space-y-2 rounded bg-muted/30 p-4">
        <h4 className="text-sm font-semibold">Total Contributions</h4>
        <ResultRow label="Monthly Contributions:">
          <MathTooltip {...tooltips.totalContributions}>
            <span className="numeric font-semibold">{usd(derived.totalMonthlyContributions)}</span>
          </MathTooltip>
        </ResultRow>
        <ResultRow label="Lump Sum Contributions:">
          <MathTooltip {...tooltips.totalContributions}>
            <span className="numeric font-semibold">{usd(derived.totalLumpSumContributions)}</span>
          </MathTooltip>
        </ResultRow>
        <ResultRow label="Total All Contributions:">
          <MathTooltip {...tooltips.totalContributions}>
            <span className="numeric font-semibold">{usd(derived.totalAllContributions)}</span>
          </MathTooltip>
        </ResultRow>
      </div>

      <div className="space-y-2 rounded bg-muted/30 p-4">
        <h4 className="text-sm font-semibold">Investment Comparison</h4>
        <ResultRow label="Investment Value:">
          <MathTooltip {...tooltips.investmentGrossReturn}>
            <span className="numeric font-semibold">{usd(derived.investmentGrossReturn)}</span>
          </MathTooltip>
        </ResultRow>
        <ResultRow label="Investment Profit:">
          <MathTooltip {...tooltips.investmentProfit}>
            <span className="numeric font-semibold">{usd(derived.investmentProfit)}</span>
          </MathTooltip>
        </ResultRow>
        <ResultRow label="Taxes Owed:">
          <MathTooltip {...tooltips.investmentTaxes}>
            <span className="numeric font-semibold">{usd(derived.investmentTaxes)}</span>
          </MathTooltip>
        </ResultRow>
        <ResultRow label="Net Investment Return:">
          <MathTooltip {...tooltips.investmentNetReturn}>
            <span className="numeric font-semibold">{usd(derived.investmentNetReturn)}</span>
          </MathTooltip>
        </ResultRow>
        <ResultRow label="Investment Net Benefit:">
          <MathTooltip {...tooltips.investmentNetBenefit}>
            <span className="numeric font-semibold">{usd(derived.investmentNetBenefit)}</span>
          </MathTooltip>
        </ResultRow>
      </div>

      <div
        className={`rounded border-l-4 p-4 ${
          derived.betterStrategy === "payoff"
            ? "border-blue-500 bg-blue-500/5"
            : "border-emerald-500 bg-emerald-500/5"
        }`}
      >
        <h4 className="mb-1 text-sm font-semibold">
          <MathTooltip {...tooltips.strategyRecommendation}>
            <span>Recommendation</span>
          </MathTooltip>
        </h4>
        <p className="text-sm text-muted-foreground">
          {derived.betterStrategy === "payoff"
            ? `Paying off your mortgage early saves you ${usd(
                derived.interestSaved
              )} in interest, which is better than the after-tax investment return.`
            : `Investing the extra payments would yield ${usd(
                derived.investmentNetReturn
              )} after taxes, which exceeds the ${usd(
                derived.interestSaved
              )} saved by paying off the mortgage early.`}
        </p>
      </div>

      <div className="space-y-2 pt-4">
        <h4 className="text-sm font-semibold">Mortgage Balance Over Time</h4>
        {balanceRows.length > 0 ? (
          <ComparisonLineChart
            data={balanceRows as unknown as Record<string, unknown>[]}
            xKey="month"
            series={[
              {
                key: "standard",
                label: "Standard payments",
                color: "hsl(var(--chart-1))"
              },
              {
                key: "accelerated",
                label: "With extra payments",
                color: "hsl(var(--chart-2))"
              }
            ]}
            valueFormatter={usd}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Chart unavailable — payment doesn't cover interest.
          </p>
        )}
      </div>

      <div className="space-y-2 pt-2">
        <h4 className="text-sm font-semibold">Cumulative Interest Comparison</h4>
        {interestRows.length > 0 ? (
          <ComparisonLineChart
            data={interestRows as unknown as Record<string, unknown>[]}
            xKey="month"
            series={[
              {
                key: "standardCumInterest",
                label: "Standard cumulative interest",
                color: "hsl(var(--chart-1))"
              },
              {
                key: "acceleratedCumInterest",
                label: "Accelerated cumulative interest",
                color: "hsl(var(--chart-2))"
              }
            ]}
            valueFormatter={usd}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Chart unavailable — payment doesn't cover interest.
          </p>
        )}
      </div>

      <div className="space-y-2 pt-2">
        <h4 className="text-sm font-semibold">Mortgage Equity vs Investment Value</h4>
        {investmentResult.rows.length > 0 ? (
          <ComparisonLineChart
            data={investmentResult.rows as unknown as Record<string, unknown>[]}
            xKey="month"
            series={[
              {
                key: "mortgageEquity",
                label: "Mortgage equity",
                color: "hsl(var(--chart-1))"
              },
              {
                key: "investmentValue",
                label: "Investment value",
                color: "hsl(var(--chart-2))"
              }
            ]}
            crossoverMonth={investmentResult.crossoverMonth}
            crossoverSeriesKey="investmentValue"
            crossoverLabel="Crossover"
            valueFormatter={usd}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Chart unavailable.</p>
        )}
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
