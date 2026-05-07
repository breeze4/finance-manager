/**
 * Recharts Adapters
 *
 * Translate Chart.js-shaped output from `lib/math/charts.ts` into Recharts-friendly
 * row arrays. Each chart-data generator emits `{ labels, datasets }`; Recharts wants
 * a flat array of rows where each row's keys map to series names.
 *
 * These adapters do NOT re-run any math — they just reshape existing output.
 */

import type { ChartData } from '../charts'

/* -------------------------------------------------------------------------- */
/* Coast FIRE: projected savings vs target overlay                             */
/* -------------------------------------------------------------------------- */

export interface CoastFireProjectionRow {
  age: number
  value: number
  target: number
}

/**
 * Translate `generateCoastFireProjectionChart` output to Recharts rows.
 * Labels look like `Age 30` — extract the age number; datasets[0] is projected, [1] is target.
 */
export function coastFireProjectionToRecharts(data: ChartData): CoastFireProjectionRow[] {
  const projected = data.datasets[0]?.data ?? []
  const target = data.datasets[1]?.data ?? []
  return data.labels.map((label, i) => ({
    age: parseAgeFromLabel(label),
    value: projected[i] ?? 0,
    target: target[i] ?? 0
  }))
}

/* -------------------------------------------------------------------------- */
/* Coast FIRE: required savings by age                                         */
/* -------------------------------------------------------------------------- */

export interface RequiredSavingsByAgeRow {
  age: number
  requiredSavings: number
}

/**
 * Translate `generateRequiredSavingsByAgeChart` output to Recharts rows.
 * Single dataset; labels like `Age 25`.
 */
export function requiredSavingsByAgeToRecharts(data: ChartData): RequiredSavingsByAgeRow[] {
  const series = data.datasets[0]?.data ?? []
  return data.labels.map((label, i) => ({
    age: parseAgeFromLabel(label),
    requiredSavings: series[i] ?? 0
  }))
}

/* -------------------------------------------------------------------------- */
/* Mortgage: balance over time (standard vs accelerated)                       */
/* -------------------------------------------------------------------------- */

export interface MortgageBalanceRow {
  month: number
  standard: number
  accelerated: number
}

/**
 * Translate `generateMortgageBalanceChart` output to Recharts rows.
 * Labels look like `Start` (month 0) or `Month N`.
 */
export function mortgageBalanceToRecharts(data: ChartData): MortgageBalanceRow[] {
  const standard = data.datasets[0]?.data ?? []
  const accelerated = data.datasets[1]?.data ?? []
  return data.labels.map((label, i) => ({
    month: parseMonthFromLabel(label),
    standard: standard[i] ?? 0,
    accelerated: accelerated[i] ?? 0
  }))
}

/* -------------------------------------------------------------------------- */
/* Mortgage: interest comparison                                               */
/* -------------------------------------------------------------------------- */

export interface InterestComparisonRow {
  month: number
  standardCumInterest: number
  acceleratedCumInterest: number
}

/**
 * Translate `generateInterestComparisonChart` output to Recharts rows.
 * Labels look like `Start` or `Year N` (yearly buckets).
 */
export function interestComparisonToRecharts(data: ChartData): InterestComparisonRow[] {
  const standard = data.datasets[0]?.data ?? []
  const accelerated = data.datasets[1]?.data ?? []
  return data.labels.map((label, i) => ({
    month: parseYearLabelToMonths(label),
    standardCumInterest: standard[i] ?? 0,
    acceleratedCumInterest: accelerated[i] ?? 0
  }))
}

/* -------------------------------------------------------------------------- */
/* Mortgage: investment comparison + crossover detection                       */
/* -------------------------------------------------------------------------- */

export interface InvestmentComparisonRow {
  month: number
  mortgageEquity: number
  investmentValue: number
}

export interface InvestmentComparisonResult {
  rows: InvestmentComparisonRow[]
  /**
   * Month value at which investmentValue first overtakes mortgageEquity.
   * Undefined when the investment never crosses (or starts already crossed).
   */
  crossoverMonth?: number
}

/**
 * Translate `generateInvestmentComparisonChart` output to Recharts rows + crossover month.
 *
 * Crossover detection: walk the rows, find the first index where investmentValue > mortgageEquity
 * AND the previous row had investmentValue <= mortgageEquity (i.e. an actual crossing).
 * If the investment never overtakes the mortgage line, returns `undefined`.
 */
export function investmentComparisonToRecharts(data: ChartData): InvestmentComparisonResult {
  const mortgage = data.datasets[0]?.data ?? []
  const investment = data.datasets[1]?.data ?? []
  const rows: InvestmentComparisonRow[] = data.labels.map((label, i) => ({
    month: parseYearLabelToMonths(label),
    mortgageEquity: mortgage[i] ?? 0,
    investmentValue: investment[i] ?? 0
  }))

  let crossoverMonth: number | undefined
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1]
    const curr = rows[i]
    if (prev.investmentValue <= prev.mortgageEquity && curr.investmentValue > curr.mortgageEquity) {
      crossoverMonth = curr.month
      break
    }
  }

  return { rows, crossoverMonth }
}

/* -------------------------------------------------------------------------- */
/* Label parsers (internal)                                                    */
/* -------------------------------------------------------------------------- */

/** "Age 30" -> 30; falls back to NaN-safe 0 for unparseable input. */
function parseAgeFromLabel(label: string): number {
  const match = /Age\s+(\d+(?:\.\d+)?)/.exec(label)
  return match ? Number(match[1]) : 0
}

/** "Start" -> 0; "Month 12" -> 12. */
function parseMonthFromLabel(label: string): number {
  if (label === 'Start') return 0
  const match = /Month\s+(\d+)/.exec(label)
  return match ? Number(match[1]) : 0
}

/** "Start" -> 0; "Year 5" -> 60. */
function parseYearLabelToMonths(label: string): number {
  if (label === 'Start') return 0
  const match = /Year\s+(\d+(?:\.\d+)?)/.exec(label)
  return match ? Math.round(Number(match[1]) * 12) : 0
}
