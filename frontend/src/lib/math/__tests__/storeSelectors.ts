/**
 * Store-shaped selectors for testing.
 *
 * These mirror the public computed-property surface of the calculator's Pinia
 * stores (`src/stores/coastFire.ts` and `src/stores/mortgagePayoff.ts`) using
 * pure-function calls into `lib/math`. They exist so the calculator's existing
 * test corpus can be ported with minimal diffs — assertions of the form
 * `store.X` become `selectors.X(state)` and `store.X = Y` becomes
 * `state.X = Y` against a mutable plain-object state.
 *
 * NOT exported from `lib/math/index.ts`; test-only.
 */

import {
  calculateYearsToRetirement,
  calculateRealReturnRate,
  calculateFutureValue,
  adjustTargetForInflation,
  isCoastFireReady,
  calculateAdditionalSavingsNeeded,
  calculateCoastFireAge,
  calculateCoastFireNumber,
  calculateTargetFromMonthlyExpenses,
  calculateExpensesFromTarget,
  generateCoastFireProjectionChart,
  generateRequiredSavingsByAgeChart,
  validateCoastFireInputs,
  calculateMonthlyRate,
  calculatePayoff,
  calculateInvestmentValue,
  calculateAfterTaxReturn,
  determineBetterStrategy,
  generateMortgageBalanceChart,
  generateInterestComparisonChart,
  generateInvestmentComparisonChart,
  type CoastFireInputs
} from '..'

/* -------------------------------------------------------------------------- */
/* Coast FIRE                                                                  */
/* -------------------------------------------------------------------------- */

export type CoastFireField =
  | 'currentAge'
  | 'retirementAge'
  | 'currentSavings'
  | 'expectedReturnRate'
  | 'targetRetirementAmount'
  | 'monthlyExpenses'
  | 'yearlyExpenses'
  | 'withdrawalRate'
  | 'inflationRate'

export type CoastFireErrors = Record<CoastFireField, string>

export interface CoastFireState {
  currentAge: number
  retirementAge: number
  currentSavings: number
  expectedReturnRate: number
  targetRetirementAmount: number
  monthlyExpenses: number
  yearlyExpenses: number
  withdrawalRate: number
  inflationRate: number
  useRealReturns: boolean
  lastEditedField: 'target' | 'monthly' | 'yearly'
  errors: CoastFireErrors
}

const emptyCoastFireErrors = (): CoastFireErrors => ({
  currentAge: '',
  retirementAge: '',
  currentSavings: '',
  expectedReturnRate: '',
  targetRetirementAmount: '',
  monthlyExpenses: '',
  yearlyExpenses: '',
  withdrawalRate: '',
  inflationRate: ''
})

export function createCoastFireState(): CoastFireState {
  return {
    currentAge: 30,
    retirementAge: 65,
    currentSavings: 50000,
    expectedReturnRate: 7,
    targetRetirementAmount: 1000000,
    monthlyExpenses: 0,
    yearlyExpenses: 0,
    withdrawalRate: 4,
    inflationRate: 0,
    useRealReturns: false,
    lastEditedField: 'target',
    errors: emptyCoastFireErrors()
  }
}

export function resetCoastFireToDefaults(state: CoastFireState): void {
  state.currentAge = 30
  state.retirementAge = 65
  state.currentSavings = 50000
  state.expectedReturnRate = 7
  state.targetRetirementAmount = 1000000
  state.monthlyExpenses = 0
  state.yearlyExpenses = 0
  state.withdrawalRate = 4
  state.inflationRate = 0
  state.useRealReturns = false
  state.lastEditedField = 'target'
  state.errors = emptyCoastFireErrors()
}

export function validateCoastFireState(state: CoastFireState): boolean {
  const inputs: CoastFireInputs = {
    currentAge: state.currentAge,
    retirementAge: state.retirementAge,
    currentSavings: state.currentSavings,
    expectedReturnRate: state.expectedReturnRate,
    targetRetirementAmount: state.targetRetirementAmount,
    monthlyExpenses: state.monthlyExpenses,
    yearlyExpenses: state.yearlyExpenses,
    withdrawalRate: state.withdrawalRate,
    inflationRate: state.inflationRate
  }

  const validation = validateCoastFireInputs(inputs)

  state.errors = emptyCoastFireErrors()
  ;(Object.keys(validation.errors) as CoastFireField[]).forEach(key => {
    if (state.errors[key] !== undefined) {
      state.errors[key] = validation.errors[key] || ''
    }
  })

  return validation.isValid
}

export const coastFire = {
  yearsToRetirement(s: CoastFireState): number {
    return calculateYearsToRetirement(s.currentAge, s.retirementAge)
  },

  realReturnRate(s: CoastFireState): number {
    if (!s.useRealReturns) return s.expectedReturnRate
    const realRate = calculateRealReturnRate(s.expectedReturnRate / 100, s.inflationRate / 100)
    return realRate * 100
  },

  effectiveReturnRate(s: CoastFireState): number {
    return s.useRealReturns ? coastFire.realReturnRate(s) : s.expectedReturnRate
  },

  futureValueOfCurrentSavings(s: CoastFireState): number {
    const rate = coastFire.effectiveReturnRate(s) / 100
    const years = coastFire.yearsToRetirement(s)
    return calculateFutureValue(s.currentSavings, rate, years)
  },

  targetFromMonthlyExpenses(s: CoastFireState): number {
    if (s.monthlyExpenses <= 0 || s.withdrawalRate <= 0) return 0
    return Math.round(calculateTargetFromMonthlyExpenses(s.monthlyExpenses, s.withdrawalRate / 100))
  },

  targetFromYearlyExpenses(s: CoastFireState): number {
    if (s.yearlyExpenses <= 0 || s.withdrawalRate <= 0) return 0
    return Math.round(s.yearlyExpenses / (s.withdrawalRate / 100))
  },

  monthlyFromTarget(s: CoastFireState): number {
    if (s.targetRetirementAmount <= 0 || s.withdrawalRate <= 0) return 0
    return calculateExpensesFromTarget(s.targetRetirementAmount, s.withdrawalRate / 100) / 12
  },

  activeTargetAmount(s: CoastFireState): number {
    if (s.lastEditedField === 'monthly' && s.monthlyExpenses > 0) {
      return coastFire.targetFromMonthlyExpenses(s)
    }
    if (s.lastEditedField === 'yearly' && s.yearlyExpenses > 0) {
      return coastFire.targetFromYearlyExpenses(s)
    }
    return s.targetRetirementAmount
  },

  inflationAdjustedTarget(s: CoastFireState): number {
    const target = coastFire.activeTargetAmount(s)
    if (s.useRealReturns) return target
    return adjustTargetForInflation(target, s.inflationRate / 100, coastFire.yearsToRetirement(s))
  },

  isCoastFIREReady(s: CoastFireState): boolean {
    const rate = coastFire.effectiveReturnRate(s) / 100
    const years = coastFire.yearsToRetirement(s)
    const target = coastFire.inflationAdjustedTarget(s)
    return isCoastFireReady(s.currentSavings, target, rate, years)
  },

  additionalSavingsNeeded(s: CoastFireState): number {
    const rate = coastFire.effectiveReturnRate(s) / 100
    const years = coastFire.yearsToRetirement(s)
    const target = coastFire.inflationAdjustedTarget(s)
    return calculateAdditionalSavingsNeeded(s.currentSavings, target, rate, years)
  },

  coastFIREAge(s: CoastFireState): number {
    if (coastFire.isCoastFIREReady(s)) return s.currentAge
    const rate = coastFire.effectiveReturnRate(s) / 100
    const target = coastFire.inflationAdjustedTarget(s)

    if (s.currentSavings <= 0) {
      return s.currentAge + 100
    }

    try {
      return calculateCoastFireAge(s.currentSavings, target, rate, s.currentAge)
    } catch {
      const yearsNeeded = Math.log(target / s.currentSavings) / Math.log(1 + rate)
      return Math.ceil(s.currentAge + yearsNeeded)
    }
  },

  coastFIRENumber(s: CoastFireState): number {
    const rate = coastFire.effectiveReturnRate(s) / 100
    const years = coastFire.yearsToRetirement(s)
    const target = coastFire.inflationAdjustedTarget(s)
    return calculateCoastFireNumber(target, rate, years)
  },

  projectionChartData(s: CoastFireState) {
    const rate = coastFire.effectiveReturnRate(s) / 100
    const target = coastFire.activeTargetAmount(s)
    return generateCoastFireProjectionChart(
      s.currentSavings,
      s.currentAge,
      s.retirementAge,
      rate,
      target,
      s.inflationRate / 100,
      s.useRealReturns
    )
  },

  requiredSavingsByAge(s: CoastFireState) {
    const rate = coastFire.effectiveReturnRate(s) / 100
    const target = coastFire.activeTargetAmount(s)
    return generateRequiredSavingsByAgeChart(
      target,
      s.retirementAge,
      rate,
      s.inflationRate / 100,
      s.useRealReturns
    )
  }
}

/**
 * Mirror of `syncFromMonthlyExpenses` from `stores/coastFire.ts`.
 */
export function syncFromMonthlyExpenses(s: CoastFireState): void {
  s.lastEditedField = 'monthly'
  if (s.withdrawalRate > 0) {
    s.targetRetirementAmount = Math.round(coastFire.targetFromMonthlyExpenses(s))
    s.yearlyExpenses = Math.round(s.monthlyExpenses * 12)
  }
}

/**
 * Mirror of `syncFromYearlyExpenses` from `stores/coastFire.ts`.
 */
export function syncFromYearlyExpenses(s: CoastFireState): void {
  s.lastEditedField = 'yearly'
  if (s.withdrawalRate > 0) {
    s.targetRetirementAmount = Math.round(coastFire.targetFromYearlyExpenses(s))
    s.monthlyExpenses = Math.round(s.yearlyExpenses / 12)
  }
}

/**
 * Mirror of `syncFromTargetAmount` from `stores/coastFire.ts`.
 */
export function syncFromTargetAmount(s: CoastFireState): void {
  s.lastEditedField = 'target'
  if (s.withdrawalRate > 0) {
    s.monthlyExpenses = Math.round(coastFire.monthlyFromTarget(s))
    s.yearlyExpenses = Math.round(s.monthlyExpenses * 12)
  }
}

/* -------------------------------------------------------------------------- */
/* Mortgage Payoff                                                             */
/* -------------------------------------------------------------------------- */

export interface MortgageState {
  principal: number
  yearsLeft: number
  interestRate: number
  monthlyPayment: number
  additionalMonthlyPayment: number
  lumpSumPayment: number
  investmentReturnRate: number
  investmentTaxRate: number
  showInvestmentComparison: boolean
}

export function createMortgageState(): MortgageState {
  return {
    principal: 300000,
    yearsLeft: 25,
    interestRate: 4.5,
    monthlyPayment: 1500,
    additionalMonthlyPayment: 0,
    lumpSumPayment: 0,
    investmentReturnRate: 7,
    investmentTaxRate: 20,
    showInvestmentComparison: false
  }
}

export function resetMortgageToDefaults(state: MortgageState): void {
  state.principal = 300000
  state.yearsLeft = 25
  state.interestRate = 4.5
  state.monthlyPayment = 1500
  state.additionalMonthlyPayment = 0
  state.lumpSumPayment = 0
  state.investmentReturnRate = 7
  state.investmentTaxRate = 20
  state.showInvestmentComparison = false
}

function calculatePayoffTime(s: MortgageState, extraMonthly: number, lumpSum: number): number {
  const totalPayment = s.monthlyPayment + extraMonthly
  try {
    const result = calculatePayoff(s.principal, totalPayment, mortgage.monthlyInterestRate(s), lumpSum)
    return result.months
  } catch {
    if (s.principal <= 0 || totalPayment <= 0) return 0
    if (totalPayment <= s.principal * mortgage.monthlyInterestRate(s)) return 9999
    return 0
  }
}

function calculateTotalInterestInternal(s: MortgageState, extraMonthly: number, lumpSum: number): number {
  const totalPayment = s.monthlyPayment + extraMonthly
  try {
    const result = calculatePayoff(s.principal, totalPayment, mortgage.monthlyInterestRate(s), lumpSum)
    return result.totalInterest
  } catch {
    if (s.principal <= 0 || totalPayment <= 0) return 0
    if (totalPayment <= s.principal * mortgage.monthlyInterestRate(s)) return s.principal * 10
    return 0
  }
}

export const mortgage = {
  monthlyInterestRate(s: MortgageState): number {
    return calculateMonthlyRate(s.interestRate)
  },

  totalMonths(s: MortgageState): number {
    return s.yearsLeft * 12
  },

  basePayoffMonths(s: MortgageState): number {
    return calculatePayoffTime(s, 0, 0)
  },

  baseTotalInterest(s: MortgageState): number {
    return calculateTotalInterestInternal(s, 0, 0)
  },

  acceleratedPayoffMonths(s: MortgageState): number {
    return calculatePayoffTime(s, s.additionalMonthlyPayment, s.lumpSumPayment)
  },

  acceleratedTotalInterest(s: MortgageState): number {
    return calculateTotalInterestInternal(s, s.additionalMonthlyPayment, s.lumpSumPayment)
  },

  monthsSaved(s: MortgageState): number {
    return mortgage.basePayoffMonths(s) - mortgage.acceleratedPayoffMonths(s)
  },

  interestSaved(s: MortgageState): number {
    return mortgage.baseTotalInterest(s) - mortgage.acceleratedTotalInterest(s)
  },

  effectiveInvestmentMonths(s: MortgageState): number {
    const accel = mortgage.acceleratedPayoffMonths(s)
    if (accel >= 9999) {
      const base = mortgage.basePayoffMonths(s)
      return base >= 9999 ? mortgage.totalMonths(s) : base
    }
    return accel
  },

  investmentGrossReturn(s: MortgageState): number {
    const months = mortgage.effectiveInvestmentMonths(s)
    const monthlyReturn = s.investmentReturnRate / 100 / 12
    const result = calculateInvestmentValue(s.lumpSumPayment, s.additionalMonthlyPayment, monthlyReturn, months)
    return result.grossReturn
  },

  totalMonthlyContributions(s: MortgageState): number {
    return s.additionalMonthlyPayment * mortgage.effectiveInvestmentMonths(s)
  },

  totalLumpSumContributions(s: MortgageState): number {
    return s.lumpSumPayment
  },

  totalAllContributions(s: MortgageState): number {
    return mortgage.totalMonthlyContributions(s) + mortgage.totalLumpSumContributions(s)
  },

  investmentProfit(s: MortgageState): number {
    return Math.max(0, mortgage.investmentGrossReturn(s) - mortgage.totalAllContributions(s))
  },

  investmentTaxes(s: MortgageState): number {
    return mortgage.investmentProfit(s) * (s.investmentTaxRate / 100)
  },

  investmentNetReturn(s: MortgageState): number {
    const result = calculateAfterTaxReturn(
      mortgage.investmentGrossReturn(s),
      mortgage.totalAllContributions(s),
      s.investmentTaxRate / 100
    )
    return result.netReturn
  },

  investmentNetBenefit(s: MortgageState): number {
    return mortgage.investmentNetReturn(s) - mortgage.totalAllContributions(s)
  },

  betterStrategy(s: MortgageState): 'payoff' | 'invest' {
    return determineBetterStrategy(mortgage.interestSaved(s), mortgage.investmentNetBenefit(s))
  },

  balanceChartData(s: MortgageState) {
    try {
      return generateMortgageBalanceChart(
        s.principal,
        s.monthlyPayment,
        s.additionalMonthlyPayment,
        mortgage.monthlyInterestRate(s),
        s.lumpSumPayment
      )
    } catch {
      return null
    }
  },

  interestComparisonChartData(s: MortgageState) {
    try {
      return generateInterestComparisonChart(
        s.principal,
        s.monthlyPayment,
        s.additionalMonthlyPayment,
        mortgage.monthlyInterestRate(s),
        s.lumpSumPayment
      )
    } catch {
      return null
    }
  },

  investmentComparisonChartData(s: MortgageState) {
    if (!s.showInvestmentComparison) return null
    try {
      return generateInvestmentComparisonChart(
        s.principal,
        s.monthlyPayment,
        s.additionalMonthlyPayment,
        mortgage.monthlyInterestRate(s),
        s.lumpSumPayment,
        s.investmentReturnRate / 100 / 12,
        s.investmentTaxRate / 100
      )
    } catch {
      return null
    }
  }
}
