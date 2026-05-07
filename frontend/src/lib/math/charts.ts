/**
 * Chart Data Generation Functions
 *
 * Pure functions for generating chart data used in the finance calculator visualizations.
 * All functions return Chart.js compatible data structures.
 *
 * Ported verbatim from legacy-vue-calc/src/utils/math/charts.ts
 */

import { generateCoastFireProjection } from './coastFire'
import { generateAmortizationSchedule, calculatePayoff } from './mortgage'
import { adjustTargetForInflation } from './compound'

/**
 * Chart.js compatible dataset structure
 */
export interface ChartDataset {
  label: string
  data: number[]
  borderColor: string
  backgroundColor: string
  fill?: boolean | string
  borderDash?: number[]
  pointRadius?: number
  tension?: number
}

/**
 * Chart.js compatible data structure
 */
export interface ChartData {
  labels: string[]
  datasets: ChartDataset[]
}

/**
 * Generate Coast FIRE projection chart data
 */
export function generateCoastFireProjectionChart(
  currentSavings: number,
  currentAge: number,
  retirementAge: number,
  rate: number,
  target: number,
  inflationRate: number = 0,
  useRealReturns: boolean = false
): ChartData {
  if (currentSavings < 0) throw new Error('Current savings cannot be negative')
  if (currentAge < 0) throw new Error('Current age cannot be negative')
  if (retirementAge < currentAge) throw new Error('Retirement age must be >= current age')

  const projection = generateCoastFireProjection(currentSavings, currentAge, retirementAge, rate)
  const labels = projection.map(point => `Age ${point.age}`)
  const projectedValues = projection.map(point => point.projectedSavings)

  // Generate target line with inflation adjustment
  const targetValues = projection.map(point => {
    const yearsFromNow = point.age - currentAge
    if (useRealReturns || inflationRate === 0) {
      return target
    } else {
      return adjustTargetForInflation(target, inflationRate, yearsFromNow)
    }
  })

  return {
    labels,
    datasets: [
      {
        label: 'Projected Savings',
        data: projectedValues,
        borderColor: '#409eff',
        backgroundColor: '#409eff33',
        fill: true,
        tension: 0.4
      },
      {
        label: 'Target Amount',
        data: targetValues,
        borderColor: '#e74c3c',
        backgroundColor: 'transparent',
        borderDash: [5, 5],
        fill: false,
        pointRadius: 0
      }
    ]
  }
}

/**
 * Generate required savings by age chart data
 */
export function generateRequiredSavingsByAgeChart(
  target: number,
  retirementAge: number,
  rate: number,
  inflationRate: number = 0,
  useRealReturns: boolean = false,
  startAge: number = 20,
  endAge: number = 50,
  stepSize: number = 5
): ChartData {
  if (target <= 0) throw new Error('Target must be positive')
  if (retirementAge <= 0) throw new Error('Retirement age must be positive')
  if (startAge >= endAge) throw new Error('Start age must be less than end age')
  if (stepSize <= 0) throw new Error('Step size must be positive')

  const ages: number[] = []
  const requiredSavings: number[] = []

  for (let age = startAge; age <= endAge; age += stepSize) {
    ages.push(age)

    const yearsToRetire = retirementAge - age
    if (yearsToRetire > 0) {
      // Calculate inflation-adjusted target for this specific age
      const adjustedTarget = useRealReturns || inflationRate === 0
        ? target
        : adjustTargetForInflation(target, inflationRate, yearsToRetire)

      const presentValue = adjustedTarget / Math.pow(1 + rate, yearsToRetire)
      requiredSavings.push(presentValue)
    } else {
      requiredSavings.push(target)
    }
  }

  return {
    labels: ages.map(age => `Age ${age}`),
    datasets: [
      {
        label: 'Required Savings to Coast',
        data: requiredSavings,
        borderColor: '#27ae60',
        backgroundColor: '#27ae6033',
        fill: true,
        tension: 0.4
      }
    ]
  }
}

/**
 * Generate mortgage balance chart data
 */
export function generateMortgageBalanceChart(
  principal: number,
  basePayment: number,
  extraPayment: number,
  monthlyRate: number,
  lumpSum: number = 0
): ChartData {
  if (principal <= 0) throw new Error('Principal must be positive')
  if (basePayment <= 0) throw new Error('Base payment must be positive')
  if (extraPayment < 0) throw new Error('Extra payment cannot be negative')
  if (monthlyRate < 0) throw new Error('Monthly rate cannot be negative')
  if (lumpSum < 0) throw new Error('Lump sum cannot be negative')

  // Calculate payoff times to determine chart length
  const baseResult = calculatePayoff(principal, basePayment, monthlyRate, 0)
  const acceleratedResult = calculatePayoff(principal, basePayment + extraPayment, monthlyRate, lumpSum)
  const maxMonths = Math.max(baseResult.months, acceleratedResult.months)

  const labels: string[] = []
  const standardBalances: number[] = []
  const acceleratedBalances: number[] = []

  let standardBalance = principal
  let acceleratedBalance = principal - lumpSum

  for (let month = 0; month <= maxMonths; month++) {
    labels.push(month === 0 ? 'Start' : `Month ${month}`)

    // Standard balance calculation
    if (month === 0) {
      standardBalances.push(standardBalance)
    } else if (standardBalance > 0) {
      const interestCharge = standardBalance * monthlyRate
      const principalPayment = basePayment - interestCharge
      standardBalance = Math.max(0, standardBalance - principalPayment)
      standardBalances.push(standardBalance)
    } else {
      standardBalances.push(0)
    }

    // Accelerated balance calculation
    if (month === 0) {
      acceleratedBalances.push(acceleratedBalance)
    } else if (acceleratedBalance > 0) {
      const interestCharge = acceleratedBalance * monthlyRate
      const principalPayment = basePayment + extraPayment - interestCharge
      acceleratedBalance = Math.max(0, acceleratedBalance - principalPayment)
      acceleratedBalances.push(acceleratedBalance)
    } else {
      acceleratedBalances.push(0)
    }
  }

  return {
    labels,
    datasets: [
      {
        label: 'Standard Payoff',
        data: standardBalances,
        borderColor: '#95a5a6',
        backgroundColor: '#95a5a633',
        fill: false,
        tension: 0.4
      },
      {
        label: 'Accelerated Payoff',
        data: acceleratedBalances,
        borderColor: '#27ae60',
        backgroundColor: '#27ae6033',
        fill: false,
        tension: 0.4
      }
    ]
  }
}

/**
 * Generate interest comparison chart data
 */
export function generateInterestComparisonChart(
  principal: number,
  basePayment: number,
  extraPayment: number,
  monthlyRate: number,
  lumpSum: number = 0
): ChartData {
  if (principal <= 0) throw new Error('Principal must be positive')
  if (basePayment <= 0) throw new Error('Base payment must be positive')
  if (extraPayment < 0) throw new Error('Extra payment cannot be negative')
  if (monthlyRate < 0) throw new Error('Monthly rate cannot be negative')
  if (lumpSum < 0) throw new Error('Lump sum cannot be negative')

  // Generate amortization schedules
  const standardSchedule = generateAmortizationSchedule(principal, basePayment, monthlyRate, 0)
  const acceleratedSchedule = generateAmortizationSchedule(principal, basePayment + extraPayment, monthlyRate, lumpSum)

  const maxMonths = Math.max(standardSchedule.length, acceleratedSchedule.length)
  const labels: string[] = []
  const standardInterest: number[] = []
  const acceleratedInterest: number[] = []

  // Show yearly data points
  for (let month = 0; month <= maxMonths; month += 12) {
    const year = month / 12
    labels.push(year === 0 ? 'Start' : `Year ${year}`)

    // Get cumulative interest at this point
    const standardEntry = standardSchedule[Math.min(month - 1, standardSchedule.length - 1)]
    const acceleratedEntry = acceleratedSchedule[Math.min(month - 1, acceleratedSchedule.length - 1)]

    standardInterest.push(month === 0 ? 0 : (standardEntry?.totalInterest || standardSchedule[standardSchedule.length - 1]?.totalInterest || 0))
    acceleratedInterest.push(month === 0 ? 0 : (acceleratedEntry?.totalInterest || acceleratedSchedule[acceleratedSchedule.length - 1]?.totalInterest || 0))
  }

  return {
    labels,
    datasets: [
      {
        label: 'Standard Payoff Interest',
        data: standardInterest,
        borderColor: '#e74c3c',
        backgroundColor: '#e74c3c33',
        fill: true,
        tension: 0.4
      },
      {
        label: 'Accelerated Payoff Interest',
        data: acceleratedInterest,
        borderColor: '#27ae60',
        backgroundColor: '#27ae6033',
        fill: true,
        tension: 0.4
      }
    ]
  }
}

/**
 * Generate investment comparison chart data
 */
export function generateInvestmentComparisonChart(
  principal: number,
  basePayment: number,
  extraPayment: number,
  monthlyRate: number,
  lumpSum: number,
  investmentMonthlyReturn: number,
  taxRate: number
): ChartData {
  if (principal <= 0) throw new Error('Principal must be positive')
  if (basePayment <= 0) throw new Error('Base payment must be positive')
  if (extraPayment < 0) throw new Error('Extra payment cannot be negative')
  if (monthlyRate < 0) throw new Error('Monthly rate cannot be negative')
  if (lumpSum < 0) throw new Error('Lump sum cannot be negative')
  if (investmentMonthlyReturn < -1) throw new Error('Investment return cannot be less than -100%')
  if (taxRate < 0 || taxRate > 1) throw new Error('Tax rate must be between 0 and 1')

  const acceleratedResult = calculatePayoff(principal, basePayment + extraPayment, monthlyRate, lumpSum)
  const payoffMonths = acceleratedResult.months

  const labels: string[] = []
  const mortgageValues: number[] = []
  const investmentValues: number[] = []

  // Show yearly data points
  for (let month = 0; month <= payoffMonths; month += 12) {
    const year = month / 12
    labels.push(year === 0 ? 'Start' : `Year ${year}`)

    // Mortgage value (simplified - equity gained + interest saved)
    const equityGained = Math.min(lumpSum + (extraPayment * month), principal)
    const interestSavedApprox = (acceleratedResult.totalInterest / payoffMonths) * month * 0.5 // Rough approximation
    mortgageValues.push(equityGained + interestSavedApprox)

    // Investment value
    if (month === 0) {
      investmentValues.push(lumpSum)
    } else {
      // Compound the lump sum
      let investmentValue = lumpSum * Math.pow(1 + investmentMonthlyReturn, month)

      // Add monthly contributions compounded
      if (extraPayment > 0 && investmentMonthlyReturn !== 0) {
        const monthlyGrowth = extraPayment * ((Math.pow(1 + investmentMonthlyReturn, month) - 1) / investmentMonthlyReturn)
        investmentValue += monthlyGrowth
      } else if (extraPayment > 0) {
        investmentValue += extraPayment * month
      }

      // Apply taxes to gains
      const totalInvested = lumpSum + (extraPayment * month)
      const gains = Math.max(0, investmentValue - totalInvested)
      const taxOnGains = gains * taxRate
      investmentValues.push(investmentValue - taxOnGains)
    }
  }

  return {
    labels,
    datasets: [
      {
        label: 'Mortgage Payoff Value',
        data: mortgageValues,
        borderColor: '#409eff',
        backgroundColor: '#409eff33',
        fill: false,
        tension: 0.4
      },
      {
        label: 'Investment Value (After Tax)',
        data: investmentValues,
        borderColor: '#f39c12',
        backgroundColor: '#f39c1233',
        fill: false,
        tension: 0.4
      }
    ]
  }
}
