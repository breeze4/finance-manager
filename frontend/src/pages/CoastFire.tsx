/**
 * Coast FIRE calculator page.
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
  CoastFireForm,
  type CoastFireInputState
} from "@/components/calculators/CoastFireForm";
import { CoastFireResults } from "@/components/calculators/CoastFireResults";
import { ScenarioPicker, type ScenarioBase } from "@/components/calculators/ScenarioPicker";
import { validateCoastFireInputs } from "@/lib/math";
import {
  defaultCoastFireScenario,
  useActivateScenario,
  useActiveScenario,
  useCreateScenario,
  useDeleteScenario,
  useScenarios,
  useUpdateScenario
} from "@/hooks/useCoastFireScenario";
import type { CoastFireScenario, CoastFireScenarioCreate } from "@/api/coastFire";

const INPUT_KEYS = [
  "current_age",
  "retirement_age",
  "current_savings",
  "expected_return_rate",
  "target_retirement_amount",
  "monthly_expenses",
  "yearly_expenses",
  "withdrawal_rate",
  "inflation_rate",
  "use_real_returns",
  "last_edited_field",
  "name"
] as const;

function snapshotOfScenario(s: CoastFireScenario): CoastFireScenarioCreate {
  return {
    name: s.name,
    current_age: s.current_age,
    retirement_age: s.retirement_age,
    current_savings: s.current_savings,
    expected_return_rate: s.expected_return_rate,
    target_retirement_amount: s.target_retirement_amount,
    monthly_expenses: s.monthly_expenses,
    yearly_expenses: s.yearly_expenses,
    withdrawal_rate: s.withdrawal_rate,
    inflation_rate: s.inflation_rate,
    use_real_returns: s.use_real_returns,
    last_edited_field: s.last_edited_field
  };
}

function inputsEqual(a: CoastFireInputState, b: CoastFireInputState): boolean {
  for (const key of INPUT_KEYS) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function toScenarioBase(s: CoastFireScenario): ScenarioBase {
  return { id: s.id, name: s.name, isActive: s.is_active };
}

export default function CoastFire() {
  const scenariosQ = useScenarios();
  const activeQ = useActiveScenario();

  const createMut = useCreateScenario();
  const updateMut = useUpdateScenario();
  const activateMut = useActivateScenario();
  const deleteMut = useDeleteScenario();

  const [state, setState] = useState<CoastFireInputState>(defaultCoastFireScenario);
  const baselineRef = useRef<CoastFireInputState>(defaultCoastFireScenario);
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
        setState(defaultCoastFireScenario);
        baselineRef.current = defaultCoastFireScenario;
        loadedActiveIdRef.current = null;
      }
    }
  }, [activeQ.data, activeQ.isFetched]);

  const validation = useMemo(() => {
    return validateCoastFireInputs({
      currentAge: state.current_age,
      retirementAge: state.retirement_age,
      currentSavings: state.current_savings,
      expectedReturnRate: state.expected_return_rate,
      targetRetirementAmount: state.target_retirement_amount,
      monthlyExpenses: state.monthly_expenses,
      yearlyExpenses: state.yearly_expenses,
      withdrawalRate: state.withdrawal_rate,
      inflationRate: state.inflation_rate
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
          <h2 className="text-xl font-semibold">Coast FIRE Calculator</h2>
          <p className="text-sm text-muted-foreground">
            Calculate when you can stop saving for retirement and let compound interest do the work.
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
          <CoastFireForm
            state={state}
            onChange={setState}
            errors={validation.errors}
          />
        </div>
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <CoastFireResults state={state} />
        </div>
      </div>
    </div>
  );
}
