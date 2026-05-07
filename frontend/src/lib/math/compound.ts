/**
 * Compound Interest Mathematical Functions
 *
 * Pure functions for compound interest calculations used throughout the finance calculator.
 * All functions are stateless and deterministic for easy testing and reuse.
 *
 * Ported verbatim from legacy-vue-calc/src/utils/math/compound.ts
 */

/**
 * Calculate future value using compound interest formula
 * Formula: FV = PV × (1 + r)^t
 *
 * @param principal - Present value (initial amount)
 * @param rate - Annual interest rate as decimal (e.g., 0.07 for 7%)
 * @param years - Number of years to compound
 * @returns Future value after compounding
 *
 * @example
 * calculateFutureValue(50000, 0.07, 35) // $739,368
 */
export function calculateFutureValue(principal: number, rate: number, years: number): number {
  if (principal < 0) throw new Error('Principal cannot be negative')
  if (rate < -1) throw new Error('Rate cannot be less than -100%')
  if (years < 0) throw new Error('Years cannot be negative')

  if (years === 0) return principal
  if (principal === 0) return 0

  return principal * Math.pow(1 + rate, years)
}

/**
 * Calculate present value needed to reach a future target
 * Formula: PV = FV ÷ (1 + r)^t
 *
 * @param futureValue - Target future amount
 * @param rate - Annual interest rate as decimal (e.g., 0.07 for 7%)
 * @param years - Number of years until target
 * @returns Present value needed today
 *
 * @example
 * calculatePresentValue(1000000, 0.07, 35) // $67,635
 */
export function calculatePresentValue(futureValue: number, rate: number, years: number): number {
  if (futureValue < 0) throw new Error('Future value cannot be negative')
  if (rate < -1) throw new Error('Rate cannot be less than -100%')
  if (years < 0) throw new Error('Years cannot be negative')

  if (years === 0) return futureValue
  if (futureValue === 0) return 0

  return futureValue / Math.pow(1 + rate, years)
}

/**
 * Calculate time required to reach target amount from current amount
 * Formula: t = ln(FV ÷ PV) ÷ ln(1 + r)
 *
 * @param principal - Current amount
 * @param target - Target future amount
 * @param rate - Annual interest rate as decimal (e.g., 0.07 for 7%)
 * @returns Number of years needed to reach target
 *
 * @example
 * calculateTimeToTarget(50000, 1000000, 0.07) // 43.0 years
 */
export function calculateTimeToTarget(principal: number, target: number, rate: number): number {
  if (principal <= 0) throw new Error('Principal must be positive')
  if (target <= 0) throw new Error('Target must be positive')
  if (rate <= -1) throw new Error('Rate must be greater than -100%')
  if (target <= principal) return 0
  if (rate === 0) return Infinity

  const ratio = target / principal
  return Math.log(ratio) / Math.log(1 + rate)
}

/**
 * Calculate real (inflation-adjusted) return rate using Fisher equation
 * Formula: realRate = (1 + nominalRate) ÷ (1 + inflationRate) - 1
 *
 * @param nominalRate - Nominal (stated) return rate as decimal
 * @param inflationRate - Inflation rate as decimal
 * @returns Real return rate as decimal
 *
 * @example
 * calculateRealReturnRate(0.07, 0.03) // 0.03883 (3.883%)
 */
export function calculateRealReturnRate(nominalRate: number, inflationRate: number): number {
  if (nominalRate < -1) throw new Error('Nominal rate cannot be less than -100%')
  if (inflationRate < -1) throw new Error('Inflation rate cannot be less than -100%')

  return ((1 + nominalRate) / (1 + inflationRate)) - 1
}

/**
 * Adjust target amount for inflation over time
 * Formula: adjustedTarget = target × (1 + inflationRate)^years
 *
 * @param target - Target amount in today's dollars
 * @param inflationRate - Annual inflation rate as decimal
 * @param years - Number of years of inflation
 * @returns Target amount adjusted for inflation
 *
 * @example
 * adjustTargetForInflation(1000000, 0.03, 35) // $2,813,862
 */
export function adjustTargetForInflation(target: number, inflationRate: number, years: number): number {
  if (target < 0) throw new Error('Target cannot be negative')
  if (inflationRate < -1) throw new Error('Inflation rate cannot be less than -100%')
  if (years < 0) throw new Error('Years cannot be negative')

  if (years === 0 || inflationRate === 0) return target
  if (target === 0) return 0

  return target * Math.pow(1 + inflationRate, years)
}

/**
 * Calculate years from current age to retirement age
 * Simple subtraction with validation
 *
 * @param currentAge - Current age
 * @param retirementAge - Target retirement age
 * @returns Years to retirement (minimum 0)
 *
 * @example
 * calculateYearsToRetirement(30, 65) // 35
 */
export function calculateYearsToRetirement(currentAge: number, retirementAge: number): number {
  if (currentAge < 0) throw new Error('Current age cannot be negative')
  if (retirementAge < 0) throw new Error('Retirement age cannot be negative')

  return Math.max(0, retirementAge - currentAge)
}
