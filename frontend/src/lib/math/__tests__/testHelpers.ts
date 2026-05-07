/**
 * Test utilities and helpers
 *
 * Ported from legacy-vue-calc/tests/utils/testHelpers.ts
 */

export interface CoastFireTestScenario {
  currentAge: number
  retirementAge: number
  currentSavings: number
  expectedReturnRate: number
  targetRetirementAmount: number
  expectedResults?: {
    yearsToRetirement?: number
    futureValue?: number
    isCoastFire?: boolean
    additionalNeeded?: number
    coastFireAge?: number
  }
}

export interface MortgageTestScenario {
  principal: number
  yearsLeft: number
  interestRate: number
  monthlyPayment: number
  additionalMonthlyPayment?: number
  lumpSumPayment?: number
  expectedResults?: {
    basePayoffMonths?: number
    baseTotalInterest?: number
    acceleratedPayoffMonths?: number
    acceleratedTotalInterest?: number
  }
}

export const coastFireTestCases: CoastFireTestScenario[] = [
  {
    currentAge: 30,
    retirementAge: 65,
    currentSavings: 50000,
    expectedReturnRate: 7,
    targetRetirementAmount: 1000000,
    expectedResults: {
      yearsToRetirement: 35,
      futureValue: 527633,
      isCoastFire: false
    }
  },
  {
    currentAge: 40,
    retirementAge: 65,
    currentSavings: 200000,
    expectedReturnRate: 7,
    targetRetirementAmount: 1000000,
    expectedResults: {
      yearsToRetirement: 25,
      isCoastFire: true,
      additionalNeeded: 0,
      coastFireAge: 40
    }
  },
  {
    currentAge: 65,
    retirementAge: 65,
    currentSavings: 500000,
    expectedReturnRate: 7,
    targetRetirementAmount: 500000,
    expectedResults: {
      yearsToRetirement: 0,
      futureValue: 500000,
      isCoastFire: true
    }
  },
  {
    currentAge: 30,
    retirementAge: 65,
    currentSavings: 50000,
    expectedReturnRate: 0,
    targetRetirementAmount: 100000,
    expectedResults: {
      yearsToRetirement: 35,
      futureValue: 50000,
      isCoastFire: false
    }
  }
]

export const mortgageTestCases: MortgageTestScenario[] = [
  {
    principal: 300000,
    yearsLeft: 30,
    interestRate: 4.5,
    monthlyPayment: 1520,
    expectedResults: {
      basePayoffMonths: 360
    }
  },
  {
    principal: 250000,
    yearsLeft: 15,
    interestRate: 3.5,
    monthlyPayment: 1789,
    expectedResults: {
      basePayoffMonths: 180
    }
  },
  {
    principal: 300000,
    yearsLeft: 25,
    interestRate: 4.5,
    monthlyPayment: 1667,
    additionalMonthlyPayment: 500,
    lumpSumPayment: 10000
  }
]

export function approxEqual(actual: number, expected: number, tolerance = 0.01): boolean {
  return Math.abs(actual - expected) <= Math.abs(expected * tolerance)
}

export function roundCurrency(amount: number): number {
  return Math.round(amount * 100) / 100
}

export function calculateCompoundInterest(principal: number, rate: number, years: number): number {
  return principal * Math.pow(1 + rate / 100, years)
}

export function calculatePresentValueRaw(futureValue: number, rate: number, years: number): number {
  if (years === 0) return futureValue
  return futureValue / Math.pow(1 + rate / 100, years)
}
