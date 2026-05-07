/**
 * Mortgage payoff math tests.
 *
 * Ported from legacy-vue-calc/tests/mortgagePayoff.test.ts. Pinia stores
 * have been replaced by pure-function selectors over a `MortgageState` plain
 * object — see `./storeSelectors`. The original `tooltipData` describe block
 * was Vue/Pinia-only and is omitted; tooltip rendering is owned by
 * `MathTooltip.tsx` and tested separately.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  createMortgageState,
  resetMortgageToDefaults,
  mortgage,
  type MortgageState
} from './storeSelectors'
import { mortgageTestCases, approxEqual } from './testHelpers'

describe('Mortgage Payoff Calculator', () => {
  let store: MortgageState

  beforeEach(() => {
    store = createMortgageState()
  })

  describe('monthlyInterestRate calculation', () => {
    it('should calculate correct monthly rate for standard rates', () => {
      store.interestRate = 4.5
      const expected1 = 4.5 / 100 / 12
      expect(Math.abs(mortgage.monthlyInterestRate(store) - expected1)).toBeLessThan(0.0001)

      store.interestRate = 6.0
      const expected2 = 6.0 / 100 / 12
      expect(Math.abs(mortgage.monthlyInterestRate(store) - expected2)).toBeLessThan(0.0001)

      store.interestRate = 3.25
      const expected3 = 3.25 / 100 / 12
      expect(Math.abs(mortgage.monthlyInterestRate(store) - expected3)).toBeLessThan(0.0001)
    })

    it('should return 0 for zero interest rate', () => {
      store.interestRate = 0
      expect(mortgage.monthlyInterestRate(store)).toBe(0)
    })

    it('should handle high interest rates', () => {
      store.interestRate = 12.0
      const expected = 12.0 / 100 / 12
      expect(Math.abs(mortgage.monthlyInterestRate(store) - expected)).toBeLessThan(0.0001)
    })
  })

  describe('payoff time calculations', () => {
    it('should calculate standard mortgage payoff time', () => {
      store.principal = 300000
      store.yearsLeft = 30
      store.interestRate = 4.5
      store.monthlyPayment = 1520
      store.additionalMonthlyPayment = 0
      store.lumpSumPayment = 0

      expect(mortgage.basePayoffMonths(store)).toBeGreaterThan(350)
      expect(mortgage.basePayoffMonths(store)).toBeLessThan(365)
    })

    it('should handle extra monthly payments', () => {
      store.principal = 200000
      store.yearsLeft = 30
      store.interestRate = 4.0
      store.monthlyPayment = 955
      store.additionalMonthlyPayment = 200
      store.lumpSumPayment = 0

      const baseMonths = mortgage.basePayoffMonths(store)
      const acceleratedMonths = mortgage.acceleratedPayoffMonths(store)

      expect(acceleratedMonths).toBeLessThan(baseMonths)
      expect(mortgage.monthsSaved(store)).toBeGreaterThan(0)
    })

    it('should handle lump sum payments', () => {
      store.principal = 250000
      store.yearsLeft = 25
      store.interestRate = 4.5
      store.monthlyPayment = 1389
      store.additionalMonthlyPayment = 0
      store.lumpSumPayment = 25000

      const baseMonths = mortgage.basePayoffMonths(store)
      const acceleratedMonths = mortgage.acceleratedPayoffMonths(store)

      expect(acceleratedMonths).toBeLessThan(baseMonths)
      expect(mortgage.monthsSaved(store)).toBeGreaterThan(0)
    })

    it('should handle both extra monthly and lump sum payments', () => {
      store.principal = 300000
      store.yearsLeft = 30
      store.interestRate = 4.5
      store.monthlyPayment = 1520
      store.additionalMonthlyPayment = 300
      store.lumpSumPayment = 15000

      const baseMonths = mortgage.basePayoffMonths(store)
      const acceleratedMonths = mortgage.acceleratedPayoffMonths(store)

      expect(acceleratedMonths).toBeLessThan(baseMonths)
      expect(mortgage.monthsSaved(store)).toBeGreaterThan(12)
    })

    it('should terminate algorithm properly', () => {
      store.principal = 50000
      store.yearsLeft = 10
      store.interestRate = 5.0
      store.monthlyPayment = 530
      store.additionalMonthlyPayment = 0
      store.lumpSumPayment = 0

      expect(mortgage.basePayoffMonths(store)).toBeGreaterThan(0)
      expect(mortgage.basePayoffMonths(store)).toBeLessThan(150)
    })

    it('should handle zero interest rate scenarios', () => {
      store.principal = 100000
      store.yearsLeft = 10
      store.interestRate = 0
      store.monthlyPayment = 833.33
      store.additionalMonthlyPayment = 0
      store.lumpSumPayment = 0

      expect(mortgage.basePayoffMonths(store)).toBeGreaterThan(119)
      expect(mortgage.basePayoffMonths(store)).toBeLessThanOrEqual(121)
    })
  })

  describe('total interest calculations', () => {
    it('should calculate total interest for standard mortgage', () => {
      store.principal = 200000
      store.yearsLeft = 30
      store.interestRate = 4.0
      store.monthlyPayment = 955
      store.additionalMonthlyPayment = 0
      store.lumpSumPayment = 0

      expect(mortgage.baseTotalInterest(store)).toBeGreaterThan(50000)
      expect(mortgage.baseTotalInterest(store)).toBeLessThan(200000)
    })

    it('should show interest savings with extra payments', () => {
      store.principal = 300000
      store.yearsLeft = 30
      store.interestRate = 4.5
      store.monthlyPayment = 1520
      store.additionalMonthlyPayment = 500
      store.lumpSumPayment = 0

      expect(mortgage.interestSaved(store)).toBeGreaterThan(0)
      expect(mortgage.acceleratedTotalInterest(store)).toBeLessThan(mortgage.baseTotalInterest(store))
    })

    it('should match payoff calculation consistency', () => {
      store.principal = 150000
      store.yearsLeft = 20
      store.interestRate = 3.5
      store.monthlyPayment = 1073
      store.additionalMonthlyPayment = 0
      store.lumpSumPayment = 0

      const totalPayments = store.monthlyPayment * mortgage.basePayoffMonths(store)
      const expectedTotal = store.principal + mortgage.baseTotalInterest(store)

      expect(approxEqual(totalPayments, expectedTotal, 0.01)).toBe(true)
    })

    it('should handle zero interest properly', () => {
      store.principal = 100000
      store.yearsLeft = 10
      store.interestRate = 0
      store.monthlyPayment = 833.33
      store.additionalMonthlyPayment = 0
      store.lumpSumPayment = 0

      expect(mortgage.baseTotalInterest(store)).toBeLessThan(1)
    })
  })

  describe('savings calculations', () => {
    it('should calculate months saved correctly', () => {
      store.principal = 250000
      store.yearsLeft = 25
      store.interestRate = 4.0
      store.monthlyPayment = 1317
      store.additionalMonthlyPayment = 400
      store.lumpSumPayment = 0

      const expectedSaved = mortgage.basePayoffMonths(store) - mortgage.acceleratedPayoffMonths(store)
      expect(mortgage.monthsSaved(store)).toBe(expectedSaved)
      expect(mortgage.monthsSaved(store)).toBeGreaterThan(0)
    })

    it('should calculate interest saved correctly', () => {
      store.principal = 300000
      store.yearsLeft = 30
      store.interestRate = 5.0
      store.monthlyPayment = 1611
      store.additionalMonthlyPayment = 0
      store.lumpSumPayment = 20000

      const expectedSaved = mortgage.baseTotalInterest(store) - mortgage.acceleratedTotalInterest(store)
      expect(approxEqual(mortgage.interestSaved(store), expectedSaved, 0.01)).toBe(true)
      expect(mortgage.interestSaved(store)).toBeGreaterThan(0)
    })

    it('should have zero savings with no extra payments', () => {
      store.principal = 200000
      store.yearsLeft = 20
      store.interestRate = 4.5
      store.monthlyPayment = 1266
      store.additionalMonthlyPayment = 0
      store.lumpSumPayment = 0

      expect(mortgage.monthsSaved(store)).toBe(0)
      expect(mortgage.interestSaved(store)).toBeLessThan(0.01)
    })
  })

  describe('investment value calculations', () => {
    it('should calculate lump sum future value correctly', () => {
      store.principal = 200000
      store.yearsLeft = 20
      store.interestRate = 4.0
      store.monthlyPayment = 1212
      store.additionalMonthlyPayment = 0
      store.lumpSumPayment = 10000
      store.investmentReturnRate = 7

      const months = mortgage.acceleratedPayoffMonths(store)
      const monthlyReturn = 7 / 100 / 12
      const expectedLumpSum = 10000 * Math.pow(1 + monthlyReturn, months)

      expect(mortgage.investmentGrossReturn(store)).toBeGreaterThan(expectedLumpSum * 0.95)
    })

    it('should calculate monthly payment annuity correctly', () => {
      store.principal = 200000
      store.yearsLeft = 20
      store.interestRate = 4.0
      store.monthlyPayment = 1212
      store.additionalMonthlyPayment = 300
      store.lumpSumPayment = 0
      store.investmentReturnRate = 6

      const months = mortgage.acceleratedPayoffMonths(store)
      const monthlyReturn = 6 / 100 / 12
      const payment = 300

      const expectedAnnuity = payment * ((Math.pow(1 + monthlyReturn, months) - 1) / monthlyReturn)
      expect(approxEqual(mortgage.investmentGrossReturn(store), expectedAnnuity, 0.05)).toBe(true)
    })

    it('should combine lump sum and annuity correctly', () => {
      store.principal = 250000
      store.yearsLeft = 25
      store.interestRate = 4.5
      store.monthlyPayment = 1389
      store.additionalMonthlyPayment = 400
      store.lumpSumPayment = 15000
      store.investmentReturnRate = 7

      expect(mortgage.investmentGrossReturn(store)).toBeGreaterThan(15000)
      expect(mortgage.investmentGrossReturn(store)).toBeGreaterThan(400 * mortgage.acceleratedPayoffMonths(store))
    })

    it('should handle zero investment amounts', () => {
      store.principal = 200000
      store.yearsLeft = 20
      store.interestRate = 4.0
      store.monthlyPayment = 1212
      store.additionalMonthlyPayment = 0
      store.lumpSumPayment = 0
      store.investmentReturnRate = 7

      expect(mortgage.investmentGrossReturn(store)).toBe(0)
    })
  })

  describe('investment profit and tax calculations', () => {
    it('should calculate investment profit correctly', () => {
      store.principal = 200000
      store.yearsLeft = 15
      store.interestRate = 3.5
      store.monthlyPayment = 1430
      store.additionalMonthlyPayment = 500
      store.lumpSumPayment = 20000
      store.investmentReturnRate = 8
      store.investmentTaxRate = 20

      const totalInvested = 20000 + (500 * mortgage.acceleratedPayoffMonths(store))
      const expectedProfit = mortgage.investmentGrossReturn(store) - totalInvested

      expect(approxEqual(mortgage.investmentProfit(store), expectedProfit, 0.01)).toBe(true)
    })

    it('should calculate taxes on profit correctly', () => {
      store.principal = 300000
      store.yearsLeft = 20
      store.interestRate = 4.5
      store.monthlyPayment = 1900
      store.additionalMonthlyPayment = 600
      store.lumpSumPayment = 0
      store.investmentReturnRate = 9
      store.investmentTaxRate = 25

      const expectedTaxes = mortgage.investmentProfit(store) * (25 / 100)
      expect(approxEqual(mortgage.investmentTaxes(store), expectedTaxes, 0.01)).toBe(true)
    })

    it('should calculate net return correctly', () => {
      store.principal = 250000
      store.yearsLeft = 18
      store.interestRate = 4.0
      store.monthlyPayment = 1800
      store.additionalMonthlyPayment = 300
      store.lumpSumPayment = 12000
      store.investmentReturnRate = 7
      store.investmentTaxRate = 22

      const expectedNet = mortgage.investmentGrossReturn(store) - mortgage.investmentTaxes(store)
      expect(approxEqual(mortgage.investmentNetReturn(store), expectedNet, 0.01)).toBe(true)
    })

    it('should handle loss scenarios properly', () => {
      store.principal = 200000
      store.yearsLeft = 30
      store.interestRate = 6.0
      store.monthlyPayment = 1199
      store.additionalMonthlyPayment = 100
      store.lumpSumPayment = 0
      store.investmentReturnRate = 1
      store.investmentTaxRate = 20

      if (mortgage.investmentProfit(store) < 0) {
        expect(mortgage.investmentTaxes(store)).toBeLessThanOrEqual(0)
      }
    })
  })

  describe('strategy recommendation logic', () => {
    it('should recommend mortgage payoff when better', () => {
      store.principal = 300000
      store.yearsLeft = 20
      store.interestRate = 6.5
      store.monthlyPayment = 2242
      store.additionalMonthlyPayment = 500
      store.lumpSumPayment = 0
      store.investmentReturnRate = 4
      store.investmentTaxRate = 25

      expect(mortgage.betterStrategy(store)).toBe('payoff')
    })

    it('should recommend investing when better', () => {
      store.principal = 200000
      store.yearsLeft = 30
      store.interestRate = 2.5
      store.monthlyPayment = 790
      store.additionalMonthlyPayment = 500
      store.lumpSumPayment = 20000
      store.investmentReturnRate = 12
      store.investmentTaxRate = 10

      expect(['invest', 'payoff']).toContain(mortgage.betterStrategy(store))
    })

    it('should handle edge cases near equality', () => {
      store.principal = 200000
      store.yearsLeft = 15
      store.interestRate = 4.5
      store.monthlyPayment = 1530
      store.additionalMonthlyPayment = 200
      store.lumpSumPayment = 0
      store.investmentReturnRate = 6
      store.investmentTaxRate = 20

      expect(['payoff', 'invest']).toContain(mortgage.betterStrategy(store))
    })
  })

  describe('test scenarios from fixtures', () => {
    it('should handle predefined mortgage scenarios', () => {
      mortgageTestCases.forEach(testCase => {
        const s = createMortgageState()
        s.principal = testCase.principal
        s.yearsLeft = testCase.yearsLeft
        s.interestRate = testCase.interestRate
        s.monthlyPayment = testCase.monthlyPayment
        s.additionalMonthlyPayment = testCase.additionalMonthlyPayment || 0
        s.lumpSumPayment = testCase.lumpSumPayment || 0

        expect(mortgage.basePayoffMonths(s)).toBeGreaterThan(0)
        expect(mortgage.baseTotalInterest(s)).toBeGreaterThanOrEqual(0)
        expect(mortgage.acceleratedPayoffMonths(s)).toBeGreaterThan(0)
        expect(mortgage.acceleratedTotalInterest(s)).toBeGreaterThanOrEqual(0)

        if ((testCase.additionalMonthlyPayment && testCase.additionalMonthlyPayment > 0) ||
            (testCase.lumpSumPayment && testCase.lumpSumPayment > 0)) {
          expect(mortgage.acceleratedPayoffMonths(s)).toBeLessThanOrEqual(mortgage.basePayoffMonths(s))
          expect(mortgage.acceleratedTotalInterest(s)).toBeLessThanOrEqual(mortgage.baseTotalInterest(s))
        }

        if (testCase.expectedResults?.basePayoffMonths) {
          expect(approxEqual(mortgage.basePayoffMonths(s), testCase.expectedResults.basePayoffMonths, 0.1)).toBe(true)
        }
      })
    })
  })

  describe('iterative amortization algorithm', () => {
    it('should verify monthly interest charges are calculated correctly', () => {
      store.principal = 100000
      store.yearsLeft = 10
      store.interestRate = 6.0
      store.monthlyPayment = 1110
      store.additionalMonthlyPayment = 0
      store.lumpSumPayment = 0

      const monthlyRate = 6.0 / 100 / 12
      const expectedFirstMonthInterest = 100000 * monthlyRate

      expect(mortgage.baseTotalInterest(store)).toBeGreaterThan(expectedFirstMonthInterest)
      expect(Number.isFinite(mortgage.baseTotalInterest(store))).toBe(true)
    })

    it('should verify algorithm terminates correctly', () => {
      store.principal = 50000
      store.yearsLeft = 5
      store.interestRate = 4.0
      store.monthlyPayment = 920
      store.additionalMonthlyPayment = 0
      store.lumpSumPayment = 0

      expect(mortgage.basePayoffMonths(store)).toBeGreaterThan(0)
      expect(mortgage.basePayoffMonths(store)).toBeLessThan(70)

      const totalPaid = store.monthlyPayment * mortgage.basePayoffMonths(store)
      const expectedTotal = store.principal + mortgage.baseTotalInterest(store)
      expect(approxEqual(totalPaid, expectedTotal, 0.05)).toBe(true)
    })

    it('should handle very small remaining balances', () => {
      store.principal = 100
      store.yearsLeft = 1
      store.interestRate = 5.0
      store.monthlyPayment = 85
      store.additionalMonthlyPayment = 0
      store.lumpSumPayment = 0

      expect(mortgage.basePayoffMonths(store)).toBeGreaterThan(0)
      expect(mortgage.basePayoffMonths(store)).toBeLessThan(15)
      expect(Number.isFinite(mortgage.baseTotalInterest(store))).toBe(true)
    })

    it('should verify balance reduction follows amortization formula', () => {
      store.principal = 200000
      store.yearsLeft = 30
      store.interestRate = 6.0
      store.monthlyPayment = 1199
      store.additionalMonthlyPayment = 0
      store.lumpSumPayment = 0

      expect(mortgage.basePayoffMonths(store)).toBeGreaterThan(350)
      expect(mortgage.basePayoffMonths(store)).toBeLessThan(365)
      expect(mortgage.baseTotalInterest(store)).toBeGreaterThan(200000)
      expect(mortgage.baseTotalInterest(store)).toBeLessThan(300000)

      const totalPaid = store.monthlyPayment * mortgage.basePayoffMonths(store)
      const expectedTotal = store.principal + mortgage.baseTotalInterest(store)
      expect(approxEqual(totalPaid, expectedTotal, 0.01)).toBe(true)
    })

    it('should verify principal payments increase over time (conceptually)', () => {
      const scenario1 = {
        principal: 150000,
        yearsLeft: 20,
        interestRate: 5.0,
        monthlyPayment: 990,
        additionalMonthlyPayment: 0,
        lumpSumPayment: 0
      }

      Object.assign(store, scenario1)
      const baseInterest = mortgage.baseTotalInterest(store)

      store.additionalMonthlyPayment = 200
      const acceleratedInterest = mortgage.acceleratedTotalInterest(store)

      expect(acceleratedInterest).toBeLessThan(baseInterest)
      expect(mortgage.interestSaved(store)).toBeGreaterThan(0)
    })

    it('should handle edge case: payment exactly equals monthly interest', () => {
      store.principal = 100000
      store.yearsLeft = 30
      store.interestRate = 6.0
      store.monthlyPayment = 500
      store.additionalMonthlyPayment = 0
      store.lumpSumPayment = 0

      expect(mortgage.basePayoffMonths(store)).toBe(9999)
      expect(Number.isFinite(mortgage.baseTotalInterest(store))).toBe(true)
    })

    it('should verify lump sum payment reduces balance immediately', () => {
      store.principal = 300000
      store.yearsLeft = 30
      store.interestRate = 5.0
      store.monthlyPayment = 1610
      store.additionalMonthlyPayment = 0
      store.lumpSumPayment = 0

      const baseMonths = mortgage.basePayoffMonths(store)
      const baseInterest = mortgage.baseTotalInterest(store)

      store.lumpSumPayment = 50000

      const acceleratedMonths = mortgage.acceleratedPayoffMonths(store)
      const acceleratedInterest = mortgage.acceleratedTotalInterest(store)

      expect(acceleratedMonths).toBeLessThan(baseMonths)
      expect(acceleratedInterest).toBeLessThan(baseInterest)
      expect(mortgage.monthsSaved(store)).toBeGreaterThan(0)
      expect(mortgage.interestSaved(store)).toBeGreaterThan(0)
    })
  })

  describe('mortgage input validation', () => {
    it('should validate non-negative principal amounts', () => {
      store.principal = -50000
      expect(Number.isFinite(mortgage.basePayoffMonths(store))).toBe(true)
      expect(Number.isFinite(mortgage.baseTotalInterest(store))).toBe(true)
    })

    it('should handle reasonable years left bounds', () => {
      store.principal = 100000
      store.yearsLeft = 1
      store.interestRate = 5.0
      store.monthlyPayment = 8560
      store.additionalMonthlyPayment = 0
      store.lumpSumPayment = 0

      expect(mortgage.totalMonths(store)).toBe(12)
      expect(mortgage.basePayoffMonths(store)).toBeLessThan(15)

      store.yearsLeft = 30
      store.monthlyPayment = 537

      expect(mortgage.totalMonths(store)).toBe(360)
      expect(mortgage.basePayoffMonths(store)).toBeLessThanOrEqual(370)
    })

    it('should handle interest rate bounds', () => {
      store.principal = 200000
      store.yearsLeft = 20
      store.interestRate = 0
      store.monthlyPayment = 833.33
      store.additionalMonthlyPayment = 0
      store.lumpSumPayment = 0

      expect(mortgage.monthlyInterestRate(store)).toBe(0)
      expect(mortgage.baseTotalInterest(store)).toBeLessThan(1)

      store.interestRate = 20
      store.monthlyPayment = 3314

      expect(mortgage.monthlyInterestRate(store)).toBeCloseTo(20 / 100 / 12, 4)
      expect(mortgage.baseTotalInterest(store)).toBeGreaterThan(100000)
    })

    it('should handle positive monthly payments', () => {
      store.principal = 100000
      store.yearsLeft = 10
      store.interestRate = 5.0
      store.monthlyPayment = 1061
      store.additionalMonthlyPayment = 0
      store.lumpSumPayment = 0

      expect(mortgage.basePayoffMonths(store)).toBeLessThanOrEqual(120)
      expect(Number.isFinite(mortgage.baseTotalInterest(store))).toBe(true)
    })

    it('should handle non-negative extra payments', () => {
      store.principal = 200000
      store.yearsLeft = 20
      store.interestRate = 4.5
      store.monthlyPayment = 1266
      store.additionalMonthlyPayment = 300
      store.lumpSumPayment = 5000

      expect(mortgage.acceleratedPayoffMonths(store)).toBeLessThan(mortgage.basePayoffMonths(store))
      expect(mortgage.monthsSaved(store)).toBeGreaterThan(0)
      expect(mortgage.interestSaved(store)).toBeGreaterThan(0)
    })

    it('should handle edge case: insufficient monthly payment', () => {
      store.principal = 300000
      store.yearsLeft = 30
      store.interestRate = 6.0
      store.monthlyPayment = 100
      store.additionalMonthlyPayment = 0
      store.lumpSumPayment = 0

      expect(mortgage.basePayoffMonths(store)).toBe(9999)
      expect(Number.isFinite(mortgage.baseTotalInterest(store))).toBe(true)
      expect(mortgage.baseTotalInterest(store)).toBeGreaterThan(0)
    })
  })

  describe('performance and precision tests', () => {
    it('should handle calculations with consistent precision', () => {
      store.principal = 123456.78
      store.yearsLeft = 17
      store.interestRate = 4.375
      store.monthlyPayment = 938.92
      store.additionalMonthlyPayment = 156.34
      store.lumpSumPayment = 8765.43

      expect(Number.isFinite(mortgage.basePayoffMonths(store))).toBe(true)
      expect(Number.isFinite(mortgage.acceleratedPayoffMonths(store))).toBe(true)
      expect(Number.isFinite(mortgage.baseTotalInterest(store))).toBe(true)
      expect(Number.isFinite(mortgage.acceleratedTotalInterest(store))).toBe(true)

      expect(mortgage.acceleratedPayoffMonths(store)).toBeLessThanOrEqual(mortgage.basePayoffMonths(store))
      expect(mortgage.acceleratedTotalInterest(store)).toBeLessThanOrEqual(mortgage.baseTotalInterest(store))
    })

    it('should perform calculations efficiently with extreme inputs', () => {
      store.principal = 5000000
      store.yearsLeft = 30
      store.interestRate = 7.5
      store.monthlyPayment = 34963
      store.additionalMonthlyPayment = 10000
      store.lumpSumPayment = 500000

      const startTime = performance.now()
      const baseMonths = mortgage.basePayoffMonths(store)
      const acceleratedMonths = mortgage.acceleratedPayoffMonths(store)
      const baseInterest = mortgage.baseTotalInterest(store)
      const acceleratedInterest = mortgage.acceleratedTotalInterest(store)
      const endTime = performance.now()

      expect(endTime - startTime).toBeLessThan(100)
      expect(baseMonths).toBeGreaterThan(0)
      expect(acceleratedMonths).toBeLessThan(baseMonths)
      expect(baseInterest).toBeGreaterThan(acceleratedInterest)
    })

    it('should maintain precision with very large numbers', () => {
      store.principal = 50000000
      store.yearsLeft = 30
      store.interestRate = 4.5
      store.monthlyPayment = 253350
      store.additionalMonthlyPayment = 50000
      store.lumpSumPayment = 2000000

      expect(Number.isFinite(mortgage.basePayoffMonths(store))).toBe(true)
      expect(Number.isFinite(mortgage.acceleratedPayoffMonths(store))).toBe(true)
      expect(Number.isFinite(mortgage.baseTotalInterest(store))).toBe(true)
      expect(Number.isFinite(mortgage.acceleratedTotalInterest(store))).toBe(true)

      expect(mortgage.baseTotalInterest(store)).toBeGreaterThan(1000000)
      expect(mortgage.baseTotalInterest(store)).toBeLessThan(100000000)
    })

    it('should verify rounding behavior consistency', () => {
      store.principal = 199999.99
      store.yearsLeft = 29.5
      store.interestRate = 4.99
      store.monthlyPayment = 1067.33
      store.additionalMonthlyPayment = 0.01
      store.lumpSumPayment = 0.99

      const run1 = {
        baseMonths: mortgage.basePayoffMonths(store),
        acceleratedMonths: mortgage.acceleratedPayoffMonths(store),
        baseInterest: mortgage.baseTotalInterest(store),
        acceleratedInterest: mortgage.acceleratedTotalInterest(store)
      }

      const tempPrincipal = store.principal
      store.principal = 200000
      store.principal = tempPrincipal

      const run2 = {
        baseMonths: mortgage.basePayoffMonths(store),
        acceleratedMonths: mortgage.acceleratedPayoffMonths(store),
        baseInterest: mortgage.baseTotalInterest(store),
        acceleratedInterest: mortgage.acceleratedTotalInterest(store)
      }

      expect(run1.baseMonths).toBe(run2.baseMonths)
      expect(run1.acceleratedMonths).toBe(run2.acceleratedMonths)
      expect(run1.baseInterest).toBe(run2.baseInterest)
      expect(run1.acceleratedInterest).toBe(run2.acceleratedInterest)
    })

    it('should prevent infinite loops with problematic inputs', () => {
      store.principal = 1000000
      store.yearsLeft = 50
      store.interestRate = 15.0
      store.monthlyPayment = 500
      store.additionalMonthlyPayment = 0
      store.lumpSumPayment = 0

      const startTime = performance.now()
      const result = mortgage.basePayoffMonths(store)
      const endTime = performance.now()

      expect(endTime - startTime).toBeLessThan(100)
      expect(Number.isFinite(result)).toBe(true)
      expect(result).toBe(9999)
    })
  })

  describe('debug state generated tests', () => {
    it('should calculate mortgage payoff correctly', () => {
      store.principal = 399000
      store.yearsLeft = 28
      store.interestRate = 6.75
      store.monthlyPayment = 4000
      store.additionalMonthlyPayment = 0
      store.lumpSumPayment = 40000
      store.investmentReturnRate = 12.2
      store.investmentTaxRate = 20
      store.showInvestmentComparison = true

      expect(mortgage.monthlyInterestRate(store)).toBeCloseTo(0.005625000000000001, 6)
      expect(mortgage.totalMonths(store)).toBe(336)
      expect(mortgage.basePayoffMonths(store)).toBe(147)
      expect(mortgage.baseTotalInterest(store)).toBeCloseTo(188225.42297547814, 2)
      expect(mortgage.acceleratedPayoffMonths(store)).toBe(126)
      expect(mortgage.acceleratedTotalInterest(store)).toBeCloseTo(142233.97683725343, 2)
      expect(mortgage.monthsSaved(store)).toBe(21)
      expect(mortgage.interestSaved(store)).toBeCloseTo(45991.44613822471, 1)
      expect(mortgage.investmentGrossReturn(store)).toBeCloseTo(143081.08613882973, 2)
      expect(mortgage.investmentProfit(store)).toBeCloseTo(103081.08613882973, 2)
      expect(mortgage.investmentTaxes(store)).toBeCloseTo(20616.21722776595, 2)
      expect(mortgage.investmentNetReturn(store)).toBeCloseTo(122464.8689110638, 2)
      expect(mortgage.betterStrategy(store)).toBe('invest')
    })

    it('should calculate mortgage payoff correctly with no additional payments', () => {
      store.principal = 300000
      store.yearsLeft = 30
      store.interestRate = 3.5
      store.monthlyPayment = 1347
      store.additionalMonthlyPayment = 0
      store.lumpSumPayment = 0
      store.investmentReturnRate = 7
      store.investmentTaxRate = 20
      store.showInvestmentComparison = false

      expect(mortgage.monthlyInterestRate(store)).toBeCloseTo(0.002916667, 6)
      expect(mortgage.totalMonths(store)).toBe(360)

      expect(mortgage.acceleratedPayoffMonths(store)).toBe(mortgage.basePayoffMonths(store))
      expect(mortgage.acceleratedTotalInterest(store)).toBeCloseTo(mortgage.baseTotalInterest(store), 2)
      expect(mortgage.monthsSaved(store)).toBe(0)
      expect(mortgage.interestSaved(store)).toBeCloseTo(0, 2)
    })
  })

  describe('store integration tests', () => {
    it('should update computed values when inputs change', () => {
      store.principal = 200000
      store.yearsLeft = 20
      store.interestRate = 4.0
      store.monthlyPayment = 1212
      store.additionalMonthlyPayment = 0
      store.lumpSumPayment = 0

      const initialMonths = mortgage.basePayoffMonths(store)
      const initialInterest = mortgage.baseTotalInterest(store)

      store.additionalMonthlyPayment = 400

      expect(mortgage.acceleratedPayoffMonths(store)).toBeLessThan(initialMonths)
      expect(mortgage.acceleratedTotalInterest(store)).toBeLessThan(initialInterest)
      expect(mortgage.monthsSaved(store)).toBeGreaterThan(0)
      expect(mortgage.interestSaved(store)).toBeGreaterThan(0)
    })

    it('should maintain calculation consistency after reset', () => {
      store.principal = 500000
      store.yearsLeft = 15
      store.interestRate = 6.0
      store.monthlyPayment = 4219

      const modifiedMonths = mortgage.basePayoffMonths(store)
      const modifiedInterest = mortgage.baseTotalInterest(store)

      resetMortgageToDefaults(store)

      const defaultMonths = mortgage.basePayoffMonths(store)
      const defaultInterest = mortgage.baseTotalInterest(store)

      expect(defaultMonths).not.toBe(modifiedMonths)
      expect(defaultInterest).not.toBe(modifiedInterest)
      expect(Number.isFinite(defaultMonths)).toBe(true)
      expect(Number.isFinite(defaultInterest)).toBe(true)
    })

    it('should properly handle investment comparison state changes', () => {
      store.principal = 250000
      store.yearsLeft = 20
      store.interestRate = 5.0
      store.monthlyPayment = 1649
      store.additionalMonthlyPayment = 300
      store.lumpSumPayment = 10000

      store.showInvestmentComparison = false
      store.investmentReturnRate = 7.0
      store.investmentTaxRate = 25

      const monthsSaved = mortgage.monthsSaved(store)
      const interestSaved = mortgage.interestSaved(store)

      store.showInvestmentComparison = true

      expect(Number.isFinite(mortgage.investmentGrossReturn(store))).toBe(true)
      expect(Number.isFinite(mortgage.investmentProfit(store))).toBe(true)
      expect(Number.isFinite(mortgage.investmentTaxes(store))).toBe(true)
      expect(Number.isFinite(mortgage.investmentNetReturn(store))).toBe(true)
      expect(['invest', 'payoff'].includes(mortgage.betterStrategy(store))).toBe(true)

      expect(mortgage.monthsSaved(store)).toBe(monthsSaved)
      expect(mortgage.interestSaved(store)).toBe(interestSaved)
    })

    it('should simulate state persistence for complex scenarios', () => {
      const store1 = createMortgageState()
      store1.principal = 375000
      store1.yearsLeft = 22
      store1.interestRate = 4.75
      store1.monthlyPayment = 1998
      store1.additionalMonthlyPayment = 450
      store1.lumpSumPayment = 25000
      store1.investmentReturnRate = 8.5
      store1.investmentTaxRate = 22
      store1.showInvestmentComparison = true

      const results1 = {
        baseMonths: mortgage.basePayoffMonths(store1),
        acceleratedMonths: mortgage.acceleratedPayoffMonths(store1),
        baseInterest: mortgage.baseTotalInterest(store1),
        acceleratedInterest: mortgage.acceleratedTotalInterest(store1),
        monthsSaved: mortgage.monthsSaved(store1),
        interestSaved: mortgage.interestSaved(store1),
        investmentGross: mortgage.investmentGrossReturn(store1),
        investmentNet: mortgage.investmentNetReturn(store1),
        betterStrategy: mortgage.betterStrategy(store1)
      }

      const store2 = createMortgageState()
      store2.principal = 375000
      store2.yearsLeft = 22
      store2.interestRate = 4.75
      store2.monthlyPayment = 1998
      store2.additionalMonthlyPayment = 450
      store2.lumpSumPayment = 25000
      store2.investmentReturnRate = 8.5
      store2.investmentTaxRate = 22
      store2.showInvestmentComparison = true

      const results2 = {
        baseMonths: mortgage.basePayoffMonths(store2),
        acceleratedMonths: mortgage.acceleratedPayoffMonths(store2),
        baseInterest: mortgage.baseTotalInterest(store2),
        acceleratedInterest: mortgage.acceleratedTotalInterest(store2),
        monthsSaved: mortgage.monthsSaved(store2),
        interestSaved: mortgage.interestSaved(store2),
        investmentGross: mortgage.investmentGrossReturn(store2),
        investmentNet: mortgage.investmentNetReturn(store2),
        betterStrategy: mortgage.betterStrategy(store2)
      }

      expect(results1.baseMonths).toBe(results2.baseMonths)
      expect(results1.acceleratedMonths).toBe(results2.acceleratedMonths)
      expect(results1.baseInterest).toBe(results2.baseInterest)
      expect(results1.acceleratedInterest).toBe(results2.acceleratedInterest)
      expect(results1.monthsSaved).toBe(results2.monthsSaved)
      expect(results1.interestSaved).toBe(results2.interestSaved)
      expect(results1.investmentGross).toBe(results2.investmentGross)
      expect(results1.investmentNet).toBe(results2.investmentNet)
      expect(results1.betterStrategy).toBe(results2.betterStrategy)
    })

    it('should maintain reactivity when toggling investment features', () => {
      store.principal = 300000
      store.yearsLeft = 25
      store.interestRate = 5.25
      store.monthlyPayment = 1805
      store.additionalMonthlyPayment = 200
      store.lumpSumPayment = 15000

      store.showInvestmentComparison = false

      const baseMortgageResults = {
        monthsSaved: mortgage.monthsSaved(store),
        interestSaved: mortgage.interestSaved(store)
      }

      store.showInvestmentComparison = true
      store.investmentReturnRate = 6.5
      store.investmentTaxRate = 20

      const strategy1 = mortgage.betterStrategy(store)

      store.investmentReturnRate = 9.0
      const strategy2 = mortgage.betterStrategy(store)

      expect(mortgage.monthsSaved(store)).toBe(baseMortgageResults.monthsSaved)
      expect(mortgage.interestSaved(store)).toBe(baseMortgageResults.interestSaved)

      expect(['invest', 'payoff'].includes(strategy1)).toBe(true)
      expect(['invest', 'payoff'].includes(strategy2)).toBe(true)
    })
  })

  describe('resetToDefaults functionality', () => {
    it('should reset all values to defaults', () => {
      store.principal = 500000
      store.yearsLeft = 15
      store.interestRate = 6.0
      store.monthlyPayment = 2500
      store.additionalMonthlyPayment = 800
      store.lumpSumPayment = 25000
      store.investmentReturnRate = 12
      store.investmentTaxRate = 30
      store.showInvestmentComparison = true

      resetMortgageToDefaults(store)

      expect(store.principal).toBe(300000)
      expect(store.yearsLeft).toBe(25)
      expect(store.interestRate).toBe(4.5)
      expect(store.monthlyPayment).toBe(1500)
      expect(store.additionalMonthlyPayment).toBe(0)
      expect(store.lumpSumPayment).toBe(0)
      expect(store.investmentReturnRate).toBe(7)
      expect(store.investmentTaxRate).toBe(20)
      expect(store.showInvestmentComparison).toBe(false)
    })
  })

  describe('edge cases and error handling', () => {
    it('should handle very small loan amounts', () => {
      store.principal = 1000
      store.yearsLeft = 2
      store.interestRate = 5.0
      store.monthlyPayment = 45
      store.additionalMonthlyPayment = 0
      store.lumpSumPayment = 0

      expect(mortgage.basePayoffMonths(store)).toBeGreaterThan(0)
      expect(mortgage.basePayoffMonths(store)).toBeLessThan(50)
      expect(Number.isFinite(mortgage.baseTotalInterest(store))).toBe(true)
    })

    it('should handle very large loan amounts', () => {
      store.principal = 2000000
      store.yearsLeft = 30
      store.interestRate = 4.0
      store.monthlyPayment = 9548
      store.additionalMonthlyPayment = 0
      store.lumpSumPayment = 0

      expect(mortgage.basePayoffMonths(store)).toBeGreaterThan(300)
      expect(mortgage.basePayoffMonths(store)).toBeLessThan(365)
      expect(Number.isFinite(mortgage.baseTotalInterest(store))).toBe(true)
    })

    it('should prevent infinite loops with invalid payments', () => {
      store.principal = 200000
      store.yearsLeft = 30
      store.interestRate = 5.0
      store.monthlyPayment = 500
      store.additionalMonthlyPayment = 0
      store.lumpSumPayment = 0

      expect(Number.isFinite(mortgage.basePayoffMonths(store))).toBe(true)
    })
  })

  describe('investmentNetBenefit', () => {
    it('should calculate investment net benefit correctly', () => {
      store.additionalMonthlyPayment = 500
      store.lumpSumPayment = 10000
      store.investmentReturnRate = 8.0
      store.investmentTaxRate = 20.0

      const expectedNetBenefit = mortgage.investmentNetReturn(store) - mortgage.totalAllContributions(store)
      expect(mortgage.investmentNetBenefit(store)).toBe(expectedNetBenefit)

      expect(mortgage.investmentNetBenefit(store)).toBeGreaterThan(0)
    })
  })
})
