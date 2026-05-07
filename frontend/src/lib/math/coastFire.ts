/**
 * Coast FIRE Mathematical Functions
 *
 * Pure functions for Coast FIRE (Financial Independence Retire Early) calculations.
 * Coast FIRE is when you have enough saved that compound growth alone will reach your retirement target.
 *
 * Ported verbatim from legacy-vue-calc/src/utils/math/coastFire.ts
 */

import {
  calculateFutureValue,
  calculatePresentValue,
  calculateTimeToTarget,
  calculateYearsToRetirement
} from './compound'

/**
 * Calculate the Coast FIRE number - amount needed today to coast to retirement
 * This is the present value of your retirement target
 *
 * @param target - Target retirement amount (inflation-adjusted if needed)
 * @param rate - Annual return rate as decimal (real or nominal)
 * @param years - Years until retirement
 * @returns Amount needed today to coast to retirement
 *
 * @example
 * calculateCoastFireNumber(1000000, 0.07, 35) // $67,635
 */
export function calculateCoastFireNumber(target: number, rate: number, years: number): number {
  return calculatePresentValue(target, rate, years)
}

/**
 * Calculate additional savings needed to reach Coast FIRE immediately
 *
 * @param currentSavings - Current amount saved
 * @param target - Target retirement amount (inflation-adjusted if needed)
 * @param rate - Annual return rate as decimal (real or nominal)
 * @param years - Years until retirement
 * @returns Additional amount needed to save today (0 if already Coast FIRE ready)
 *
 * @example
 * calculateAdditionalSavingsNeeded(50000, 1000000, 0.07, 35) // $17,635
 */
export function calculateAdditionalSavingsNeeded(
  currentSavings: number,
  target: number,
  rate: number,
  years: number
): number {
  if (currentSavings < 0) throw new Error('Current savings cannot be negative')

  const coastFireNumber = calculateCoastFireNumber(target, rate, years)
  return Math.max(0, coastFireNumber - currentSavings)
}

/**
 * Check if current savings are sufficient for Coast FIRE
 *
 * @param currentSavings - Current amount saved
 * @param target - Target retirement amount (inflation-adjusted if needed)
 * @param rate - Annual return rate as decimal (real or nominal)
 * @param years - Years until retirement
 * @returns True if Coast FIRE ready, false otherwise
 *
 * @example
 * isCoastFireReady(50000, 1000000, 0.07, 35) // false
 * isCoastFireReady(100000, 1000000, 0.07, 35) // true
 */
export function isCoastFireReady(
  currentSavings: number,
  target: number,
  rate: number,
  years: number
): boolean {
  if (currentSavings < 0) throw new Error('Current savings cannot be negative')

  const futureValue = calculateFutureValue(currentSavings, rate, years)
  return futureValue >= target
}

/**
 * Calculate age when Coast FIRE will be reached with current savings
 *
 * @param currentSavings - Current amount saved
 * @param target - Target retirement amount (inflation-adjusted if needed)
 * @param rate - Annual return rate as decimal (real or nominal)
 * @param currentAge - Current age
 * @returns Age when Coast FIRE ready (current age if already ready)
 *
 * @example
 * calculateCoastFireAge(50000, 1000000, 0.07, 30) // 73
 */
export function calculateCoastFireAge(
  currentSavings: number,
  target: number,
  rate: number,
  currentAge: number
): number {
  if (currentSavings <= 0) throw new Error('Current savings must be positive')
  if (currentAge < 0) throw new Error('Current age cannot be negative')

  // If already Coast FIRE ready, return current age
  const futureValueCheck = calculateFutureValue(currentSavings, rate, 0)
  if (futureValueCheck >= target) return currentAge

  const yearsNeeded = calculateTimeToTarget(currentSavings, target, rate)
  return Math.ceil(currentAge + yearsNeeded)
}

/**
 * Calculate target retirement amount from desired annual expenses
 * Uses the safe withdrawal rate (typically 4%) to determine portfolio size needed
 *
 * @param annualExpenses - Desired annual expenses in retirement
 * @param withdrawalRate - Safe withdrawal rate as decimal (e.g., 0.04 for 4%)
 * @returns Target retirement portfolio amount
 *
 * @example
 * calculateTargetFromExpenses(40000, 0.04) // $1,000,000
 */
export function calculateTargetFromExpenses(annualExpenses: number, withdrawalRate: number): number {
  if (annualExpenses < 0) throw new Error('Annual expenses cannot be negative')
  if (withdrawalRate <= 0) throw new Error('Withdrawal rate must be positive')
  if (withdrawalRate > 1) throw new Error('Withdrawal rate should not exceed 100%')

  if (annualExpenses === 0) return 0

  return annualExpenses / withdrawalRate
}

/**
 * Calculate target retirement amount from desired monthly expenses
 *
 * @param monthlyExpenses - Desired monthly expenses in retirement
 * @param withdrawalRate - Safe withdrawal rate as decimal (e.g., 0.04 for 4%)
 * @returns Target retirement portfolio amount
 *
 * @example
 * calculateTargetFromMonthlyExpenses(3333, 0.04) // $999,900
 */
export function calculateTargetFromMonthlyExpenses(monthlyExpenses: number, withdrawalRate: number): number {
  if (monthlyExpenses < 0) throw new Error('Monthly expenses cannot be negative')

  const annualExpenses = monthlyExpenses * 12
  return calculateTargetFromExpenses(annualExpenses, withdrawalRate)
}

/**
 * Calculate annual expenses available from target retirement amount
 *
 * @param target - Target retirement portfolio amount
 * @param withdrawalRate - Safe withdrawal rate as decimal (e.g., 0.04 for 4%)
 * @returns Annual expenses supported by portfolio
 *
 * @example
 * calculateExpensesFromTarget(1000000, 0.04) // $40,000
 */
export function calculateExpensesFromTarget(target: number, withdrawalRate: number): number {
  if (target < 0) throw new Error('Target cannot be negative')
  if (withdrawalRate < 0) throw new Error('Withdrawal rate cannot be negative')
  if (withdrawalRate > 1) throw new Error('Withdrawal rate should not exceed 100%')

  return target * withdrawalRate
}

/**
 * Calculate monthly expenses available from target retirement amount
 *
 * @param target - Target retirement portfolio amount
 * @param withdrawalRate - Safe withdrawal rate as decimal (e.g., 0.04 for 4%)
 * @returns Monthly expenses supported by portfolio
 *
 * @example
 * calculateMonthlyExpensesFromTarget(1000000, 0.04) // $3,333.33
 */
export function calculateMonthlyExpensesFromTarget(target: number, withdrawalRate: number): number {
  const annualExpenses = calculateExpensesFromTarget(target, withdrawalRate)
  return annualExpenses / 12
}

/**
 * Generate data points for Coast FIRE projection over time
 *
 * @param currentSavings - Current amount saved
 * @param currentAge - Current age
 * @param retirementAge - Target retirement age
 * @param rate - Annual return rate as decimal
 * @returns Array of {age, projectedSavings} data points
 *
 * @example
 * generateCoastFireProjection(50000, 30, 65, 0.07)
 * // [{age: 30, projectedSavings: 50000}, {age: 31, projectedSavings: 53500}, ...]
 */
export function generateCoastFireProjection(
  currentSavings: number,
  currentAge: number,
  retirementAge: number,
  rate: number
): Array<{ age: number; projectedSavings: number }> {
  if (currentSavings < 0) throw new Error('Current savings cannot be negative')
  if (currentAge < 0) throw new Error('Current age cannot be negative')
  if (retirementAge < currentAge) throw new Error('Retirement age must be >= current age')

  const years = calculateYearsToRetirement(currentAge, retirementAge)
  const projection: Array<{ age: number; projectedSavings: number }> = []

  for (let i = 0; i <= years; i++) {
    const age = currentAge + i
    const projectedSavings = calculateFutureValue(currentSavings, rate, i)
    projection.push({ age, projectedSavings })
  }

  return projection
}
