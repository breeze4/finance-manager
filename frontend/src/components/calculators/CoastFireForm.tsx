/**
 * Coast FIRE input form.
 *
 * Mirrors the Vue source `legacy-vue-calc/src/views/CoastFireCalculator.vue`
 * field grouping and ordering. Bidirectional sync between
 * `monthly_expenses` ⇄ `yearly_expenses` ⇄ `target_retirement_amount` is
 * driven by `last_edited_field`, matching the behavior of the Pinia store's
 * `syncFromMonthlyExpenses` / `syncFromYearlyExpenses` / `syncFromTargetAmount`.
 *
 * Plain controlled inputs — no react-hook-form. The parent owns the
 * `CoastFireScenarioCreate` state and re-renders on each change.
 */

import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CoastFireScenarioCreate } from "@/api/coastFire";

export type CoastFireInputState = CoastFireScenarioCreate;

export interface CoastFireFormProps {
  state: CoastFireInputState;
  onChange: (next: CoastFireInputState) => void;
  errors?: Record<string, string>;
}

/* -------------------------------------------------------------------------- */
/* Sync helpers — mirror the Pinia store's sync actions verbatim.             */
/* -------------------------------------------------------------------------- */

export function syncFromMonthly(state: CoastFireInputState): CoastFireInputState {
  const next: CoastFireInputState = {
    ...state,
    last_edited_field: "monthly"
  };
  if (state.withdrawal_rate > 0) {
    const target = Math.round(
      (state.monthly_expenses * 12) / (state.withdrawal_rate / 100)
    );
    next.target_retirement_amount = target;
    next.yearly_expenses = Math.round(state.monthly_expenses * 12);
  }
  return next;
}

export function syncFromYearly(state: CoastFireInputState): CoastFireInputState {
  const next: CoastFireInputState = {
    ...state,
    last_edited_field: "yearly"
  };
  if (state.withdrawal_rate > 0) {
    const target = Math.round(state.yearly_expenses / (state.withdrawal_rate / 100));
    next.target_retirement_amount = target;
    next.monthly_expenses = Math.round(state.yearly_expenses / 12);
  }
  return next;
}

export function syncFromTarget(state: CoastFireInputState): CoastFireInputState {
  const next: CoastFireInputState = {
    ...state,
    last_edited_field: "target"
  };
  if (state.withdrawal_rate > 0) {
    const monthly = Math.round(
      (state.target_retirement_amount * (state.withdrawal_rate / 100)) / 12
    );
    next.monthly_expenses = monthly;
    next.yearly_expenses = Math.round(monthly * 12);
  }
  return next;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

export function CoastFireForm({ state, onChange, errors }: CoastFireFormProps) {
  const setField = <K extends keyof CoastFireInputState>(
    key: K,
    value: CoastFireInputState[K]
  ) => onChange({ ...state, [key]: value });

  const numField = (key: keyof CoastFireInputState) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      const num = v === "" ? 0 : Number(v);
      onChange({ ...state, [key]: Number.isFinite(num) ? num : 0 });
    };

  const monthlyHandler = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    const num = v === "" ? 0 : Number(v);
    onChange(syncFromMonthly({ ...state, monthly_expenses: Number.isFinite(num) ? num : 0 }));
  };

  const yearlyHandler = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    const num = v === "" ? 0 : Number(v);
    onChange(syncFromYearly({ ...state, yearly_expenses: Number.isFinite(num) ? num : 0 }));
  };

  const targetHandler = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    const num = v === "" ? 0 : Number(v);
    onChange(syncFromTarget({ ...state, target_retirement_amount: Number.isFinite(num) ? num : 0 }));
  };

  const errClass = (key: string) =>
    errors?.[key] ? "border-destructive focus-visible:ring-destructive" : "";

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold">Input Parameters</h3>

      <Field
        id="current-age"
        label="Current Age"
        error={errors?.currentAge}
      >
        <Input
          id="current-age"
          type="number"
          min={18}
          max={100}
          value={state.current_age}
          onChange={numField("current_age")}
          className={errClass("currentAge")}
        />
      </Field>

      <Field
        id="retirement-age"
        label="Retirement Age"
        error={errors?.retirementAge}
      >
        <Input
          id="retirement-age"
          type="number"
          min={18}
          max={100}
          value={state.retirement_age}
          onChange={numField("retirement_age")}
          className={errClass("retirementAge")}
        />
      </Field>

      <Field
        id="current-savings"
        label="Current Retirement Savings"
        error={errors?.currentSavings}
      >
        <Input
          id="current-savings"
          type="number"
          min={0}
          step={1000}
          value={state.current_savings}
          onChange={numField("current_savings")}
          className={errClass("currentSavings")}
        />
      </Field>

      <Field
        id="return-rate"
        label="Expected Annual Return (%)"
        error={errors?.expectedReturnRate}
      >
        <Input
          id="return-rate"
          type="number"
          min={0}
          max={30}
          step={0.1}
          value={state.expected_return_rate}
          onChange={numField("expected_return_rate")}
          className={errClass("expectedReturnRate")}
        />
      </Field>

      <Field
        id="target-amount"
        label="Target Retirement Amount"
        error={errors?.targetRetirementAmount}
      >
        <Input
          id="target-amount"
          type="number"
          min={0}
          step={10000}
          value={state.target_retirement_amount}
          onChange={targetHandler}
          className={errClass("targetRetirementAmount")}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field
          id="monthly-expenses"
          label="Monthly Expenses"
          error={errors?.monthlyExpenses}
        >
          <Input
            id="monthly-expenses"
            type="number"
            min={0}
            step={100}
            value={state.monthly_expenses}
            onChange={monthlyHandler}
            className={errClass("monthlyExpenses")}
          />
        </Field>

        <Field
          id="yearly-expenses"
          label="Yearly Expenses"
          error={errors?.yearlyExpenses}
        >
          <Input
            id="yearly-expenses"
            type="number"
            min={0}
            step={1000}
            value={state.yearly_expenses}
            onChange={yearlyHandler}
            className={errClass("yearlyExpenses")}
          />
        </Field>
      </div>

      <Field
        id="withdrawal-rate"
        label="Safe Withdrawal Rate (%)"
        error={errors?.withdrawalRate}
      >
        <Input
          id="withdrawal-rate"
          type="number"
          min={2}
          max={8}
          step={0.1}
          value={state.withdrawal_rate}
          onChange={numField("withdrawal_rate")}
          className={errClass("withdrawalRate")}
        />
      </Field>

      <Field
        id="inflation-rate"
        label="Expected Inflation Rate (%)"
        error={errors?.inflationRate}
      >
        <Input
          id="inflation-rate"
          type="number"
          min={0}
          max={10}
          step={0.1}
          value={state.inflation_rate}
          onChange={numField("inflation_rate")}
          className={errClass("inflationRate")}
        />
      </Field>

      <label className="flex cursor-pointer items-start gap-2">
        <input
          id="use-real-returns"
          type="checkbox"
          className="mt-1"
          checked={state.use_real_returns}
          onChange={e => setField("use_real_returns", e.target.checked)}
        />
        <span className="text-sm">Use Real (Inflation-Adjusted) Returns</span>
      </label>
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
