import { describe, it, expect } from 'vitest'
import {
  formatFormula,
  formatCurrency,
  formatPercentage,
  formatNumber,
  formatExponent,
  formatEquation,
  formatCompoundInterestSteps,
  formatPresentValueSteps,
  formatFisherEquationSteps,
  formatWithdrawalSteps,
  formatLogarithmicTimeSteps,
  formatMonthlyRateSteps,
  formatAmortizationSteps,
  formatInvestmentCompoundingSteps,
  formatTaxCalculationSteps,
  formatPayoffComparisonSteps
} from '../mathFormatters'

describe('Mathematical Formatters', () => {
  describe('formatCurrency', () => {
    it('formats currency with default 0 decimals', () => {
      expect(formatCurrency(1000)).toBe('$1,000')
      expect(formatCurrency(1234567)).toBe('$1,234,567')
    })

    it('formats currency with specified decimals', () => {
      expect(formatCurrency(1000.5, 2)).toBe('$1,000.50')
      expect(formatCurrency(1234.567, 2)).toBe('$1,234.57')
    })
  })

  describe('formatPercentage', () => {
    it('formats percentage with default 1 decimal', () => {
      expect(formatPercentage(7)).toBe('7.0%')
      expect(formatPercentage(3.14159)).toBe('3.1%')
    })

    it('formats percentage with specified decimals', () => {
      expect(formatPercentage(7, 2)).toBe('7.00%')
      expect(formatPercentage(3.14159, 3)).toBe('3.142%')
    })
  })

  describe('formatNumber', () => {
    it('formats numbers with locale formatting', () => {
      expect(formatNumber(1000)).toBe('1,000')
      expect(formatNumber(1234567)).toBe('1,234,567')
    })

    it('formats numbers with decimals', () => {
      expect(formatNumber(1000.123, 2)).toBe('1,000.12')
      expect(formatNumber(3.14159, 3)).toBe('3.142')
    })
  })

  describe('formatExponent', () => {
    it('formats exponential notation with HTML superscript', () => {
      expect(formatExponent(1.07, 35)).toBe('1.07<sup>35</sup>')
      expect(formatExponent('(1 + r)', 't')).toBe('(1 + r)<sup>t</sup>')
    })
  })

  describe('formatEquation', () => {
    it('formats complete equations', () => {
      expect(formatEquation('$50,000', '×', '10.677', '$534,850')).toBe('$50,000 × 10.677 = $534,850')
      expect(formatEquation('65', '-', '30', '35')).toBe('65 - 30 = 35')
    })
  })

  describe('formatFormula', () => {
    it('substitutes currency values correctly', () => {
      const template = 'FV = {principalAmount} × (1 + r)^t'
      const values = { principalAmount: 50000 }
      expect(formatFormula(template, values)).toBe('FV = $50,000 × (1 + r)^t')
    })

    it('substitutes percentage values correctly', () => {
      const template = 'Rate = {nominalRate} - {inflationRate}'
      const values = { nominalRate: 7, inflationRate: 3 }
      expect(formatFormula(template, values)).toBe('Rate = 7.0% - 3.0%')
    })

    it('substitutes mixed value types', () => {
      const template = '{currentAge} + {years} = {targetAge} years old'
      const values = { currentAge: 30, years: 35, targetAge: 65 }
      expect(formatFormula(template, values)).toBe('30 + 35 = 65 years old')
    })

    it('handles multiple occurrences of same placeholder', () => {
      const template = '{amount} × {rate} = {amount} × 0.04'
      const values = { amount: 1000000, rate: 4 }
      expect(formatFormula(template, values)).toBe('$1,000,000 × 4.0% = $1,000,000 × 0.04')
    })
  })

  describe('formatCompoundInterestSteps', () => {
    it('formats compound interest calculation steps', () => {
      const steps = formatCompoundInterestSteps(50000, 0.07, 35, true)
      expect(steps).toHaveLength(5)
      expect(steps[0]).toBe('FV = PV × (1 + r)<sup>35</sup>')
      expect(steps[1]).toBe('FV = $50,000 × (1 + 7.0%)<sup>35</sup>')
      expect(steps[4]).toContain('FV = $')
    })

    it('formats without intermediate steps when requested', () => {
      const steps = formatCompoundInterestSteps(50000, 0.07, 35, false)
      expect(steps).toHaveLength(2)
      expect(steps[0]).toBe('FV = PV × (1 + r)<sup>35</sup>')
      expect(steps[1]).toContain('FV = $')
    })
  })

  describe('formatPresentValueSteps', () => {
    it('formats present value calculation steps', () => {
      const steps = formatPresentValueSteps(1000000, 0.07, 35, true)
      expect(steps).toHaveLength(5)
      expect(steps[0]).toBe('PV = FV ÷ (1 + r)<sup>35</sup>')
      expect(steps[1]).toBe('PV = $1,000,000 ÷ (1 + 7.0%)<sup>35</sup>')
      expect(steps[4]).toContain('PV = $')
    })
  })

  describe('formatFisherEquationSteps', () => {
    it('formats Fisher equation calculation steps', () => {
      const steps = formatFisherEquationSteps(0.07, 0.03, true)
      expect(steps).toHaveLength(5)
      expect(steps[0]).toBe('Real Rate = (1 + nominal) ÷ (1 + inflation) - 1')
      expect(steps[1]).toBe('Real Rate = (1 + 7.0%) ÷ (1 + 3.0%) - 1')
      expect(steps[4]).toContain('Real Rate = ')
      expect(steps[4]).toContain('%')
    })

    it('calculates Fisher equation correctly', () => {
      const steps = formatFisherEquationSteps(0.07, 0.03, false)
      expect(steps[1]).toContain('3.9%')
    })
  })

  describe('formatWithdrawalSteps', () => {
    it('formats monthly withdrawal calculation', () => {
      const steps = formatWithdrawalSteps(1000000, 4, true, true)
      expect(steps).toHaveLength(4)
      expect(steps[0]).toBe('Monthly = (Target × Rate) ÷ 12')
      expect(steps[3]).toBe('Monthly = $3,333')
    })

    it('formats annual withdrawal calculation', () => {
      const steps = formatWithdrawalSteps(1000000, 4, false, true)
      expect(steps).toHaveLength(3)
      expect(steps[0]).toBe('Annual = Target × Rate')
      expect(steps[2]).toBe('Annual = $40,000')
    })
  })

  describe('formatLogarithmicTimeSteps', () => {
    it('formats logarithmic time calculation steps', () => {
      const steps = formatLogarithmicTimeSteps(1000000, 50000, 0.07, 30, true)
      expect(steps).toHaveLength(6)
      expect(steps[0]).toBe('t = ln(FV ÷ PV) ÷ ln(1 + r)')
      expect(steps[1]).toContain('ln($1,000,000 ÷ $50,000)')
      expect(steps[5]).toContain('Coast FIRE Age = 30 +')
    })

    it('calculates logarithmic time correctly', () => {
      const steps = formatLogarithmicTimeSteps(1000000, 50000, 0.07, 30, false)
      expect(steps[1]).toContain('74.3 years old')
    })
  })

  describe('formatMonthlyRateSteps', () => {
    it('formats monthly rate calculation correctly', () => {
      const result = formatMonthlyRateSteps(4.5, true)
      expect(result[0]).toBe('Monthly Rate = Annual Rate ÷ 12')
      expect(result[1]).toBe('Monthly Rate = 4.5% ÷ 12')
      expect(result[2]).toBe('Monthly Rate = 0.375%')
    })

    it('works without detailed steps', () => {
      const result = formatMonthlyRateSteps(6.0, false)
      expect(result).toHaveLength(2)
      expect(result[0]).toBe('Monthly Rate = Annual Rate ÷ 12')
      expect(result[1]).toBe('Monthly Rate = 0.500%')
    })
  })

  describe('formatAmortizationSteps', () => {
    it('formats amortization steps correctly', () => {
      const result = formatAmortizationSteps(300000, 1500, 0.00375, 2, true)
      expect(result[0]).toBe('Amortization Formula (each month):')
      expect(result[1]).toBe('Interest = Balance × Monthly Rate')
      expect(result[2]).toBe('Principal Payment = Monthly Payment - Interest')
      expect(result[3]).toBe('New Balance = Balance - Principal Payment')
      expect(result.some(step => step.includes('Month 1:'))).toBe(true)
      expect(result.some(step => step.includes('Month 2:'))).toBe(true)
    })

    it('works without detailed steps', () => {
      const result = formatAmortizationSteps(100000, 1000, 0.004, 0, false)
      expect(result).toHaveLength(4)
      expect(result[0]).toBe('Amortization Formula (each month):')
    })
  })

  describe('formatInvestmentCompoundingSteps', () => {
    it('formats investment compounding with lump sum and monthly', () => {
      const result = formatInvestmentCompoundingSteps(10000, 500, 0.005, 120, true)
      expect(result[0]).toBe('Investment Growth = Lump Sum Growth + Monthly Contributions Growth')
      expect(result.some(step => step.includes('Lump Sum Growth:'))).toBe(true)
      expect(result.some(step => step.includes('Monthly Contributions Growth'))).toBe(true)
      expect(result.some(step => step.includes('Total Investment Value'))).toBe(true)
    })

    it('handles lump sum only', () => {
      const result = formatInvestmentCompoundingSteps(10000, 0, 0.005, 60, true)
      expect(result[0]).toBe('Investment Growth = Lump Sum Growth + Monthly Contributions Growth')
      expect(result.some(step => step.includes('Lump Sum Growth:'))).toBe(true)
      expect(result.some(step => step.includes('$0/month'))).toBe(false)
    })

    it('handles monthly contributions only', () => {
      const result = formatInvestmentCompoundingSteps(0, 1000, 0.006, 60, true)
      expect(result[0]).toBe('Investment Growth = Lump Sum Growth + Monthly Contributions Growth')
      expect(result.some(step => step.includes('Lump Sum Growth:'))).toBe(false)
      expect(result.some(step => step.includes('Monthly Contributions Growth'))).toBe(true)
    })
  })

  describe('formatTaxCalculationSteps', () => {
    it('formats tax calculation correctly', () => {
      const result = formatTaxCalculationSteps(50000, 40000, 0.20, true)
      expect(result[0]).toBe('After-Tax Calculation:')
      expect(result[1]).toBe('Taxable Profit = Gross Return - Total Invested')
      expect(result[2]).toBe('Taxes = Taxable Profit × Tax Rate')
      expect(result[3]).toBe('Net Return = Gross Return - Taxes')
      expect(result.some(step => step.includes('$50,000 - $40,000'))).toBe(true)
      expect(result.some(step => step.includes('$10,000 × 20.0%'))).toBe(true)
      expect(result[result.length - 1]).toContain('$48,000')
    })

    it('handles no profit scenario', () => {
      const result = formatTaxCalculationSteps(30000, 40000, 0.20, true)
      expect(result.some(step => step.includes('$0'))).toBe(true)
    })

    it('works without detailed steps', () => {
      const result = formatTaxCalculationSteps(60000, 50000, 0.25, false)
      expect(result).toHaveLength(5)
      expect(result[result.length - 1]).toContain('$57,500')
    })
  })

  describe('formatPayoffComparisonSteps', () => {
    it('recommends payoff when interest saved is higher', () => {
      const result = formatPayoffComparisonSteps(15000, 12000, true)
      expect(result[0]).toBe('Strategy Comparison:')
      expect(result.some(step => step.includes('Mortgage Payoff Benefit: $15,000'))).toBe(true)
      expect(result.some(step => step.includes('Investment Net Benefit: $12,000'))).toBe(true)
      expect(result.some(step => step.includes('$15,000 > $12,000'))).toBe(true)
      expect(result.some(step => step.includes('Payoff is better by $3,000'))).toBe(true)
      expect(result[result.length - 1]).toBe('Recommended Strategy: Payoff')
    })

    it('recommends investment when net benefit is higher', () => {
      const result = formatPayoffComparisonSteps(8000, 12000, true)
      expect(result[0]).toBe('Strategy Comparison:')
      expect(result.some(step => step.includes('$12,000 > $8,000'))).toBe(true)
      expect(result.some(step => step.includes('Investment is better by $4,000'))).toBe(true)
      expect(result[result.length - 1]).toBe('Recommended Strategy: Investment')
    })

    it('works without detailed steps', () => {
      const result = formatPayoffComparisonSteps(10000, 9000, false)
      expect(result).toHaveLength(3)
      expect(result[result.length - 1]).toBe('Recommended Strategy: Payoff')
    })
  })

  describe('edge cases and error handling', () => {
    it('handles zero values appropriately', () => {
      expect(formatCurrency(0)).toBe('$0')
      expect(formatPercentage(0)).toBe('0.0%')
      expect(formatNumber(0)).toBe('0')
    })

    it('handles negative values', () => {
      expect(formatCurrency(-1000)).toBe('-$1,000')
      expect(formatPercentage(-2)).toBe('-2.0%')
    })

    it('handles very large numbers', () => {
      expect(formatCurrency(1000000000)).toBe('$1,000,000,000')
      expect(formatNumber(1234567890)).toBe('1,234,567,890')
    })

    it('handles very small decimal numbers', () => {
      expect(formatPercentage(0.001, 3)).toBe('0.001%')
      expect(formatNumber(0.00001, 5)).toBe('0.00001')
    })
  })
})
