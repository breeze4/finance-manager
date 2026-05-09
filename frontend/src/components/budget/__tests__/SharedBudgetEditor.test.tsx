import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { SharedBudgetEditor } from "../SharedBudgetEditor";

const baseProps = {
  categoryId: 1,
  year: 2024,
  categoryName: "Groceries",
  initialMonthlyAmount: 500,
  initialRolloverMode: false,
  monthlyOverrides: [
    { month: 3, amount: 700 },
    { month: 7, amount: 600 },
  ],
  onSave: vi.fn(),
  onCancel: vi.fn(),
};

describe("SharedBudgetEditor", () => {
  it("renders the category name and year", () => {
    render(<SharedBudgetEditor {...baseProps} />);
    expect(screen.getByText(/Edit budget/)).toBeInTheDocument();
    expect(screen.getByText(/Groceries/)).toBeInTheDocument();
    expect(screen.getByText(/2024/)).toBeInTheDocument();
  });

  it("baseline input is editable in pastYearMode", () => {
    render(<SharedBudgetEditor {...baseProps} pastYearMode />);
    const input = screen.getByLabelText(/Monthly baseline/i, {
      selector: "input",
    }) as HTMLInputElement;
    expect(input).not.toBeDisabled();
    expect(input.value).toBe("500");
    fireEvent.change(input, { target: { value: "555" } });
    expect(input.value).toBe("555");
  });

  it("rollover toggle is disabled in pastYearMode", () => {
    render(<SharedBudgetEditor {...baseProps} pastYearMode />);
    const toggle = screen.getByTestId("rollover-toggle");
    expect(toggle).toBeDisabled();
  });

  it("override inputs are disabled in pastYearMode", () => {
    render(<SharedBudgetEditor {...baseProps} pastYearMode />);
    const marInput = screen.getByLabelText("Override for Mar") as HTMLInputElement;
    const julInput = screen.getByLabelText("Override for Jul") as HTMLInputElement;
    expect(marInput).toBeDisabled();
    expect(julInput).toBeDisabled();
    expect(marInput.value).toBe("700");
    expect(julInput.value).toBe("600");
  });

  it("rollover toggle is enabled when not in pastYearMode", () => {
    render(<SharedBudgetEditor {...baseProps} />);
    const toggle = screen.getByTestId("rollover-toggle");
    expect(toggle).not.toBeDisabled();
  });

  it("calls onSave with the edited baseline and locked rollover in pastYearMode", () => {
    const onSave = vi.fn();
    render(
      <SharedBudgetEditor
        {...baseProps}
        initialRolloverMode={true}
        pastYearMode
        onSave={onSave}
      />,
    );
    const input = screen.getByLabelText(/Monthly baseline/i, {
      selector: "input",
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "555" } });
    fireEvent.click(screen.getByText("Save"));
    // pastYearMode keeps rolloverMode at the initial value (true here).
    expect(onSave).toHaveBeenCalledWith(555, true);
  });

  it("calls onCancel when Cancel is clicked", () => {
    const onCancel = vi.fn();
    render(<SharedBudgetEditor {...baseProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("does not render an overrides section when there are none", () => {
    render(<SharedBudgetEditor {...baseProps} monthlyOverrides={[]} />);
    expect(screen.queryByText("Per-month overrides")).not.toBeInTheDocument();
  });
});
