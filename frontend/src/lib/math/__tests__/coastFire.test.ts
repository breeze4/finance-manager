/**
 * Coast FIRE math tests.
 *
 * Ported from legacy-vue-calc/tests/coastFire.test.ts. The original used a
 * Pinia store; here each test mutates a plain `CoastFireState` and reads via
 * the pure-function selectors in `./storeSelectors`.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  createCoastFireState,
  resetCoastFireToDefaults,
  validateCoastFireState,
  syncFromMonthlyExpenses,
  syncFromYearlyExpenses,
  syncFromTargetAmount,
  coastFire,
  type CoastFireState
} from './storeSelectors'
import {
  coastFireTestCases,
  approxEqual,
  calculateCompoundInterest,
  calculatePresentValueRaw
} from './testHelpers'

describe('Coast FIRE Calculator', () => {
  let store: CoastFireState

  beforeEach(() => {
    store = createCoastFireState()
  })

  describe('yearsToRetirement calculation', () => {
    it('should calculate correct years for normal cases', () => {
      store.currentAge = 30
      store.retirementAge = 65
      expect(coastFire.yearsToRetirement(store)).toBe(35)

      store.currentAge = 45
      store.retirementAge = 62
      expect(coastFire.yearsToRetirement(store)).toBe(17)
    })

    it('should return 0 when current age equals retirement age', () => {
      store.currentAge = 65
      store.retirementAge = 65
      expect(coastFire.yearsToRetirement(store)).toBe(0)
    })

    it('should return 0 when current age is greater than retirement age', () => {
      store.currentAge = 70
      store.retirementAge = 65
      expect(coastFire.yearsToRetirement(store)).toBe(0)
    })
  })

  describe('futureValueOfCurrentSavings calculation', () => {
    it('should calculate compound interest correctly', () => {
      store.currentSavings = 10000
      store.expectedReturnRate = 7
      store.currentAge = 30
      store.retirementAge = 40

      const expected = calculateCompoundInterest(10000, 7, 10)
      expect(approxEqual(coastFire.futureValueOfCurrentSavings(store), expected, 0.001)).toBe(true)
    })

    it('should return original amount when return rate is 0', () => {
      store.currentSavings = 50000
      store.expectedReturnRate = 0
      store.currentAge = 30
      store.retirementAge = 65

      expect(coastFire.futureValueOfCurrentSavings(store)).toBe(50000)
    })

    it('should handle zero years to retirement', () => {
      store.currentSavings = 100000
      store.expectedReturnRate = 7
      store.currentAge = 65
      store.retirementAge = 65

      expect(coastFire.futureValueOfCurrentSavings(store)).toBe(100000)
    })

    it('should calculate correctly for high return rates', () => {
      store.currentSavings = 10000
      store.expectedReturnRate = 15
      store.currentAge = 25
      store.retirementAge = 45

      const expected = calculateCompoundInterest(10000, 15, 20)
      expect(approxEqual(coastFire.futureValueOfCurrentSavings(store), expected, 0.001)).toBe(true)
    })

    it('should handle long time periods correctly', () => {
      store.currentSavings = 25000
      store.expectedReturnRate = 8
      store.currentAge = 25
      store.retirementAge = 65

      const expected = calculateCompoundInterest(25000, 8, 40)
      expect(approxEqual(coastFire.futureValueOfCurrentSavings(store), expected, 0.001)).toBe(true)
    })
  })

  describe('isCoastFIREReady boolean logic', () => {
    it('should return true when future value exceeds target', () => {
      store.currentSavings = 200000
      store.expectedReturnRate = 7
      store.currentAge = 40
      store.retirementAge = 65
      store.targetRetirementAmount = 500000

      expect(coastFire.isCoastFIREReady(store)).toBe(true)
    })

    it('should return true when future value equals target exactly', () => {
      store.currentSavings = 100000
      store.expectedReturnRate = 7
      store.currentAge = 40
      store.retirementAge = 50

      const futureValue = calculateCompoundInterest(100000, 7, 10)
      store.targetRetirementAmount = futureValue

      expect(coastFire.isCoastFIREReady(store)).toBe(true)
    })

    it('should return false when future value is less than target', () => {
      store.currentSavings = 50000
      store.expectedReturnRate = 5
      store.currentAge = 35
      store.retirementAge = 65
      store.targetRetirementAmount = 1500000

      expect(coastFire.isCoastFIREReady(store)).toBe(false)
    })
  })

  describe('additionalSavingsNeeded calculation', () => {
    it('should return 0 when already Coast FIRE ready', () => {
      store.currentSavings = 300000
      store.expectedReturnRate = 7
      store.currentAge = 40
      store.retirementAge = 65
      store.targetRetirementAmount = 1000000

      expect(coastFire.isCoastFIREReady(store)).toBe(true)
      expect(coastFire.additionalSavingsNeeded(store)).toBe(0)
    })

    it('should calculate correct present value when not ready', () => {
      store.currentSavings = 50000
      store.expectedReturnRate = 7
      store.currentAge = 30
      store.retirementAge = 65
      store.targetRetirementAmount = 1000000

      const presentValueNeeded = calculatePresentValueRaw(1000000, 7, 35)
      const expectedAdditional = Math.max(0, presentValueNeeded - 50000)

      expect(approxEqual(coastFire.additionalSavingsNeeded(store), expectedAdditional, 0.01)).toBe(true)
    })

    it('should handle zero time remaining edge case', () => {
      store.currentSavings = 500000
      store.expectedReturnRate = 7
      store.currentAge = 65
      store.retirementAge = 65
      store.targetRetirementAmount = 800000

      const expected = 800000 - 500000
      expect(coastFire.additionalSavingsNeeded(store)).toBe(expected)
    })

    it('should never return negative values', () => {
      store.currentSavings = 1000000
      store.expectedReturnRate = 7
      store.currentAge = 30
      store.retirementAge = 65
      store.targetRetirementAmount = 500000

      expect(coastFire.additionalSavingsNeeded(store)).toBeGreaterThanOrEqual(0)
    })
  })

  describe('coastFIREAge calculation', () => {
    it('should return current age when already Coast FIRE ready', () => {
      store.currentAge = 40
      store.currentSavings = 300000
      store.expectedReturnRate = 7
      store.retirementAge = 65
      store.targetRetirementAmount = 1000000

      expect(coastFire.isCoastFIREReady(store)).toBe(true)
      expect(coastFire.coastFIREAge(store)).toBe(40)
    })

    it('should calculate correct age using logarithmic formula', () => {
      store.currentAge = 30
      store.currentSavings = 50000
      store.expectedReturnRate = 7
      store.retirementAge = 65
      store.targetRetirementAmount = 1000000

      const rate = 7 / 100
      const yearsNeeded = Math.log(1000000 / 50000) / Math.log(1 + rate)
      const expectedAge = Math.ceil(30 + yearsNeeded)

      expect(coastFire.coastFIREAge(store)).toBe(expectedAge)
    })

    it('should handle high return rates', () => {
      store.currentAge = 25
      store.currentSavings = 10000
      store.expectedReturnRate = 12
      store.retirementAge = 65
      store.targetRetirementAmount = 1000000

      expect(coastFire.coastFIREAge(store)).toBeGreaterThanOrEqual(25)
      expect(coastFire.coastFIREAge(store)).toBeLessThanOrEqual(100)
    })

    it('should handle low return rates', () => {
      store.currentAge = 25
      store.currentSavings = 100000
      store.expectedReturnRate = 3
      store.retirementAge = 65
      store.targetRetirementAmount = 500000

      expect(coastFire.coastFIREAge(store)).toBeGreaterThanOrEqual(0)
      expect(coastFire.coastFIREAge(store)).toBeLessThanOrEqual(100)
      expect(typeof coastFire.coastFIREAge(store)).toBe('number')
      expect(Number.isFinite(coastFire.coastFIREAge(store))).toBe(true)
    })
  })

  describe('input validation', () => {
    it('should validate age ranges', () => {
      store.currentAge = 17
      validateCoastFireState(store)
      expect(store.errors.currentAge).toContain('between 18 and 100')

      store.currentAge = 101
      validateCoastFireState(store)
      expect(store.errors.currentAge).toContain('between 18 and 100')

      store.currentAge = 30
      validateCoastFireState(store)
      expect(store.errors.currentAge).toBe('')
    })

    it('should validate retirement age vs current age', () => {
      store.currentAge = 40
      store.retirementAge = 35
      validateCoastFireState(store)
      expect(store.errors.retirementAge).toContain('greater than current age')

      store.retirementAge = 65
      validateCoastFireState(store)
      expect(store.errors.retirementAge).toBe('')
    })

    it('should validate non-negative savings', () => {
      store.currentSavings = -1000
      validateCoastFireState(store)
      expect(store.errors.currentSavings).toContain('cannot be negative')

      store.currentSavings = 50000
      validateCoastFireState(store)
      expect(store.errors.currentSavings).toBe('')
    })

    it('should validate return rate bounds', () => {
      store.expectedReturnRate = -1
      validateCoastFireState(store)
      expect(store.errors.expectedReturnRate).toContain('between 0% and 30%')

      store.expectedReturnRate = 31
      validateCoastFireState(store)
      expect(store.errors.expectedReturnRate).toContain('between 0% and 30%')

      store.expectedReturnRate = 7
      validateCoastFireState(store)
      expect(store.errors.expectedReturnRate).toBe('')
    })

    it('should validate positive target amounts', () => {
      store.targetRetirementAmount = 0
      validateCoastFireState(store)
      expect(store.errors.targetRetirementAmount).toContain('greater than 0')

      store.targetRetirementAmount = -50000
      validateCoastFireState(store)
      expect(store.errors.targetRetirementAmount).toContain('greater than 0')

      store.targetRetirementAmount = 1000000
      validateCoastFireState(store)
      expect(store.errors.targetRetirementAmount).toBe('')
    })
  })

  describe('test scenarios from fixtures', () => {
    it('should handle all predefined test cases', () => {
      coastFireTestCases.forEach(testCase => {
        const s = createCoastFireState()
        s.currentAge = testCase.currentAge
        s.retirementAge = testCase.retirementAge
        s.currentSavings = testCase.currentSavings
        s.expectedReturnRate = testCase.expectedReturnRate
        s.targetRetirementAmount = testCase.targetRetirementAmount

        if (testCase.expectedResults) {
          const { expectedResults } = testCase

          if (expectedResults.yearsToRetirement !== undefined) {
            expect(coastFire.yearsToRetirement(s)).toBe(expectedResults.yearsToRetirement)
          }

          if (expectedResults.futureValue !== undefined) {
            expect(approxEqual(coastFire.futureValueOfCurrentSavings(s), expectedResults.futureValue, 0.1)).toBe(true)
          }

          if (expectedResults.isCoastFire !== undefined) {
            expect(coastFire.isCoastFIREReady(s)).toBe(expectedResults.isCoastFire)
          }

          if (expectedResults.additionalNeeded !== undefined) {
            expect(coastFire.additionalSavingsNeeded(s)).toBe(expectedResults.additionalNeeded)
          }

          if (expectedResults.coastFireAge !== undefined) {
            expect(coastFire.coastFIREAge(s)).toBe(expectedResults.coastFireAge)
          }
        }
      })
    })
  })

  describe('mathematical edge cases', () => {
    it('should handle zero current savings scenarios', () => {
      store.currentAge = 25
      store.retirementAge = 65
      store.currentSavings = 0
      store.expectedReturnRate = 8
      store.targetRetirementAmount = 1000000

      expect(coastFire.futureValueOfCurrentSavings(store)).toBe(0)
      expect(coastFire.isCoastFIREReady(store)).toBe(false)
      expect(coastFire.additionalSavingsNeeded(store)).toBeGreaterThan(0)
      expect(typeof coastFire.coastFIREAge(store)).toBe('number')
    })

    it('should handle very large numbers (millions/billions)', () => {
      store.currentAge = 30
      store.retirementAge = 65
      store.currentSavings = 10000000
      store.expectedReturnRate = 7
      store.targetRetirementAmount = 50000000

      expect(Number.isFinite(coastFire.futureValueOfCurrentSavings(store))).toBe(true)
      expect(Number.isFinite(coastFire.additionalSavingsNeeded(store))).toBe(true)
      expect(Number.isFinite(coastFire.coastFIREAge(store))).toBe(true)
      expect(coastFire.futureValueOfCurrentSavings(store)).toBeGreaterThan(0)
    })

    it('should handle precision and rounding behavior', () => {
      store.currentAge = 30
      store.retirementAge = 31
      store.currentSavings = 12345.67
      store.expectedReturnRate = 7.123
      store.targetRetirementAmount = 98765.43

      expect(Number.isFinite(coastFire.futureValueOfCurrentSavings(store))).toBe(true)
      expect(Number.isFinite(coastFire.additionalSavingsNeeded(store))).toBe(true)

      expect(coastFire.yearsToRetirement(store)).toBe(1)
      const expected = 12345.67 * (1 + 7.123 / 100)
      expect(coastFire.futureValueOfCurrentSavings(store)).toBeCloseTo(expected, 0)
    })

    it('should handle zero return rate scenarios', () => {
      store.currentAge = 30
      store.retirementAge = 65
      store.currentSavings = 100000
      store.expectedReturnRate = 0
      store.targetRetirementAmount = 500000

      expect(coastFire.futureValueOfCurrentSavings(store)).toBe(100000)
      expect(coastFire.isCoastFIREReady(store)).toBe(false)
      expect(coastFire.additionalSavingsNeeded(store)).toBe(400000)
      expect(typeof coastFire.coastFIREAge(store)).toBe('number')
    })

    it('should handle extreme return rates', () => {
      store.currentAge = 25
      store.retirementAge = 65
      store.currentSavings = 1000
      store.expectedReturnRate = 30
      store.targetRetirementAmount = 1000000

      expect(Number.isFinite(coastFire.futureValueOfCurrentSavings(store))).toBe(true)
      expect(Number.isFinite(coastFire.coastFIREAge(store))).toBe(true)
      expect(coastFire.futureValueOfCurrentSavings(store)).toBeGreaterThan(1000)
      expect(coastFire.coastFIREAge(store)).toBeLessThan(65)
    })
  })

  describe('performance and precision tests', () => {
    it('should handle calculations with consistent precision', () => {
      store.currentAge = 28.5
      store.retirementAge = 64.3
      store.currentSavings = 87654.32
      store.expectedReturnRate = 7.123
      store.targetRetirementAmount = 1234567.89

      expect(Number.isFinite(coastFire.futureValueOfCurrentSavings(store))).toBe(true)
      expect(Number.isFinite(coastFire.additionalSavingsNeeded(store))).toBe(true)
      expect(Number.isFinite(coastFire.coastFIREAge(store))).toBe(true)

      expect(coastFire.yearsToRetirement(store)).toBeCloseTo(35.8, 1)
    })

    it('should perform calculations efficiently with extreme inputs', () => {
      store.currentAge = 25
      store.retirementAge = 65
      store.currentSavings = 50000000
      store.expectedReturnRate = 8.5
      store.targetRetirementAmount = 100000000

      const startTime = performance.now()
      const futureValue = coastFire.futureValueOfCurrentSavings(store)
      const additionalNeeded = coastFire.additionalSavingsNeeded(store)
      const coastAge = coastFire.coastFIREAge(store)
      coastFire.isCoastFIREReady(store)
      const endTime = performance.now()

      expect(endTime - startTime).toBeLessThan(50)
      expect(futureValue).toBeGreaterThan(50000000)
      expect(Number.isFinite(additionalNeeded)).toBe(true)
      expect(Number.isFinite(coastAge)).toBe(true)
    })

    it('should maintain precision with very large numbers', () => {
      store.currentAge = 30
      store.retirementAge = 60
      store.currentSavings = 25000000
      store.expectedReturnRate = 6.0
      store.targetRetirementAmount = 50000000

      expect(Number.isFinite(coastFire.futureValueOfCurrentSavings(store))).toBe(true)
      expect(Number.isFinite(coastFire.additionalSavingsNeeded(store))).toBe(true)
      expect(Number.isFinite(coastFire.coastFIREAge(store))).toBe(true)

      expect(coastFire.futureValueOfCurrentSavings(store)).toBeGreaterThan(25000000)
      expect(coastFire.futureValueOfCurrentSavings(store)).toBeLessThan(500000000)
    })

    it('should verify rounding behavior consistency', () => {
      store.currentAge = 30.99
      store.retirementAge = 65.01
      store.currentSavings = 49999.99
      store.expectedReturnRate = 7.001
      store.targetRetirementAmount = 999999.99

      const run1 = {
        futureValue: coastFire.futureValueOfCurrentSavings(store),
        additionalNeeded: coastFire.additionalSavingsNeeded(store),
        coastAge: coastFire.coastFIREAge(store),
        isReady: coastFire.isCoastFIREReady(store)
      }

      const tempAge = store.currentAge
      store.currentAge = 31
      store.currentAge = tempAge

      const run2 = {
        futureValue: coastFire.futureValueOfCurrentSavings(store),
        additionalNeeded: coastFire.additionalSavingsNeeded(store),
        coastAge: coastFire.coastFIREAge(store),
        isReady: coastFire.isCoastFIREReady(store)
      }

      expect(run1.futureValue).toBe(run2.futureValue)
      expect(run1.additionalNeeded).toBe(run2.additionalNeeded)
      expect(run1.coastAge).toBe(run2.coastAge)
      expect(run1.isReady).toBe(run2.isReady)
    })

    it('should handle extreme return rates without performance issues', () => {
      store.currentAge = 20
      store.retirementAge = 70
      store.currentSavings = 1000
      store.targetRetirementAmount = 10000000

      const testCases = [0.1, 15.5, 29.9]

      testCases.forEach(rate => {
        store.expectedReturnRate = rate
        const startTime = performance.now()
        const futureValue = coastFire.futureValueOfCurrentSavings(store)
        const coastAge = coastFire.coastFIREAge(store)
        const endTime = performance.now()

        expect(endTime - startTime).toBeLessThan(10)
        expect(Number.isFinite(futureValue)).toBe(true)
        expect(typeof coastAge).toBe('number')
      })
    })
  })

  describe('monthly expenses and withdrawal rate calculations', () => {
    it('calculates target from monthly expenses correctly', () => {
      store.monthlyExpenses = 4000
      store.withdrawalRate = 4
      expect(coastFire.targetFromMonthlyExpenses(store)).toBe(1200000)
    })

    it('calculates monthly from target correctly', () => {
      store.targetRetirementAmount = 1000000
      store.withdrawalRate = 4
      expect(coastFire.monthlyFromTarget(store)).toBeCloseTo(3333.33, 2)
    })

    it('handles zero values in calculations', () => {
      store.monthlyExpenses = 0
      store.withdrawalRate = 4
      expect(coastFire.targetFromMonthlyExpenses(store)).toBe(0)

      store.monthlyExpenses = 4000
      store.withdrawalRate = 0
      expect(coastFire.targetFromMonthlyExpenses(store)).toBe(0)
    })

    it('bidirectional sync works correctly', () => {
      store.monthlyExpenses = 5000
      store.withdrawalRate = 4
      syncFromMonthlyExpenses(store)

      expect(store.lastEditedField).toBe('monthly')
      expect(store.targetRetirementAmount).toBe(1500000)

      store.targetRetirementAmount = 2000000
      syncFromTargetAmount(store)

      expect(store.lastEditedField).toBe('target')
      expect(store.monthlyExpenses).toBe(6667)
    })

    it('should update target retirement amount when monthly expenses change', () => {
      store.targetRetirementAmount = 1000000
      store.withdrawalRate = 4
      store.monthlyExpenses = 0

      store.monthlyExpenses = 3000
      syncFromMonthlyExpenses(store)

      expect(store.targetRetirementAmount).toBe(900000)
      expect(coastFire.activeTargetAmount(store)).toBe(900000)
      expect(store.lastEditedField).toBe('monthly')
    })

    it('should update monthly expenses when target retirement amount changes', () => {
      store.monthlyExpenses = 4000
      store.withdrawalRate = 4
      store.targetRetirementAmount = 0

      store.targetRetirementAmount = 1500000
      syncFromTargetAmount(store)

      expect(store.monthlyExpenses).toBe(5000)
      expect(coastFire.activeTargetAmount(store)).toBe(1500000)
      expect(store.lastEditedField).toBe('target')
    })

    it('should round monthly expenses to nearest dollar when syncing from target', () => {
      store.withdrawalRate = 4

      store.targetRetirementAmount = 1000000
      syncFromTargetAmount(store)
      expect(store.monthlyExpenses).toBe(3333)

      store.targetRetirementAmount = 1350000
      syncFromTargetAmount(store)
      expect(store.monthlyExpenses).toBe(4500)

      store.targetRetirementAmount = 1234567
      syncFromTargetAmount(store)
      expect(store.monthlyExpenses).toBe(4115)
    })

    it('should NOT update target when monthly expenses is zero (bug test)', () => {
      store.targetRetirementAmount = 1000000
      store.withdrawalRate = 4
      store.monthlyExpenses = 0
      store.lastEditedField = 'target'

      store.monthlyExpenses = 3000
      syncFromMonthlyExpenses(store)

      expect(store.targetRetirementAmount).toBe(900000)
      expect(store.lastEditedField).toBe('monthly')
    })

    it('should update target even when clearing monthly expenses to zero', () => {
      store.monthlyExpenses = 5000
      store.withdrawalRate = 4
      syncFromMonthlyExpenses(store)
      expect(store.targetRetirementAmount).toBe(1500000)

      store.monthlyExpenses = 0
      syncFromMonthlyExpenses(store)

      expect(store.targetRetirementAmount).toBe(0)
      expect(store.lastEditedField).toBe('monthly')
    })

    it('activeTargetAmount uses correct value based on last edited field', () => {
      store.targetRetirementAmount = 1000000
      store.monthlyExpenses = 4000
      store.withdrawalRate = 4
      store.lastEditedField = 'target'

      expect(coastFire.activeTargetAmount(store)).toBe(1000000)

      store.lastEditedField = 'monthly'
      expect(coastFire.activeTargetAmount(store)).toBe(1200000)

      store.monthlyExpenses = 0
      store.lastEditedField = 'monthly'
      expect(coastFire.activeTargetAmount(store)).toBe(1000000)
    })

    it('calculations use activeTargetAmount correctly', () => {
      store.currentAge = 30
      store.retirementAge = 65
      store.currentSavings = 100000
      store.expectedReturnRate = 7
      store.monthlyExpenses = 4000
      store.withdrawalRate = 4
      store.lastEditedField = 'monthly'

      const futureValue = coastFire.futureValueOfCurrentSavings(store)
      expect(coastFire.isCoastFIREReady(store)).toBe(futureValue >= 1200000)
    })
  })

  describe('yearly expenses field and three-way synchronization', () => {
    it('calculates target from yearly expenses correctly', () => {
      store.yearlyExpenses = 48000
      store.withdrawalRate = 4
      expect(coastFire.targetFromYearlyExpenses(store)).toBe(1200000)
    })

    it('handles zero values in yearly expense calculations', () => {
      store.yearlyExpenses = 0
      store.withdrawalRate = 4
      expect(coastFire.targetFromYearlyExpenses(store)).toBe(0)

      store.yearlyExpenses = 60000
      store.withdrawalRate = 0
      expect(coastFire.targetFromYearlyExpenses(store)).toBe(0)
    })

    it('syncs from yearly expenses to monthly and target', () => {
      store.withdrawalRate = 4
      store.yearlyExpenses = 60000
      syncFromYearlyExpenses(store)

      expect(store.lastEditedField).toBe('yearly')
      expect(store.targetRetirementAmount).toBe(1500000)
      expect(store.monthlyExpenses).toBe(5000)
    })

    it('syncs from monthly expenses to yearly and target', () => {
      store.withdrawalRate = 4
      store.monthlyExpenses = 4000
      syncFromMonthlyExpenses(store)

      expect(store.lastEditedField).toBe('monthly')
      expect(store.targetRetirementAmount).toBe(1200000)
      expect(store.yearlyExpenses).toBe(48000)
    })

    it('syncs from target amount to monthly and yearly', () => {
      store.withdrawalRate = 4
      store.targetRetirementAmount = 2000000
      syncFromTargetAmount(store)

      expect(store.lastEditedField).toBe('target')
      expect(store.monthlyExpenses).toBe(6667)
      expect(store.yearlyExpenses).toBe(80004)
    })

    it('rounds values correctly when syncing between fields', () => {
      store.withdrawalRate = 3.5

      store.yearlyExpenses = 50000
      syncFromYearlyExpenses(store)
      expect(store.monthlyExpenses).toBe(4167)

      store.monthlyExpenses = 3333
      syncFromMonthlyExpenses(store)
      expect(store.yearlyExpenses).toBe(39996)

      store.targetRetirementAmount = 1234567
      syncFromTargetAmount(store)
      expect(store.monthlyExpenses).toBe(3601)
      expect(store.yearlyExpenses).toBe(43212)
    })

    it('activeTargetAmount uses correct value based on last edited field (three-way)', () => {
      store.targetRetirementAmount = 1000000
      store.monthlyExpenses = 4000
      store.yearlyExpenses = 60000
      store.withdrawalRate = 4

      store.lastEditedField = 'target'
      expect(coastFire.activeTargetAmount(store)).toBe(1000000)

      store.lastEditedField = 'monthly'
      expect(coastFire.activeTargetAmount(store)).toBe(1200000)

      store.lastEditedField = 'yearly'
      expect(coastFire.activeTargetAmount(store)).toBe(1500000)
    })

    it('handles clearing expenses fields to zero', () => {
      store.withdrawalRate = 4

      store.yearlyExpenses = 60000
      syncFromYearlyExpenses(store)
      expect(store.targetRetirementAmount).toBe(1500000)
      expect(store.monthlyExpenses).toBe(5000)

      store.yearlyExpenses = 0
      syncFromYearlyExpenses(store)
      expect(store.targetRetirementAmount).toBe(0)
      expect(store.monthlyExpenses).toBe(0)

      store.monthlyExpenses = 3000
      syncFromMonthlyExpenses(store)
      expect(store.targetRetirementAmount).toBe(900000)
      expect(store.yearlyExpenses).toBe(36000)

      store.monthlyExpenses = 0
      syncFromMonthlyExpenses(store)
      expect(store.targetRetirementAmount).toBe(0)
      expect(store.yearlyExpenses).toBe(0)
    })

    it('validates yearly expenses not negative', () => {
      store.yearlyExpenses = -1000
      validateCoastFireState(store)
      expect(store.errors.yearlyExpenses).toContain('cannot be negative')

      store.yearlyExpenses = 0
      validateCoastFireState(store)
      expect(store.errors.yearlyExpenses).toBe('')

      store.yearlyExpenses = 50000
      validateCoastFireState(store)
      expect(store.errors.yearlyExpenses).toBe('')
    })

    it('resetToDefaults includes yearly expenses', () => {
      store.yearlyExpenses = 72000
      store.monthlyExpenses = 6000
      store.lastEditedField = 'yearly'

      resetCoastFireToDefaults(store)

      expect(store.yearlyExpenses).toBe(0)
      expect(store.monthlyExpenses).toBe(0)
      expect(store.lastEditedField).toBe('target')
    })

    it('three-way sync maintains consistency', () => {
      store.withdrawalRate = 4

      store.targetRetirementAmount = 1000000
      syncFromTargetAmount(store)

      const monthlyFromTarget = store.monthlyExpenses

      syncFromMonthlyExpenses(store)
      expect(store.targetRetirementAmount).toBe(Math.round((monthlyFromTarget * 12) / 0.04))
      expect(store.yearlyExpenses).toBe(monthlyFromTarget * 12)

      store.yearlyExpenses = 48000
      syncFromYearlyExpenses(store)
      expect(store.targetRetirementAmount).toBe(1200000)
      expect(store.monthlyExpenses).toBe(4000)

      expect(store.monthlyExpenses * 12).toBe(store.yearlyExpenses)
      expect(store.yearlyExpenses / 0.04).toBe(store.targetRetirementAmount)
    })

    it('handles withdrawal rate changes correctly', () => {
      store.monthlyExpenses = 5000
      store.withdrawalRate = 4
      syncFromMonthlyExpenses(store)

      expect(store.targetRetirementAmount).toBe(1500000)
      expect(store.yearlyExpenses).toBe(60000)

      store.withdrawalRate = 3
      syncFromMonthlyExpenses(store)

      expect(store.targetRetirementAmount).toBe(2000000)
      expect(store.yearlyExpenses).toBe(60000)
    })

    it('integration test: calculations use correct active target', () => {
      store.currentAge = 30
      store.retirementAge = 65
      store.currentSavings = 100000
      store.expectedReturnRate = 7
      store.withdrawalRate = 4

      store.yearlyExpenses = 50000
      syncFromYearlyExpenses(store)

      const targetFromYearly = coastFire.targetFromYearlyExpenses(store)
      expect(coastFire.activeTargetAmount(store)).toBe(targetFromYearly)

      const futureValue = coastFire.futureValueOfCurrentSavings(store)
      expect(coastFire.isCoastFIREReady(store)).toBe(futureValue >= targetFromYearly)

      store.monthlyExpenses = 3000
      syncFromMonthlyExpenses(store)

      const targetFromMonthly = coastFire.targetFromMonthlyExpenses(store)
      expect(coastFire.activeTargetAmount(store)).toBe(targetFromMonthly)
      expect(coastFire.isCoastFIREReady(store)).toBe(futureValue >= targetFromMonthly)
    })
  })

  describe('inflation calculations', () => {
    it('calculates real return rate using Fisher equation', () => {
      store.expectedReturnRate = 7
      store.inflationRate = 3
      store.useRealReturns = true
      expect(coastFire.realReturnRate(store)).toBeCloseTo(3.883, 2)
    })

    it('uses nominal returns when useRealReturns is false', () => {
      store.expectedReturnRate = 7
      store.inflationRate = 3
      store.useRealReturns = false
      expect(coastFire.effectiveReturnRate(store)).toBe(7)
    })

    it('uses real returns when useRealReturns is true', () => {
      store.expectedReturnRate = 7
      store.inflationRate = 3
      store.useRealReturns = true
      expect(coastFire.effectiveReturnRate(store)).toBeCloseTo(3.883, 2)
    })

    it('adjusts target for inflation when using nominal returns', () => {
      store.currentAge = 30
      store.retirementAge = 65
      store.targetRetirementAmount = 1000000
      store.inflationRate = 3
      store.useRealReturns = false

      const expected = 1000000 * Math.pow(1.03, 35)
      expect(coastFire.inflationAdjustedTarget(store)).toBeCloseTo(expected, 0)
    })

    it('does not adjust target when using real returns', () => {
      store.currentAge = 30
      store.retirementAge = 65
      store.targetRetirementAmount = 1000000
      store.inflationRate = 3
      store.useRealReturns = true
      expect(coastFire.inflationAdjustedTarget(store)).toBe(1000000)
    })

    it('calculates future value with real returns correctly', () => {
      store.currentAge = 30
      store.retirementAge = 65
      store.currentSavings = 100000
      store.expectedReturnRate = 7
      store.inflationRate = 3
      store.useRealReturns = true

      const realRate = ((1.07 / 1.03) - 1)
      const expected = 100000 * Math.pow(1 + realRate, 35)
      expect(coastFire.futureValueOfCurrentSavings(store)).toBeCloseTo(expected, 0)
    })

    it('calculates Coast FIRE readiness with inflation', () => {
      store.currentAge = 30
      store.retirementAge = 65
      store.currentSavings = 200000
      store.expectedReturnRate = 7
      store.inflationRate = 2
      store.targetRetirementAmount = 500000

      store.useRealReturns = true
      const realRate = ((1.07 / 1.02) - 1)
      const futureValueReal = 200000 * Math.pow(1 + realRate, 35)
      const isReadyReal = futureValueReal >= 500000
      expect(coastFire.isCoastFIREReady(store)).toBe(isReadyReal)

      store.useRealReturns = false
      const futureValueNominal = 200000 * Math.pow(1.07, 35)
      const inflatedTarget = 500000 * Math.pow(1.02, 35)
      const isReadyNominal = futureValueNominal >= inflatedTarget
      expect(coastFire.isCoastFIREReady(store)).toBe(isReadyNominal)
    })

    it('validates inflation rate range', () => {
      store.inflationRate = -1
      validateCoastFireState(store)
      expect(store.errors.inflationRate).toContain('between 0% and 10%')

      store.inflationRate = 11
      validateCoastFireState(store)
      expect(store.errors.inflationRate).toContain('between 0% and 10%')

      store.inflationRate = 3
      validateCoastFireState(store)
      expect(store.errors.inflationRate).toBe('')
    })

    it('handles zero inflation correctly', () => {
      store.expectedReturnRate = 7
      store.inflationRate = 0
      store.useRealReturns = true

      expect(coastFire.realReturnRate(store)).toBeCloseTo(7, 10)
      expect(coastFire.effectiveReturnRate(store)).toBeCloseTo(7, 10)
    })

    it('handles high inflation scenarios', () => {
      store.expectedReturnRate = 8
      store.inflationRate = 6
      store.useRealReturns = true
      expect(coastFire.realReturnRate(store)).toBeCloseTo(1.887, 2)
    })

    it('resets inflation settings to defaults', () => {
      store.inflationRate = 5
      store.useRealReturns = false

      resetCoastFireToDefaults(store)

      expect(store.inflationRate).toBe(0)
      expect(store.useRealReturns).toBe(false)
    })

    it('projection chart adjusts for inflation', () => {
      store.currentAge = 30
      store.retirementAge = 35
      store.currentSavings = 100000
      store.expectedReturnRate = 7
      store.inflationRate = 3
      store.targetRetirementAmount = 150000
      store.useRealReturns = false

      const chartData = coastFire.projectionChartData(store)
      const targetLine = chartData.datasets[1].data as number[]

      expect(targetLine[0]).toBe(150000)
      expect(targetLine[1]).toBeCloseTo(150000 * 1.03, 0)
      expect(targetLine[5]).toBeCloseTo(150000 * Math.pow(1.03, 5), 0)
    })
  })

  describe('Coast FIRE number calculation', () => {
    it('calculates Coast FIRE number correctly using present value', () => {
      store.currentAge = 30
      store.retirementAge = 65
      store.expectedReturnRate = 7
      store.targetRetirementAmount = 1000000
      store.useRealReturns = false
      store.inflationRate = 0

      const years = 35
      const expected = 1000000 / Math.pow(1.07, years)
      expect(coastFire.coastFIRENumber(store)).toBeCloseTo(expected, 0)
    })

    it('returns target amount when years to retirement is zero', () => {
      store.currentAge = 65
      store.retirementAge = 65
      store.targetRetirementAmount = 500000
      expect(coastFire.coastFIRENumber(store)).toBe(500000)
    })

    it('uses inflation-adjusted target when using nominal returns', () => {
      store.currentAge = 30
      store.retirementAge = 65
      store.expectedReturnRate = 7
      store.targetRetirementAmount = 1000000
      store.inflationRate = 3
      store.useRealReturns = false

      const inflatedTarget = 1000000 * Math.pow(1.03, 35)
      const expected = inflatedTarget / Math.pow(1.07, 35)
      expect(coastFire.coastFIRENumber(store)).toBeCloseTo(expected, 0)
    })

    it('uses real returns when inflation adjustment is enabled', () => {
      store.currentAge = 30
      store.retirementAge = 60
      store.expectedReturnRate = 8
      store.inflationRate = 3
      store.targetRetirementAmount = 800000
      store.useRealReturns = true

      const realRate = ((1.08 / 1.03) - 1)
      const years = 30
      const expected = 800000 / Math.pow(1 + realRate, years)
      expect(coastFire.coastFIRENumber(store)).toBeCloseTo(expected, 0)
    })

    it('matches additional savings needed when current savings is zero', () => {
      store.currentAge = 25
      store.retirementAge = 60
      store.currentSavings = 0
      store.expectedReturnRate = 6
      store.targetRetirementAmount = 1200000
      expect(coastFire.coastFIRENumber(store)).toBe(coastFire.additionalSavingsNeeded(store))
    })

    it('calculates correctly with expense-based targets', () => {
      store.currentAge = 35
      store.retirementAge = 65
      store.monthlyExpenses = 5000
      store.withdrawalRate = 4
      store.expectedReturnRate = 7
      syncFromMonthlyExpenses(store)

      const target = (5000 * 12) / 0.04
      const expected = target / Math.pow(1.07, 30)
      expect(coastFire.coastFIRENumber(store)).toBeCloseTo(expected, 0)
    })

    it('provides meaningful comparison to current savings when not Coast FIRE ready', () => {
      store.currentAge = 40
      store.retirementAge = 65
      store.currentSavings = 50000
      store.expectedReturnRate = 6
      store.targetRetirementAmount = 1500000

      expect(coastFire.isCoastFIREReady(store)).toBe(false)

      const coastFireNumber = coastFire.coastFIRENumber(store)
      const additionalNeeded = coastFire.additionalSavingsNeeded(store)
      expect(store.currentSavings + additionalNeeded).toBeCloseTo(coastFireNumber, 0)
    })

    it('handles Coast FIRE ready scenario correctly', () => {
      store.currentAge = 50
      store.retirementAge = 65
      store.currentSavings = 500000
      store.expectedReturnRate = 8
      store.targetRetirementAmount = 800000

      expect(coastFire.isCoastFIREReady(store)).toBe(true)
      expect(coastFire.additionalSavingsNeeded(store)).toBe(0)
      expect(coastFire.coastFIRENumber(store)).toBeLessThan(store.currentSavings)
    })

    it('handles high return rates correctly', () => {
      store.currentAge = 25
      store.retirementAge = 65
      store.expectedReturnRate = 12
      store.targetRetirementAmount = 2000000

      const years = 40
      const expected = 2000000 / Math.pow(1.12, years)
      expect(coastFire.coastFIRENumber(store)).toBeCloseTo(expected, 0)
      expect(coastFire.coastFIRENumber(store)).toBeLessThan(200000)
    })

    it('handles low return rates correctly', () => {
      store.currentAge = 35
      store.retirementAge = 65
      store.expectedReturnRate = 3
      store.targetRetirementAmount = 800000

      const years = 30
      const expected = 800000 / Math.pow(1.03, years)
      expect(coastFire.coastFIRENumber(store)).toBeCloseTo(expected, 0)
      expect(coastFire.coastFIRENumber(store)).toBeGreaterThan(300000)
    })
  })

  describe('validation for new fields', () => {
    it('validates withdrawal rate range', () => {
      store.withdrawalRate = 1
      validateCoastFireState(store)
      expect(store.errors.withdrawalRate).toContain('between 2% and 8%')

      store.withdrawalRate = 10
      validateCoastFireState(store)
      expect(store.errors.withdrawalRate).toContain('between 2% and 8%')

      store.withdrawalRate = 4
      validateCoastFireState(store)
      expect(store.errors.withdrawalRate).toBe('')
    })

    it('validates monthly expenses not negative', () => {
      store.monthlyExpenses = -100
      validateCoastFireState(store)
      expect(store.errors.monthlyExpenses).toContain('cannot be negative')

      store.monthlyExpenses = 0
      validateCoastFireState(store)
      expect(store.errors.monthlyExpenses).toBe('')
    })
  })

  describe('resetToDefaults functionality', () => {
    it('should reset all values to defaults including new fields', () => {
      store.currentAge = 45
      store.retirementAge = 70
      store.currentSavings = 100000
      store.expectedReturnRate = 10
      store.targetRetirementAmount = 2000000
      store.monthlyExpenses = 5000
      store.withdrawalRate = 6
      store.lastEditedField = 'monthly'

      store.currentAge = 17
      validateCoastFireState(store)
      expect(store.errors.currentAge).not.toBe('')

      resetCoastFireToDefaults(store)

      expect(store.currentAge).toBe(30)
      expect(store.retirementAge).toBe(65)
      expect(store.currentSavings).toBe(50000)
      expect(store.expectedReturnRate).toBe(7)
      expect(store.targetRetirementAmount).toBe(1000000)
      expect(store.monthlyExpenses).toBe(0)
      expect(store.withdrawalRate).toBe(4)
      expect(store.lastEditedField).toBe('target')

      expect(store.errors.currentAge).toBe('')
      expect(store.errors.retirementAge).toBe('')
      expect(store.errors.currentSavings).toBe('')
      expect(store.errors.expectedReturnRate).toBe('')
      expect(store.errors.targetRetirementAmount).toBe('')
      expect(store.errors.monthlyExpenses).toBe('')
      expect(store.errors.withdrawalRate).toBe('')
    })
  })

  describe('store integration tests', () => {
    it('should update computed values when inputs change', () => {
      store.currentAge = 30
      store.retirementAge = 65
      store.currentSavings = 50000
      store.expectedReturnRate = 7
      store.targetRetirementAmount = 1000000

      const initialFutureValue = coastFire.futureValueOfCurrentSavings(store)
      const initialAdditionalNeeded = coastFire.additionalSavingsNeeded(store)

      store.currentSavings = 100000

      expect(coastFire.futureValueOfCurrentSavings(store)).toBeGreaterThan(initialFutureValue)
      expect(coastFire.additionalSavingsNeeded(store)).toBeLessThan(initialAdditionalNeeded)
      expect(Number.isFinite(coastFire.coastFIREAge(store))).toBe(true)
      expect(coastFire.coastFIREAge(store)).toBeGreaterThanOrEqual(store.currentAge)
    })

    it('should maintain calculation consistency after reset', () => {
      store.currentAge = 40
      store.retirementAge = 70
      store.currentSavings = 200000
      store.expectedReturnRate = 9
      store.targetRetirementAmount = 2000000

      const modifiedFutureValue = coastFire.futureValueOfCurrentSavings(store)
      const modifiedAdditionalNeeded = coastFire.additionalSavingsNeeded(store)

      resetCoastFireToDefaults(store)

      const defaultFutureValue = coastFire.futureValueOfCurrentSavings(store)
      const defaultAdditionalNeeded = coastFire.additionalSavingsNeeded(store)

      expect(defaultFutureValue).not.toBe(modifiedFutureValue)
      expect(defaultAdditionalNeeded).not.toBe(modifiedAdditionalNeeded)
      expect(Number.isFinite(defaultFutureValue)).toBe(true)
      expect(Number.isFinite(defaultAdditionalNeeded)).toBe(true)
    })

    it('should integrate validation with calculations properly', () => {
      store.currentAge = 25
      store.retirementAge = 65
      store.currentSavings = 30000
      store.expectedReturnRate = 8
      store.targetRetirementAmount = 1500000

      const isValid = validateCoastFireState(store)
      expect(isValid).toBe(true)

      expect(Number.isFinite(coastFire.futureValueOfCurrentSavings(store))).toBe(true)
      expect(coastFire.futureValueOfCurrentSavings(store)).toBeGreaterThan(30000)

      store.currentAge = 70
      store.retirementAge = 65

      const isValidAfter = validateCoastFireState(store)
      expect(isValidAfter).toBe(false)
      expect(store.errors.retirementAge).toContain('greater than current age')

      expect(Number.isFinite(coastFire.futureValueOfCurrentSavings(store))).toBe(true)
    })

    it('should handle reactive state changes correctly', () => {
      store.currentAge = 30
      store.retirementAge = 65
      store.currentSavings = 75000
      store.expectedReturnRate = 6
      store.targetRetirementAmount = 1200000

      const initialResult = coastFire.isCoastFIREReady(store)

      store.currentSavings = 100000
      store.expectedReturnRate = 8

      const newResult = coastFire.isCoastFIREReady(store)
      const newFutureValue = coastFire.futureValueOfCurrentSavings(store)

      expect(newFutureValue).toBeGreaterThan(75000 * Math.pow(1.06, 35))
      expect(typeof newResult).toBe('boolean')
      expect(Number.isFinite(newFutureValue)).toBe(true)
      // initialResult exists; suppress unused-var by using it
      expect(typeof initialResult).toBe('boolean')
    })

    it('should properly simulate state persistence behavior', () => {
      const store1 = createCoastFireState()
      store1.currentAge = 32
      store1.retirementAge = 62
      store1.currentSavings = 85000
      store1.expectedReturnRate = 7.5
      store1.targetRetirementAmount = 1300000

      const results1 = {
        futureValue: coastFire.futureValueOfCurrentSavings(store1),
        additionalNeeded: coastFire.additionalSavingsNeeded(store1),
        coastAge: coastFire.coastFIREAge(store1),
        isReady: coastFire.isCoastFIREReady(store1)
      }

      const store2 = createCoastFireState()
      store2.currentAge = 32
      store2.retirementAge = 62
      store2.currentSavings = 85000
      store2.expectedReturnRate = 7.5
      store2.targetRetirementAmount = 1300000

      const results2 = {
        futureValue: coastFire.futureValueOfCurrentSavings(store2),
        additionalNeeded: coastFire.additionalSavingsNeeded(store2),
        coastAge: coastFire.coastFIREAge(store2),
        isReady: coastFire.isCoastFIREReady(store2)
      }

      expect(results1.futureValue).toBe(results2.futureValue)
      expect(results1.additionalNeeded).toBe(results2.additionalNeeded)
      expect(results1.coastAge).toBe(results2.coastAge)
      expect(results1.isReady).toBe(results2.isReady)
    })
  })
})
