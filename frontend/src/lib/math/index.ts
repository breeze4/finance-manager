/**
 * Math Library - Barrel Export
 *
 * Clean import interface for all mathematical functions used in the finance calculator.
 * Organized by functional area for easy discovery and use.
 */

// Core Compound Interest Functions
export {
  calculateFutureValue,
  calculatePresentValue,
  calculateTimeToTarget,
  calculateRealReturnRate,
  adjustTargetForInflation,
  calculateYearsToRetirement
} from './compound'

// Coast FIRE Calculations
export {
  calculateCoastFireNumber,
  calculateAdditionalSavingsNeeded,
  isCoastFireReady,
  calculateCoastFireAge,
  calculateTargetFromExpenses,
  calculateTargetFromMonthlyExpenses,
  calculateExpensesFromTarget,
  calculateMonthlyExpensesFromTarget,
  generateCoastFireProjection
} from './coastFire'

// Mortgage Calculations
export {
  calculateMonthlyRate,
  calculatePayoff,
  generateAmortizationSchedule,
  calculateInvestmentValue,
  calculateAfterTaxReturn,
  determineBetterStrategy,
  calculateRequiredPayment,
  type PaymentDetail,
  type PayoffResult,
  type InvestmentResult
} from './mortgage'

// Input Validation
export {
  validateNumericRange,
  validateNonNegative,
  validatePositive,
  validateAge,
  validateReturnRate,
  validateWithdrawalRate,
  validateInflationRate,
  validateTaxRate,
  validateRetirementAge,
  validateCoastFireInputs,
  validateMortgageInputs,
  type ValidationResult,
  type CoastFireInputs,
  type MortgageInputs
} from './validation'

// Chart Data Generation (Chart.js-shaped output)
export {
  generateCoastFireProjectionChart,
  generateRequiredSavingsByAgeChart,
  generateMortgageBalanceChart,
  generateInterestComparisonChart,
  generateInvestmentComparisonChart,
  type ChartData,
  type ChartDataset
} from './charts'

// Recharts adapters (Chart.js → Recharts row arrays)
export {
  coastFireProjectionToRecharts,
  requiredSavingsByAgeToRecharts,
  mortgageBalanceToRecharts,
  interestComparisonToRecharts,
  investmentComparisonToRecharts,
  type CoastFireProjectionRow,
  type RequiredSavingsByAgeRow,
  type MortgageBalanceRow,
  type InterestComparisonRow,
  type InvestmentComparisonRow,
  type InvestmentComparisonResult
} from './charts/rechartsAdapters'

// Mathematical formatters (for tooltip rendering)
export {
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
  formatPayoffComparisonSteps,
  type FormulaValues
} from './mathFormatters'
