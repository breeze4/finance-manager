/**
 * Mathematical formatting utilities for tooltips
 * Provides functions to format formulas, equations, and mathematical expressions
 *
 * Ported verbatim from legacy-vue-calc/src/utils/mathFormatters.ts
 * Filename preserved (mathFormatters.ts) for source traceability.
 */

export interface FormulaValues {
  [key: string]: number | string
}

/**
 * Format a formula template with actual values
 */
export function formatFormula(template: string, values: FormulaValues): string {
  let formatted = template

  Object.entries(values).forEach(([key, value]) => {
    const placeholder = `{${key}}`
    let formattedValue: string

    if (typeof value === 'number') {
      const keyLower = key.toLowerCase()

      // Order matters - check more specific patterns first
      if (keyLower.includes('age') || (keyLower.includes('years') && !keyLower.includes('rate'))) {
        formattedValue = Math.round(value).toString()
      } else if (keyLower.includes('rate') || keyLower.includes('percentage')) {
        formattedValue = formatPercentage(value)
      } else if (keyLower.includes('currency') ||
                 keyLower.includes('amount') ||
                 keyLower.includes('savings') ||
                 (keyLower.includes('target') && !keyLower.includes('age')) ||
                 keyLower.includes('expenses')) {
        formattedValue = formatCurrency(value)
      } else {
        // For numeric values that shouldn't be formatted as currency
        formattedValue = formatNumber(value)
      }
    } else {
      formattedValue = String(value)
    }

    formatted = formatted.replace(
      new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
      formattedValue
    )
  })

  return formatted
}

/**
 * Format a number as currency
 */
export function formatCurrency(value: number, decimals: number = 0): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals
  }).format(value)
}

/**
 * Format a number as percentage
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`
}

/**
 * Format a regular number with proper locale formatting
 */
export function formatNumber(value: number, decimals: number = 0): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals
  }).format(value)
}

/**
 * Format exponential notation (base^exponent)
 */
export function formatExponent(base: number | string, exponent: number | string): string {
  const formattedBase = typeof base === 'number' ? formatNumber(base, 2) : base
  const formattedExp = typeof exponent === 'number' ? formatNumber(exponent, 0) : exponent
  return `${formattedBase}<sup>${formattedExp}</sup>`
}

/**
 * Format a complete equation (left operator right = result)
 */
export function formatEquation(left: string, operator: string, right: string, result: string): string {
  return `${left} ${operator} ${right} = ${result}`
}

/**
 * Format compound interest calculation steps
 */
export function formatCompoundInterestSteps(
  principal: number,
  rate: number,
  years: number,
  showSteps: boolean = true
): string[] {
  const steps: string[] = []
  const ratePercent = rate * 100
  const multiplier = Math.pow(1 + rate, years)
  const result = principal * multiplier

  steps.push(`FV = PV × (1 + r)<sup>${years}</sup>`)

  if (showSteps) {
    steps.push(`FV = ${formatCurrency(principal)} × (1 + ${formatPercentage(ratePercent)})<sup>${years}</sup>`)
    steps.push(`FV = ${formatCurrency(principal)} × (${formatNumber(1 + rate, 3)})<sup>${years}</sup>`)
    steps.push(`FV = ${formatCurrency(principal)} × ${formatNumber(multiplier, 3)}`)
  }

  steps.push(`FV = ${formatCurrency(result)}`)

  return steps
}

/**
 * Format present value calculation steps
 */
export function formatPresentValueSteps(
  futureValue: number,
  rate: number,
  years: number,
  showSteps: boolean = true
): string[] {
  const steps: string[] = []
  const ratePercent = rate * 100
  const divisor = Math.pow(1 + rate, years)
  const result = futureValue / divisor

  steps.push(`PV = FV ÷ (1 + r)<sup>${years}</sup>`)

  if (showSteps) {
    steps.push(`PV = ${formatCurrency(futureValue)} ÷ (1 + ${formatPercentage(ratePercent)})<sup>${years}</sup>`)
    steps.push(`PV = ${formatCurrency(futureValue)} ÷ (${formatNumber(1 + rate, 3)})<sup>${years}</sup>`)
    steps.push(`PV = ${formatCurrency(futureValue)} ÷ ${formatNumber(divisor, 3)}`)
  }

  steps.push(`PV = ${formatCurrency(result)}`)

  return steps
}

/**
 * Format Fisher equation calculation steps
 */
export function formatFisherEquationSteps(
  nominalRate: number,
  inflationRate: number,
  showSteps: boolean = true
): string[] {
  const steps: string[] = []
  const nominalPercent = nominalRate * 100
  const inflationPercent = inflationRate * 100
  const realRate = ((1 + nominalRate) / (1 + inflationRate)) - 1
  const realPercent = realRate * 100

  steps.push(`Real Rate = (1 + nominal) ÷ (1 + inflation) - 1`)

  if (showSteps) {
    steps.push(`Real Rate = (1 + ${formatPercentage(nominalPercent)}) ÷ (1 + ${formatPercentage(inflationPercent)}) - 1`)
    steps.push(`Real Rate = ${formatNumber(1 + nominalRate, 3)} ÷ ${formatNumber(1 + inflationRate, 3)} - 1`)
    steps.push(`Real Rate = ${formatNumber((1 + nominalRate) / (1 + inflationRate), 6)} - 1`)
  }

  steps.push(`Real Rate = ${formatPercentage(realPercent, 1)}`)

  return steps
}

/**
 * Format withdrawal rate calculation (4% rule)
 */
export function formatWithdrawalSteps(
  targetAmount: number,
  withdrawalRate: number,
  isMonthly: boolean = true,
  showSteps: boolean = true
): string[] {
  const steps: string[] = []
  const annualAmount = targetAmount * (withdrawalRate / 100)
  const monthlyAmount = annualAmount / 12

  if (isMonthly) {
    steps.push(`Monthly = (Target × Rate) ÷ 12`)
    if (showSteps) {
      steps.push(`Monthly = (${formatCurrency(targetAmount)} × ${formatPercentage(withdrawalRate)}) ÷ 12`)
      steps.push(`Monthly = ${formatCurrency(annualAmount)} ÷ 12`)
    }
    steps.push(`Monthly = ${formatCurrency(monthlyAmount)}`)
  } else {
    steps.push(`Annual = Target × Rate`)
    if (showSteps) {
      steps.push(`Annual = ${formatCurrency(targetAmount)} × ${formatPercentage(withdrawalRate)}`)
    }
    steps.push(`Annual = ${formatCurrency(annualAmount)}`)
  }

  return steps
}

/**
 * Format logarithmic time calculation (for Coast FIRE age)
 */
export function formatLogarithmicTimeSteps(
  futureValue: number,
  presentValue: number,
  rate: number,
  currentAge: number,
  showSteps: boolean = true
): string[] {
  const steps: string[] = []
  const ratePercent = rate * 100
  const ratio = futureValue / presentValue
  const years = Math.log(ratio) / Math.log(1 + rate)
  const targetAge = currentAge + years

  steps.push(`t = ln(FV ÷ PV) ÷ ln(1 + r)`)

  if (showSteps) {
    steps.push(`t = ln(${formatCurrency(futureValue)} ÷ ${formatCurrency(presentValue)}) ÷ ln(1 + ${formatPercentage(ratePercent)})`)
    steps.push(`t = ln(${formatNumber(ratio, 3)}) ÷ ln(${formatNumber(1 + rate, 3)})`)
    steps.push(`t = ${formatNumber(Math.log(ratio), 3)} ÷ ${formatNumber(Math.log(1 + rate), 6)}`)
    steps.push(`t = ${formatNumber(years, 1)} years`)
  }

  steps.push(`Coast FIRE Age = ${currentAge} + ${formatNumber(years, 1)} = ${formatNumber(targetAge, 1)} years old`)

  return steps
}

/**
 * Format monthly interest rate calculation steps
 */
export function formatMonthlyRateSteps(
  annualRate: number,
  showSteps: boolean = true
): string[] {
  const steps: string[] = []
  const monthlyRate = annualRate / 12

  steps.push(`Monthly Rate = Annual Rate ÷ 12`)

  if (showSteps) {
    steps.push(`Monthly Rate = ${formatPercentage(annualRate)} ÷ 12`)
  }

  steps.push(`Monthly Rate = ${formatPercentage(monthlyRate, 3)}`)

  return steps
}

/**
 * Format amortization calculation steps showing how monthly payments are applied
 */
export function formatAmortizationSteps(
  principal: number,
  monthlyPayment: number,
  monthlyRate: number,
  months: number = 3,
  showSteps: boolean = true
): string[] {
  const steps: string[] = []
  let balance = principal
  const monthlyRatePercent = monthlyRate * 100

  steps.push(`Amortization Formula (each month):`)
  steps.push(`Interest = Balance × Monthly Rate`)
  steps.push(`Principal Payment = Monthly Payment - Interest`)
  steps.push(`New Balance = Balance - Principal Payment`)

  if (showSteps && months > 0) {
    steps.push(``) // Empty line for readability

    for (let i = 1; i <= Math.min(months, 3); i++) {
      const interestPayment = balance * monthlyRate
      const principalPayment = monthlyPayment - interestPayment
      balance = Math.max(0, balance - principalPayment)

      steps.push(`Month ${i}:`)
      steps.push(`  Interest = ${formatCurrency(balance + principalPayment)} × ${formatPercentage(monthlyRatePercent, 3)} = ${formatCurrency(interestPayment)}`)
      steps.push(`  Principal = ${formatCurrency(monthlyPayment)} - ${formatCurrency(interestPayment)} = ${formatCurrency(principalPayment)}`)
      steps.push(`  New Balance = ${formatCurrency(balance)}`)

      if (balance <= 0) break
    }

    if (balance > 0 && months > 3) {
      steps.push(`  ... (continues for remaining months)`)
    }
  }

  return steps
}

/**
 * Format investment compounding calculation steps with monthly contributions
 */
export function formatInvestmentCompoundingSteps(
  lumpSum: number,
  monthlyContribution: number,
  monthlyRate: number,
  months: number,
  showSteps: boolean = true
): string[] {
  const steps: string[] = []
  const years = Math.round(months / 12 * 10) / 10

  // Calculate future value of lump sum
  const lumpSumFV = lumpSum * Math.pow(1 + monthlyRate, months)

  // Calculate future value of monthly contributions (annuity formula)
  const monthlyFV = monthlyContribution === 0 ? 0 :
    monthlyContribution * (Math.pow(1 + monthlyRate, months) - 1) / monthlyRate

  const totalFV = lumpSumFV + monthlyFV

  steps.push(`Investment Growth = Lump Sum Growth + Monthly Contributions Growth`)

  if (showSteps) {
    // Lump sum calculation
    if (lumpSum > 0) {
      steps.push(``)
      steps.push(`Lump Sum Growth:`)
      steps.push(`  FV = ${formatCurrency(lumpSum)} × (1 + ${formatPercentage(monthlyRate * 100, 3)})<sup>${months}</sup>`)
      steps.push(`  FV = ${formatCurrency(lumpSum)} × ${formatNumber(Math.pow(1 + monthlyRate, months), 3)}`)
      steps.push(`  FV = ${formatCurrency(lumpSumFV)}`)
    }

    // Monthly contributions calculation
    if (monthlyContribution > 0) {
      steps.push(``)
      steps.push(`Monthly Contributions Growth (${formatCurrency(monthlyContribution)}/month for ${years} years):`)
      steps.push(`  FV = PMT × [(1 + r)<sup>n</sup> - 1] ÷ r`)
      steps.push(`  FV = ${formatCurrency(monthlyContribution)} × [${formatNumber(Math.pow(1 + monthlyRate, months), 3)} - 1] ÷ ${formatNumber(monthlyRate, 6)}`)
      steps.push(`  FV = ${formatCurrency(monthlyContribution)} × ${formatNumber((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate, 2)}`)
      steps.push(`  FV = ${formatCurrency(monthlyFV)}`)
    }

    steps.push(``)
    steps.push(`Total Investment Value:`)
    if (lumpSum > 0 && monthlyContribution > 0) {
      steps.push(`  Total = ${formatCurrency(lumpSumFV)} + ${formatCurrency(monthlyFV)}`)
    }
  }

  steps.push(`Total Investment Value = ${formatCurrency(totalFV)}`)

  return steps
}

/**
 * Format tax calculation steps for capital gains
 */
export function formatTaxCalculationSteps(
  grossReturn: number,
  totalInvested: number,
  taxRate: number,
  showSteps: boolean = true
): string[] {
  const steps: string[] = []
  const profit = Math.max(0, grossReturn - totalInvested)
  const taxes = profit * taxRate
  const netReturn = grossReturn - taxes
  const taxRatePercent = taxRate * 100

  steps.push(`After-Tax Calculation:`)
  steps.push(`Taxable Profit = Gross Return - Total Invested`)
  steps.push(`Taxes = Taxable Profit × Tax Rate`)
  steps.push(`Net Return = Gross Return - Taxes`)

  if (showSteps) {
    steps.push(``)
    steps.push(`Taxable Profit = ${formatCurrency(grossReturn)} - ${formatCurrency(totalInvested)}`)
    steps.push(`Taxable Profit = ${formatCurrency(profit)}`)
    steps.push(``)
    steps.push(`Taxes = ${formatCurrency(profit)} × ${formatPercentage(taxRatePercent)}`)
    steps.push(`Taxes = ${formatCurrency(taxes)}`)
    steps.push(``)
    steps.push(`Net Return = ${formatCurrency(grossReturn)} - ${formatCurrency(taxes)}`)
  }

  steps.push(`Net Return = ${formatCurrency(netReturn)}`)

  return steps
}

/**
 * Format payoff comparison calculation steps
 */
export function formatPayoffComparisonSteps(
  interestSaved: number,
  investmentNetBenefit: number,
  showSteps: boolean = true
): string[] {
  const steps: string[] = []
  const betterStrategy = interestSaved > investmentNetBenefit ? 'Payoff' : 'Investment'
  const difference = Math.abs(interestSaved - investmentNetBenefit)

  steps.push(`Strategy Comparison:`)
  steps.push(`Compare Interest Saved vs Investment Net Benefit`)

  if (showSteps) {
    steps.push(``)
    steps.push(`Mortgage Payoff Benefit: ${formatCurrency(interestSaved)}`)
    steps.push(`Investment Net Benefit: ${formatCurrency(investmentNetBenefit)}`)
    steps.push(``)
    if (interestSaved > investmentNetBenefit) {
      steps.push(`${formatCurrency(interestSaved)} > ${formatCurrency(investmentNetBenefit)}`)
      steps.push(`Payoff is better by ${formatCurrency(difference)}`)
    } else {
      steps.push(`${formatCurrency(investmentNetBenefit)} > ${formatCurrency(interestSaved)}`)
      steps.push(`Investment is better by ${formatCurrency(difference)}`)
    }
  }

  steps.push(`Recommended Strategy: ${betterStrategy}`)

  return steps
}
