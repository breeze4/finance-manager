import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScenarioPicker } from "../ScenarioPicker";

interface Scenario {
  id: number;
  name: string;
  isActive: boolean;
}

function setup(overrides: Partial<{ scenarios: Scenario[]; activeId: number | null; isDirty: boolean }> = {}) {
  const onSelect = vi.fn();
  const onCreate = vi.fn();
  const onRename = vi.fn();
  const onDuplicate = vi.fn();
  const onDelete = vi.fn();

  const scenarios = overrides.scenarios ?? [
    { id: 1, name: "Baseline", isActive: true },
    { id: 2, name: "Aggressive", isActive: false }
  ];
  const activeId = overrides.activeId ?? 1;

  render(
    <ScenarioPicker<Scenario>
      scenarios={scenarios}
      activeId={activeId}
      isDirty={overrides.isDirty}
      onSelect={onSelect}
      onCreate={onCreate}
      onRename={onRename}
      onDuplicate={onDuplicate}
      onDelete={onDelete}
    />
  );

  return { onSelect, onCreate, onRename, onDuplicate, onDelete };
}

describe("ScenarioPicker", () => {
  it("shows the active scenario name on the trigger", () => {
    setup();
    expect(screen.getByRole("button", { name: /Baseline/ })).toBeInTheDocument();
  });

  it("shows 'Select scenario' when no active scenario", () => {
    setup({ activeId: null, scenarios: [] });
    expect(screen.getByRole("button", { name: /Select scenario/ })).toBeInTheDocument();
  });

  it("renders all scenarios on open and fires onSelect", async () => {
    const user = userEvent.setup();
    const { onSelect } = setup();

    await user.click(screen.getByRole("button", { name: /Baseline/ }));
    await waitFor(() => {
      expect(screen.getByText("Aggressive")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Aggressive"));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("opens create dialog and fires onCreate", async () => {
    const user = userEvent.setup();
    const { onCreate } = setup();

    await user.click(screen.getByRole("button", { name: /Baseline/ }));
    await waitFor(() => screen.getByText(/New scenario/));
    await user.click(screen.getByText(/New scenario/));

    await waitFor(() => screen.getByRole("dialog"));
    const input = screen.getByPlaceholderText("Scenario name");
    await user.type(input, "Conservative");
    await user.click(screen.getByRole("button", { name: /Create/ }));

    expect(onCreate).toHaveBeenCalledWith("Conservative");
  });

  it("opens rename dialog from row menu and fires onRename", async () => {
    const user = userEvent.setup();
    const { onRename } = setup();

    await user.click(screen.getByRole("button", { name: /Baseline/ }));
    await waitFor(() => screen.getByText("Aggressive"));

    const aggressiveActions = screen.getByRole("button", { name: /Scenario actions for Aggressive/ });
    await user.click(aggressiveActions);

    await waitFor(() => screen.getByText("Rename"));
    await user.click(screen.getByText("Rename"));

    await waitFor(() => screen.getByRole("dialog"));
    const input = screen.getByPlaceholderText("Scenario name");
    await user.clear(input);
    await user.type(input, "Renamed");
    await user.click(screen.getByRole("button", { name: /Save/ }));

    expect(onRename).toHaveBeenCalledWith(2, "Renamed");
  });

  it("fires onDuplicate from row menu", async () => {
    const user = userEvent.setup();
    const { onDuplicate } = setup();

    await user.click(screen.getByRole("button", { name: /Baseline/ }));
    await waitFor(() => screen.getByText("Aggressive"));

    await user.click(screen.getByRole("button", { name: /Scenario actions for Aggressive/ }));
    await waitFor(() => screen.getByText("Duplicate"));
    await user.click(screen.getByText("Duplicate"));

    expect(onDuplicate).toHaveBeenCalledWith(2);
  });

  it("requires confirmation before delete", async () => {
    const user = userEvent.setup();
    const { onDelete } = setup();

    await user.click(screen.getByRole("button", { name: /Baseline/ }));
    await waitFor(() => screen.getByText("Aggressive"));

    await user.click(screen.getByRole("button", { name: /Scenario actions for Aggressive/ }));
    await waitFor(() => screen.getByText("Delete"));
    await user.click(screen.getByText("Delete"));

    // Confirm dialog appears
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Delete scenario\?/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /^Delete$/ }));

    expect(onDelete).toHaveBeenCalledWith(2);
  });

  it("shows dirty-state indicator on the trigger when isDirty", () => {
    setup({ isDirty: true });
    expect(screen.getByLabelText(/Unsaved changes/)).toBeInTheDocument();
  });

  it("does not show dirty indicator when not dirty", () => {
    setup({ isDirty: false });
    expect(screen.queryByLabelText(/Unsaved changes/)).not.toBeInTheDocument();
  });
});
