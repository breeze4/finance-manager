/**
 * Input Validation Functions
 *
 * Pure functions for validating user inputs across the finance calculator.
 * All functions return null for valid inputs or error message strings for invalid inputs.
 *
 * Ported verbatim from legacy-vue-calc/src/utils/math/validation.ts
 */

/**
 * Interface for validation result
 */
export interface ValidationResult {
  isValid: boolean
  errors: Record<string, string>
}

/**
 * Interface for Coast FIRE input validation
 */
export interface CoastFireInputs {
  currentAge: number
  retirementAge: number
  currentSavings: number
  expectedReturnRate: number
  targetRetirementAmount: number
  monthlyExpenses: number
  yearlyExpenses: number
  withdrawalRate: number
  inflationRate: number
}

/**
 * Interface for Mortgage input validation
 */
export interface MortgageInputs {
  principal: number
  yearsLeft: number
  interestRate: number
  monthlyPayment: number
  additionalMonthlyPayment: number
  lumpSumPayment: number
  investmentReturnRate: number
  investmentTaxRate: number
}

/**
 * Validate a numeric value is within a specified range
 */
export function validateNumericRange(
  value: number,
  min: number,
  max: number,
  fieldName: string
): string | null {
  if (typeof value !== 'number' || isNaN(value)) {
    return `${fieldName} must be a valid number`
  }

  if (value < min || value > max) {
    return `${fieldName} must be between ${min} and ${max}`
  }

  return null
}

/**
 * Validate that a value is not negative
 */
export function validateNonNegative(value: number, fieldName: string): string | null {
  if (typeof value !== 'number' || isNaN(value)) {
    return `${fieldName} must be a valid number`
  }

  if (value < 0) {
    return `${fieldName} cannot be negative`
  }

  return null
}

/**
 * Validate that a value is positive (greater than 0)
 */
export function validatePositive(value: number, fieldName: string): string | null {
  if (typeof value !== 'number' || isNaN(value)) {
    return `${fieldName} must be a valid number`
  }

  if (value <= 0) {
    return `${fieldName} must be greater than 0`
  }

  return null
}

/**
 * Validate age range (18-100)
 */
export function validateAge(age: number, fieldName: string): string | null {
  return validateNumericRange(age, 18, 100, fieldName)
}

/**
 * Validate percentage rate (0-30%)
 */
export function validateReturnRate(rate: number, fieldName: string): string | null {
  const error = validateNumericRange(rate, 0, 30, fieldName)
  if (error) {
    return error.replace('between 0 and 30', 'between 0% and 30%')
  }
  return null
}

/**
 * Validate withdrawal rate (2-8%)
 */
export function validateWithdrawalRate(rate: number, fieldName: string): string | null {
  const error = validateNumericRange(rate, 2, 8, fieldName)
  if (error) {
    return error.replace('must be between 2 and 8', 'should be between 2% and 8%')
  }
  return null
}

/**
 * Validate inflation rate (0-10%)
 */
export function validateInflationRate(rate: number, fieldName: string): string | null {
  const error = validateNumericRange(rate, 0, 10, fieldName)
  if (error) {
    return error.replace('must be between 0 and 10', 'should be between 0% and 10%')
  }
  return null
}

/**
 * Validate tax rate (0-50%)
 */
export function validateTaxRate(rate: number, fieldName: string): string | null {
  const error = validateNumericRange(rate, 0, 50, fieldName)
  if (error) {
    return error.replace('between 0 and 50', 'between 0% and 50%')
  }
  return null
}

/**
 * Validate that retirement age is greater than current age
 */
export function validateRetirementAge(currentAge: number, retirementAge: number): string | null {
  if (typeof currentAge !== 'number' || isNaN(currentAge)) {
    return 'Current age must be a valid number'
  }

  if (typeof retirementAge !== 'number' || isNaN(retirementAge)) {
    return 'Retirement age must be a valid number'
  }

  if (retirementAge <= currentAge) {
    return 'Retirement age must be greater than current age'
  }

  return null
}

/**
 * Validate all Coast FIRE inputs
 */
export function validateCoastFireInputs(inputs: CoastFireInputs): ValidationResult {
  const errors: Record<string, string> = {}

  // Individual field validations
  const currentAgeError = validateAge(inputs.currentAge, 'Current age')
  if (currentAgeError) errors.currentAge = currentAgeError

  const retirementAgeError = validateAge(inputs.retirementAge, 'Retirement age')
  if (retirementAgeError) errors.retirementAge = retirementAgeError

  const currentSavingsError = validateNonNegative(inputs.currentSavings, 'Current savings')
  if (currentSavingsError) errors.currentSavings = currentSavingsError

  const returnRateError = validateReturnRate(inputs.expectedReturnRate, 'Return rate')
  if (returnRateError) errors.expectedReturnRate = returnRateError

  const targetError = validatePositive(inputs.targetRetirementAmount, 'Target retirement amount')
  if (targetError) errors.targetRetirementAmount = targetError

  const monthlyExpensesError = validateNonNegative(inputs.monthlyExpenses, 'Monthly expenses')
  if (monthlyExpensesError) errors.monthlyExpenses = monthlyExpensesError

  const yearlyExpensesError = validateNonNegative(inputs.yearlyExpenses, 'Yearly expenses')
  if (yearlyExpensesError) errors.yearlyExpenses = yearlyExpensesError

  const withdrawalRateError = validateWithdrawalRate(inputs.withdrawalRate, 'Withdrawal rate')
  if (withdrawalRateError) errors.withdrawalRate = withdrawalRateError

  const inflationRateError = validateInflationRate(inputs.inflationRate, 'Inflation rate')
  if (inflationRateError) errors.inflationRate = inflationRateError

  // Cross-field validation
  const retirementAgeComparisonError = validateRetirementAge(inputs.currentAge, inputs.retirementAge)
  if (retirementAgeComparisonError && !errors.retirementAge) {
    errors.retirementAge = retirementAgeComparisonError
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  }
}

/**
 * Validate all Mortgage inputs
 */
export function validateMortgageInputs(inputs: MortgageInputs): ValidationResult {
  const errors: Record<string, string> = {}

  const principalError = validatePositive(inputs.principal, 'Principal')
  if (principalError) errors.principal = principalError

  const yearsLeftError = validateNumericRange(inputs.yearsLeft, 0.1, 50, 'Years left')
  if (yearsLeftError) errors.yearsLeft = yearsLeftError

  const interestRateError = validateNumericRange(inputs.interestRate, 0, 15, 'Interest rate')
  if (interestRateError) {
    errors.interestRate = interestRateError.replace('between 0 and 15', 'between 0% and 15%')
  }

  const monthlyPaymentError = validatePositive(inputs.monthlyPayment, 'Monthly payment')
  if (monthlyPaymentError) errors.monthlyPayment = monthlyPaymentError

  const additionalPaymentError = validateNonNegative(inputs.additionalMonthlyPayment, 'Additional monthly payment')
  if (additionalPaymentError) errors.additionalMonthlyPayment = additionalPaymentError

  const lumpSumError = validateNonNegative(inputs.lumpSumPayment, 'Lump sum payment')
  if (lumpSumError) errors.lumpSumPayment = lumpSumError

  const investmentReturnError = validateReturnRate(inputs.investmentReturnRate, 'Investment return rate')
  if (investmentReturnError) errors.investmentReturnRate = investmentReturnError

  const taxRateError = validateTaxRate(inputs.investmentTaxRate, 'Investment tax rate')
  if (taxRateError) errors.investmentTaxRate = taxRateError

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  }
}
