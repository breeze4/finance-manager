/**
 * Mortgage Payoff input form.
 *
 * Mirrors the Vue source `legacy-vue-calc/src/views/MortgagePayoffCalculator.vue`
 * field grouping and ordering. Eight inputs grouped into Mortgage Information,
 * Additional Payments, and Investment Scenario sections.
 *
 * Plain controlled inputs — no react-hook-form. The parent owns the
 * `MortgageScenarioCreate` state and re-renders on each change.
 */

import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { MortgageScenarioCreate } from "@/api/mortgage";

export type MortgageInputState = MortgageScenarioCreate;

export interface MortgageFormProps {
  state: MortgageInputState;
  onChange: (next: MortgageInputState) => void;
  errors?: Record<string, string>;
}

export function MortgageForm({ state, onChange, errors }: MortgageFormProps) {
  const numField = (key: keyof MortgageInputState) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      const num = v === "" ? 0 : Number(v);
      onChange({ ...state, [key]: Number.isFinite(num) ? num : 0 });
    };

  const errClass = (key: string) =>
    errors?.[key] ? "border-destructive focus-visible:ring-destructive" : "";

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold">Mortgage Information</h3>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field
          id="principal"
          label="Current Principal Balance"
          error={errors?.principal}
        >
          <Input
            id="principal"
            type="number"
            min={0}
            step={1000}
            value={state.principal}
            onChange={numField("principal")}
            className={errClass("principal")}
          />
        </Field>

        <Field
          id="years-left"
          label="Years Remaining"
          error={errors?.yearsLeft}
        >
          <Input
            id="years-left"
            type="number"
            min={0}
            max={50}
            step={1}
            value={state.years_left}
            onChange={numField("years_left")}
            className={errClass("yearsLeft")}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field
          id="interest-rate"
          label="Interest Rate (%)"
          error={errors?.interestRate}
        >
          <Input
            id="interest-rate"
            type="number"
            min={0}
            max={20}
            step={0.1}
            value={state.interest_rate}
            onChange={numField("interest_rate")}
            className={errClass("interestRate")}
          />
        </Field>

        <Field
          id="monthly-payment"
          label="Monthly P&I Payment"
          error={errors?.monthlyPayment}
        >
          <Input
            id="monthly-payment"
            type="number"
            min={0}
            step={10}
            value={state.monthly_payment}
            onChange={numField("monthly_payment")}
            className={errClass("monthlyPayment")}
          />
        </Field>
      </div>

      <h3 className="pt-2 text-base font-semibold">Additional Payments</h3>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field
          id="additional-monthly"
          label="Extra Monthly Payment"
          error={errors?.additionalMonthlyPayment}
        >
          <Input
            id="additional-monthly"
            type="number"
            min={0}
            step={50}
            value={state.additional_monthly_payment}
            onChange={numField("additional_monthly_payment")}
            className={errClass("additionalMonthlyPayment")}
          />
        </Field>

        <Field
          id="lump-sum"
          label="One-Time Lump Sum"
          error={errors?.lumpSumPayment}
        >
          <Input
            id="lump-sum"
            type="number"
            min={0}
            step={1000}
            value={state.lump_sum_payment}
            onChange={numField("lump_sum_payment")}
            className={errClass("lumpSumPayment")}
          />
        </Field>
      </div>

      <h3 className="pt-2 text-base font-semibold">Investment Scenario</h3>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field
          id="return-rate"
          label="Expected Annual Return (%)"
          error={errors?.investmentReturnRate}
        >
          <Input
            id="return-rate"
            type="number"
            min={0}
            max={30}
            step={0.1}
            value={state.investment_return_rate}
            onChange={numField("investment_return_rate")}
            className={errClass("investmentReturnRate")}
          />
        </Field>

        <Field
          id="tax-rate"
          label="Capital Gains Tax Rate (%)"
          error={errors?.investmentTaxRate}
        >
          <Input
            id="tax-rate"
            type="number"
            min={0}
            max={50}
            step={1}
            value={state.investment_tax_rate}
            onChange={numField("investment_tax_rate")}
            className={errClass("investmentTaxRate")}
          />
        </Field>
      </div>
    </div>
  );
}

interface FieldProps {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}

function Field({ id, label, error, children }: FieldProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error && (
        <p className={cn("text-xs text-destructive")} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
