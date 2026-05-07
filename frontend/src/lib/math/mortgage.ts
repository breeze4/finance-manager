/**
 * Mortgage Mathematical Functions
 *
 * Pure functions for mortgage amortization, payoff calculations, and investment comparisons.
 * All calculations are based on standard amortization formulas.
 *
 * Ported verbatim from legacy-vue-calc/src/utils/math/mortgage.ts
 */

/**
 * Interface for payment detail in amortization schedule
 */
export interface PaymentDetail {
  month: number
  balance: number
  interestPayment: number
  principalPayment: number
  totalInterest: number
}

/**
 * Interface for payoff calculation result
 */
export interface PayoffResult {
  months: number
  totalInterest: number
  totalPayments: number
}

/**
 * Interface for investment calculation result
 */
export interface InvestmentResult {
  grossReturn: number
  profit: number
  taxes: number
  netReturn: number
  totalInvested: number
}

/**
 * Calculate monthly interest rate from annual rate
 *
 * @param annualRate - Annual interest rate as percentage (e.g., 4.5 for 4.5%)
 * @returns Monthly interest rate as decimal
 *
 * @example
 * calculateMonthlyRate(4.5) // 0.00375 (0.375% monthly)
 */
export function calculateMonthlyRate(annualRate: number): number {
  if (annualRate < 0) throw new Error('Annual rate cannot be negative')
  return annualRate / 100 / 12
}

/**
 * Calculate mortgage payoff time and total interest
 * Uses iterative amortization calculation
 *
 * @param principal - Outstanding loan balance
 * @param monthlyPayment - Regular monthly payment amount
 * @param monthlyRate - Monthly interest rate as decimal
 * @param lumpSum - Optional upfront lump sum payment (default: 0)
 * @returns PayoffResult with months, total interest, and total payments
 *
 * @example
 * calculatePayoff(300000, 1500, 0.00375, 10000)
 * // {months: 180, totalInterest: 95000, totalPayments: 285000}
 */
export function calculatePayoff(
  principal: number,
  monthlyPayment: number,
  monthlyRate: number,
  lumpSum: number = 0
): PayoffResult {
  if (principal <= 0) throw new Error('Principal must be positive')
  if (monthlyPayment <= 0) throw new Error('Monthly payment must be positive')
  if (monthlyRate < 0) throw new Error('Monthly rate cannot be negative')
  if (lumpSum < 0) throw new Error('Lump sum cannot be negative')

  let balance = principal - lumpSum
  let totalInterest = 0
  let months = 0
  const maxMonths = 600 // 50 years maximum to prevent infinite loops

  while (balance > 0.01 && months < maxMonths) {
    const interestPayment = balance * monthlyRate
    const principalPayment = Math.min(monthlyPayment - interestPayment, balance)

    // If payment doesn't cover interest, loan will never pay off
    if (principalPayment <= 0) {
      throw new Error('Monthly payment is too small to cover interest')
    }

    totalInterest += interestPayment
    balance -= principalPayment
    months++
  }

  if (months >= maxMonths) {
    throw new Error('Mortgage payoff calculation exceeded maximum iterations')
  }

  const totalPayments = lumpSum + (months * monthlyPayment)

  return {
    months,
    totalInterest: Math.round(totalInterest * 100) / 100,
    totalPayments: Math.round(totalPayments * 100) / 100
  }
}

/**
 * Generate complete amortization schedule
 *
 * @param principal - Loan amount
 * @param monthlyPayment - Monthly payment amount
 * @param monthlyRate - Monthly interest rate as decimal
 * @param lumpSum - Optional upfront lump sum payment (default: 0)
 * @returns Array of PaymentDetail objects for each month
 *
 * @example
 * generateAmortizationSchedule(300000, 1500, 0.00375)
 * // [{month: 1, balance: 298625, interestPayment: 1125, principalPayment: 375, totalInterest: 1125}, ...]
 */
export function generateAmortizationSchedule(
  principal: number,
  monthlyPayment: number,
  monthlyRate: number,
  lumpSum: number = 0
): PaymentDetail[] {
  if (principal <= 0) throw new Error('Principal must be positive')
  if (monthlyPayment <= 0) throw new Error('Monthly payment must be positive')
  if (monthlyRate < 0) throw new Error('Monthly rate cannot be negative')
  if (lumpSum < 0) throw new Error('Lump sum cannot be negative')

  const schedule: PaymentDetail[] = []
  let balance = principal - lumpSum
  let totalInterest = 0
  let month = 0
  const maxMonths = 600 // 50 years maximum

  while (balance > 0.01 && month < maxMonths) {
    month++
    const interestPayment = balance * monthlyRate
    const principalPayment = Math.min(monthlyPayment - interestPayment, balance)

    if (principalPayment <= 0) {
      throw new Error('Monthly payment is too small to cover interest')
    }

    totalInterest += interestPayment
    balance -= principalPayment

    schedule.push({
      month,
      balance: Math.round(balance * 100) / 100,
      interestPayment: Math.round(interestPayment * 100) / 100,
      principalPayment: Math.round(principalPayment * 100) / 100,
      totalInterest: Math.round(totalInterest * 100) / 100
    })
  }

  if (month >= maxMonths) {
    throw new Error('Amortization schedule generation exceeded maximum iterations')
  }

  return schedule
}

/**
 * Calculate future value of investment with lump sum and monthly contributions
 *
 * @param lumpSum - Initial lump sum investment
 * @param monthlyAmount - Monthly contribution amount
 * @param monthlyReturnRate - Monthly return rate as decimal
 * @param months - Number of months to invest
 * @returns InvestmentResult with gross return, profit, and investment details
 *
 * @example
 * calculateInvestmentValue(10000, 500, 0.007, 180)
 * // {grossReturn: 175000, profit: 100000, ...}
 */
export function calculateInvestmentValue(
  lumpSum: number,
  monthlyAmount: number,
  monthlyReturnRate: number,
  months: number
): InvestmentResult {
  if (lumpSum < 0) throw new Error('Lump sum cannot be negative')
  if (monthlyAmount < 0) throw new Error('Monthly amount cannot be negative')
  if (monthlyReturnRate < -1) throw new Error('Monthly return rate cannot be less than -100%')
  if (months < 0) throw new Error('Months cannot be negative')

  // Future value of lump sum
  const lumpSumFV = lumpSum * Math.pow(1 + monthlyReturnRate, months)

  // Future value of annuity (monthly payments)
  let annuityFV = 0
  if (monthlyAmount > 0 && months > 0) {
    if (monthlyReturnRate === 0) {
      annuityFV = monthlyAmount * months
    } else {
      annuityFV = monthlyAmount * ((Math.pow(1 + monthlyReturnRate, months) - 1) / monthlyReturnRate)
    }
  }

  const grossReturn = lumpSumFV + annuityFV
  const totalInvested = lumpSum + (monthlyAmount * months)
  const profit = Math.max(0, grossReturn - totalInvested)

  return {
    grossReturn: Math.round(grossReturn * 100) / 100,
    profit: Math.round(profit * 100) / 100,
    taxes: 0, // Calculated separately by calculateAfterTaxReturn
    netReturn: Math.round(grossReturn * 100) / 100, // Before tax
    totalInvested: Math.round(totalInvested * 100) / 100
  }
}

/**
 * Calculate after-tax investment return
 *
 * @param grossReturn - Total investment value before taxes
 * @param totalInvested - Total amount invested (not taxed)
 * @param taxRate - Tax rate on gains as decimal (e.g., 0.20 for 20%)
 * @returns InvestmentResult with tax calculations applied
 *
 * @example
 * calculateAfterTaxReturn(175000, 100000, 0.20)
 * // {grossReturn: 175000, profit: 75000, taxes: 15000, netReturn: 160000, totalInvested: 100000}
 */
export function calculateAfterTaxReturn(
  grossReturn: number,
  totalInvested: number,
  taxRate: number
): InvestmentResult {
  if (grossReturn < 0) throw new Error('Gross return cannot be negative')
  if (totalInvested < 0) throw new Error('Total invested cannot be negative')
  if (taxRate < 0 || taxRate > 1) throw new Error('Tax rate must be between 0 and 1')

  const profit = Math.max(0, grossReturn - totalInvested)
  const taxes = profit * taxRate
  const netReturn = grossReturn - taxes

  return {
    grossReturn: Math.round(grossReturn * 100) / 100,
    profit: Math.round(profit * 100) / 100,
    taxes: Math.round(taxes * 100) / 100,
    netReturn: Math.round(netReturn * 100) / 100,
    totalInvested: Math.round(totalInvested * 100) / 100
  }
}

/**
 * Determine whether mortgage payoff or investment is the better strategy
 *
 * @param interestSaved - Interest saved by paying off mortgage early
 * @param investmentNetBenefit - Net profit from investment after taxes
 * @returns 'payoff' if mortgage payoff is better, 'invest' if investment is better
 *
 * @example
 * determineBetterStrategy(25000, 30000) // 'invest'
 * determineBetterStrategy(25000, 20000) // 'payoff'
 */
export function determineBetterStrategy(
  interestSaved: number,
  investmentNetBenefit: number
): 'payoff' | 'invest' {
  if (interestSaved < 0) throw new Error('Interest saved cannot be negative')

  return investmentNetBenefit > interestSaved ? 'invest' : 'payoff'
}

/**
 * Calculate monthly payment required for a given loan
 * Uses standard amortization formula: M = P * [r(1+r)^n] / [(1+r)^n - 1]
 *
 * @param principal - Loan amount
 * @param monthlyRate - Monthly interest rate as decimal
 * @param totalMonths - Total number of months for the loan
 * @returns Required monthly payment
 *
 * @example
 * calculateRequiredPayment(300000, 0.00375, 360) // $1390.46
 */
export function calculateRequiredPayment(
  principal: number,
  monthlyRate: number,
  totalMonths: number
): number {
  if (principal <= 0) throw new Error('Principal must be positive')
  if (monthlyRate < 0) throw new Error('Monthly rate cannot be negative')
  if (totalMonths <= 0) throw new Error('Total months must be positive')

  if (monthlyRate === 0) {
    return principal / totalMonths
  }

  const numerator = monthlyRate * Math.pow(1 + monthlyRate, totalMonths)
  const denominator = Math.pow(1 + monthlyRate, totalMonths) - 1

  return principal * (numerator / denominator)
}
