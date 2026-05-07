/**
 * Mortgage Payoff calculator page.
 *
 * Composition: scenario picker (top) + form (left) + results (right).
 *
 * Behaviors:
 *   - Loads the active scenario via React Query. 404 → seeded defaults +
 *     "Save as scenario" CTA.
 *   - Tracks dirty state by comparing the current input to the active
 *     scenario's snapshot (deep equality on input fields).
 *   - Save reuses an existing scenario (if one is loaded) or creates a new
 *     one (first-run path).
 *   - Switching scenarios via the picker calls activate, then refetches.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  MortgageForm,
  type MortgageInputState
} from "@/components/calculators/MortgageForm";
import { MortgageResults } from "@/components/calculators/MortgageResults";
import { ScenarioPicker, type ScenarioBase } from "@/components/calculators/ScenarioPicker";
import { validateMortgageInputs } from "@/lib/math";
import {
  defaultMortgageScenario,
  useActivateScenario,
  useActiveScenario,
  useCreateScenario,
  useDeleteScenario,
  useScenarios,
  useUpdateScenario
} from "@/hooks/useMortgageScenario";
import type { MortgageScenario, MortgageScenarioCreate } from "@/api/mortgage";

const INPUT_KEYS = [
  "name",
  "principal",
  "years_left",
  "interest_rate",
  "monthly_payment",
  "additional_monthly_payment",
  "lump_sum_payment",
  "investment_return_rate",
  "investment_tax_rate"
] as const;

function snapshotOfScenario(s: MortgageScenario): MortgageScenarioCreate {
  return {
    name: s.name,
    principal: s.principal,
    years_left: s.years_left,
    interest_rate: s.interest_rate,
    monthly_payment: s.monthly_payment,
    additional_monthly_payment: s.additional_monthly_payment,
    lump_sum_payment: s.lump_sum_payment,
    investment_return_rate: s.investment_return_rate,
    investment_tax_rate: s.investment_tax_rate
  };
}

function inputsEqual(a: MortgageInputState, b: MortgageInputState): boolean {
  for (const key of INPUT_KEYS) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function toScenarioBase(s: MortgageScenario): ScenarioBase {
  return { id: s.id, name: s.name, isActive: s.is_active };
}

export default function Mortgage() {
  const scenariosQ = useScenarios();
  const activeQ = useActiveScenario();

  const createMut = useCreateScenario();
  const updateMut = useUpdateScenario();
  const activateMut = useActivateScenario();
  const deleteMut = useDeleteScenario();

  const [state, setState] = useState<MortgageInputState>(defaultMortgageScenario);
  const baselineRef = useRef<MortgageInputState>(defaultMortgageScenario);
  const loadedActiveIdRef = useRef<number | null>(null);

  // Pull defaults from the active scenario (if any) into local state on first
  // load, and whenever the active scenario id flips (from a switch).
  useEffect(() => {
    if (activeQ.data) {
      const snap = snapshotOfScenario(activeQ.data);
      if (loadedActiveIdRef.current !== activeQ.data.id) {
        setState(snap);
        baselineRef.current = snap;
        loadedActiveIdRef.current = activeQ.data.id;
      }
    } else if (activeQ.isFetched && !activeQ.data) {
      // First-run: no active scenario.
      if (loadedActiveIdRef.current !== null) {
        setState(defaultMortgageScenario);
        baselineRef.current = defaultMortgageScenario;
        loadedActiveIdRef.current = null;
      }
    }
  }, [activeQ.data, activeQ.isFetched]);

  const validation = useMemo(() => {
    return validateMortgageInputs({
      principal: state.principal,
      yearsLeft: state.years_left,
      interestRate: state.interest_rate,
      monthlyPayment: state.monthly_payment,
      additionalMonthlyPayment: state.additional_monthly_payment,
      lumpSumPayment: state.lump_sum_payment,
      investmentReturnRate: state.investment_return_rate,
      investmentTaxRate: state.investment_tax_rate
    });
  }, [state]);

  const isDirty = !inputsEqual(state, baselineRef.current);
  const activeScenario = activeQ.data ?? null;
  const activeId = activeScenario?.id ?? null;

  const handleSelect = (id: number) => {
    if (id === activeId) return;
    activateMut.mutate(id);
  };

  const handleCreate = (name: string) => {
    createMut.mutate({ ...state, name });
  };

  const handleRename = (id: number, name: string) => {
    updateMut.mutate({ id, payload: { name } });
  };

  const handleDuplicate = (id: number) => {
    const src = scenariosQ.data?.find(s => s.id === id);
    if (!src) return;
    const baseName = `${src.name} (copy)`;
    const existingNames = new Set(scenariosQ.data?.map(s => s.name) ?? []);
    let candidate = baseName;
    let i = 2;
    while (existingNames.has(candidate)) {
      candidate = `${baseName} ${i++}`;
    }
    createMut.mutate({ ...snapshotOfScenario(src), name: candidate });
  };

  const handleDelete = (id: number) => {
    deleteMut.mutate(id);
  };

  const handleSave = () => {
    if (!validation.isValid) return;
    if (activeId !== null) {
      updateMut.mutate(
        { id: activeId, payload: { ...state } },
        {
          onSuccess: data => {
            const snap = snapshotOfScenario(data);
            baselineRef.current = snap;
            setState(snap);
          }
        }
      );
    } else {
      createMut.mutate(
        { ...state },
        {
          onSuccess: data => {
            const snap = snapshotOfScenario(data);
            baselineRef.current = snap;
            setState(snap);
            loadedActiveIdRef.current = data.id;
          }
        }
      );
    }
  };

  const scenarios = scenariosQ.data ?? [];
  const pickerScenarios = scenarios.map(toScenarioBase);

  const saveDisabled = !validation.isValid || (!isDirty && activeId !== null);
  const saveLabel =
    activeId === null ? "Save as scenario" : isDirty ? "Save changes" : "Saved";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Mortgage Payoff Calculator</h2>
          <p className="text-sm text-muted-foreground">
            Compare different strategies for paying off your mortgage vs investing the extra payments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ScenarioPicker
            scenarios={pickerScenarios}
            activeId={activeId}
            isDirty={isDirty && activeId !== null}
            onSelect={handleSelect}
            onCreate={handleCreate}
            onRename={handleRename}
            onDuplicate={handleDuplicate}
            onDelete={handleDelete}
          />
          <Button onClick={handleSave} disabled={saveDisabled}>
            {saveLabel}
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <MortgageForm
            state={state}
            onChange={setState}
            errors={validation.errors}
          />
        </div>
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <MortgageResults state={state} />
        </div>
      </div>
    </div>
  );
}
