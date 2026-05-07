import { describe, it, expect } from 'vitest'
import {
  calculateFutureValue,
  calculatePresentValue,
  calculateTimeToTarget,
  calculateRealReturnRate,
  adjustTargetForInflation,
  calculateYearsToRetirement
} from '../compound'

describe('Compound Interest Functions', () => {
  describe('calculateFutureValue', () => {
    it('calculates future value correctly', () => {
      // Basic compound interest: $10,000 at 7% for 10 years
      const result = calculateFutureValue(10000, 0.07, 10)
      expect(result).toBeCloseTo(19671.51, 2)
    })

    it('handles zero years', () => {
      const result = calculateFutureValue(10000, 0.07, 0)
      expect(result).toBe(10000)
    })

    it('handles zero principal', () => {
      const result = calculateFutureValue(0, 0.07, 10)
      expect(result).toBe(0)
    })

    it('handles zero interest rate', () => {
      const result = calculateFutureValue(10000, 0, 10)
      expect(result).toBe(10000)
    })

    it('handles high interest rate', () => {
      const result = calculateFutureValue(1000, 0.5, 5) // 50% annual return
      expect(result).toBeCloseTo(7593.75, 2)
    })

    it('throws error for negative principal', () => {
      expect(() => calculateFutureValue(-1000, 0.07, 10)).toThrow('Principal cannot be negative')
    })

    it('throws error for rate below -100%', () => {
      expect(() => calculateFutureValue(1000, -1.1, 10)).toThrow('Rate cannot be less than -100%')
    })

    it('throws error for negative years', () => {
      expect(() => calculateFutureValue(1000, 0.07, -5)).toThrow('Years cannot be negative')
    })

    it('handles edge case of -100% rate', () => {
      const result = calculateFutureValue(1000, -1, 1)
      expect(result).toBe(0)
    })
  })

  describe('calculatePresentValue', () => {
    it('calculates present value correctly', () => {
      const result = calculatePresentValue(20000, 0.07, 10)
      expect(result).toBeCloseTo(10166.99, 2)
    })

    it('handles zero years', () => {
      const result = calculatePresentValue(20000, 0.07, 0)
      expect(result).toBe(20000)
    })

    it('handles zero future value', () => {
      const result = calculatePresentValue(0, 0.07, 10)
      expect(result).toBe(0)
    })

    it('handles zero interest rate', () => {
      const result = calculatePresentValue(20000, 0, 10)
      expect(result).toBe(20000)
    })

    it('throws error for negative future value', () => {
      expect(() => calculatePresentValue(-1000, 0.07, 10)).toThrow('Future value cannot be negative')
    })

    it('throws error for rate below -100%', () => {
      expect(() => calculatePresentValue(1000, -1.1, 10)).toThrow('Rate cannot be less than -100%')
    })

    it('throws error for negative years', () => {
      expect(() => calculatePresentValue(1000, 0.07, -5)).toThrow('Years cannot be negative')
    })

    it('is inverse of calculateFutureValue', () => {
      const principal = 10000
      const rate = 0.07
      const years = 15

      const futureValue = calculateFutureValue(principal, rate, years)
      const presentValue = calculatePresentValue(futureValue, rate, years)

      expect(presentValue).toBeCloseTo(principal, 2)
    })
  })

  describe('calculateTimeToTarget', () => {
    it('calculates time to target correctly', () => {
      const result = calculateTimeToTarget(10000, 20000, 0.07)
      expect(result).toBeCloseTo(10.245, 3)
    })

    it('handles target equal to principal', () => {
      const result = calculateTimeToTarget(10000, 10000, 0.07)
      expect(result).toBe(0)
    })

    it('returns infinity for zero rate with different target', () => {
      const result = calculateTimeToTarget(10000, 20000, 0)
      expect(result).toBe(Infinity)
    })

    it('handles very high growth rate', () => {
      const result = calculateTimeToTarget(1000, 2000, 1.0)
      expect(result).toBeCloseTo(1, 3)
    })

    it('throws error for zero or negative principal', () => {
      expect(() => calculateTimeToTarget(0, 20000, 0.07)).toThrow('Principal must be positive')
      expect(() => calculateTimeToTarget(-1000, 20000, 0.07)).toThrow('Principal must be positive')
    })

    it('throws error for zero or negative target', () => {
      expect(() => calculateTimeToTarget(10000, 0, 0.07)).toThrow('Target must be positive')
      expect(() => calculateTimeToTarget(10000, -1000, 0.07)).toThrow('Target must be positive')
    })

    it('throws error for rate of -100% or less', () => {
      expect(() => calculateTimeToTarget(10000, 20000, -1)).toThrow('Rate must be greater than -100%')
    })

    it('returns 0 when target is less than principal', () => {
      const result = calculateTimeToTarget(20000, 10000, 0.07)
      expect(result).toBe(0)
    })

    it('is inverse of calculateFutureValue', () => {
      const principal = 5000
      const target = 25000
      const rate = 0.08

      const timeNeeded = calculateTimeToTarget(principal, target, rate)
      const actualTarget = calculateFutureValue(principal, rate, timeNeeded)

      expect(actualTarget).toBeCloseTo(target, 2)
    })
  })

  describe('calculateRealReturnRate', () => {
    it('calculates Fisher equation correctly', () => {
      const result = calculateRealReturnRate(0.07, 0.03)
      expect(result).toBeCloseTo(0.03883, 5)
    })

    it('handles zero inflation', () => {
      const result = calculateRealReturnRate(0.07, 0)
      expect(result).toBeCloseTo(0.07, 10)
    })

    it('handles zero nominal rate', () => {
      const result = calculateRealReturnRate(0, 0.03)
      expect(result).toBeCloseTo(-0.029126, 6)
    })

    it('handles negative real returns (high inflation)', () => {
      const result = calculateRealReturnRate(0.03, 0.08)
      expect(result).toBeCloseTo(-0.046296, 6)
    })

    it('handles deflation (negative inflation)', () => {
      const result = calculateRealReturnRate(0.05, -0.02)
      expect(result).toBeCloseTo(0.071429, 6)
    })

    it('throws error for nominal rate below -100%', () => {
      expect(() => calculateRealReturnRate(-1.1, 0.03)).toThrow('Nominal rate cannot be less than -100%')
    })

    it('throws error for inflation rate below -100%', () => {
      expect(() => calculateRealReturnRate(0.07, -1.1)).toThrow('Inflation rate cannot be less than -100%')
    })

    it('demonstrates why simple subtraction is wrong', () => {
      const nominalRate = 0.07
      const inflationRate = 0.03

      const fisherResult = calculateRealReturnRate(nominalRate, inflationRate)
      const simpleSubtraction = nominalRate - inflationRate

      expect(fisherResult).not.toBeCloseTo(simpleSubtraction, 3)
      expect(fisherResult).toBeCloseTo(0.03883, 5)
      expect(simpleSubtraction).toBeCloseTo(0.04, 10)
    })
  })

  describe('adjustTargetForInflation', () => {
    it('adjusts target for inflation correctly', () => {
      const result = adjustTargetForInflation(1000000, 0.03, 30)
      expect(result).toBeCloseTo(2427262.47, 2)
    })

    it('handles zero years', () => {
      const result = adjustTargetForInflation(1000000, 0.03, 0)
      expect(result).toBe(1000000)
    })

    it('handles zero inflation', () => {
      const result = adjustTargetForInflation(1000000, 0, 30)
      expect(result).toBe(1000000)
    })

    it('handles zero target', () => {
      const result = adjustTargetForInflation(0, 0.03, 30)
      expect(result).toBe(0)
    })

    it('handles deflation (negative inflation)', () => {
      const result = adjustTargetForInflation(1000000, -0.02, 10)
      expect(result).toBeCloseTo(817072.81, 2)
    })

    it('throws error for negative target', () => {
      expect(() => adjustTargetForInflation(-1000, 0.03, 10)).toThrow('Target cannot be negative')
    })

    it('throws error for inflation rate below -100%', () => {
      expect(() => adjustTargetForInflation(1000000, -1.1, 10)).toThrow('Inflation rate cannot be less than -100%')
    })

    it('throws error for negative years', () => {
      expect(() => adjustTargetForInflation(1000000, 0.03, -5)).toThrow('Years cannot be negative')
    })
  })

  describe('calculateYearsToRetirement', () => {
    it('calculates years correctly', () => {
      const result = calculateYearsToRetirement(30, 65)
      expect(result).toBe(35)
    })

    it('handles same age (already retired)', () => {
      const result = calculateYearsToRetirement(65, 65)
      expect(result).toBe(0)
    })

    it('handles retirement age before current age', () => {
      const result = calculateYearsToRetirement(70, 65)
      expect(result).toBe(0)
    })

    it('throws error for negative current age', () => {
      expect(() => calculateYearsToRetirement(-5, 65)).toThrow('Current age cannot be negative')
    })

    it('throws error for negative retirement age', () => {
      expect(() => calculateYearsToRetirement(30, -5)).toThrow('Retirement age cannot be negative')
    })
  })

  describe('Integration Tests', () => {
    it('Coast FIRE scenario: $50k at age 30, retire at 65 with $1M target', () => {
      const currentSavings = 50000
      const currentAge = 30
      const retirementAge = 65
      const target = 1000000
      const rate = 0.07

      const years = calculateYearsToRetirement(currentAge, retirementAge)
      expect(years).toBe(35)

      const futureValue = calculateFutureValue(currentSavings, rate, years)
      expect(futureValue).toBeCloseTo(533829, 0)

      expect(futureValue).toBeLessThan(target)

      const coastFireNumber = calculatePresentValue(target, rate, years)
      expect(coastFireNumber).toBeCloseTo(93663, 0)

      const additionalNeeded = coastFireNumber - currentSavings
      expect(additionalNeeded).toBeCloseTo(43663, 0)
    })

    it('Inflation adjustment scenario: Fisher equation consistency', () => {
      const nominalRate = 0.07
      const inflationRate = 0.03
      const years = 25
      const target = 1000000

      const realRate = calculateRealReturnRate(nominalRate, inflationRate)

      const inflationAdjustedTarget = adjustTargetForInflation(target, inflationRate, years)
      const coastFireNominal = calculatePresentValue(inflationAdjustedTarget, nominalRate, years)

      const coastFireReal = calculatePresentValue(target, realRate, years)

      expect(coastFireNominal).toBeCloseTo(coastFireReal, 0)
    })
  })
})
