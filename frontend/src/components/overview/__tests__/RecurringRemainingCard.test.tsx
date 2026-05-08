import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { RecurringRemainingCard } from "../RecurringRemainingCard";

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("RecurringRemainingCard", () => {
  it("renders the loading state when loading is true", () => {
    renderWithRouter(<RecurringRemainingCard total={0} count={0} loading={true} />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  it("renders the empty-state copy when total is 0", () => {
    renderWithRouter(<RecurringRemainingCard total={0} count={0} loading={false} />);
    expect(
      screen.getByText(/No recurring charges expected this month/i),
    ).toBeInTheDocument();
    // Empty-state has no link.
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders the formatted total, count, and link when total > 0", () => {
    renderWithRouter(<RecurringRemainingCard total={94.5} count={3} loading={false} />);
    expect(screen.getByText("$94.50")).toBeInTheDocument();
    expect(screen.getByText(/3 subscriptions/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /view all/i });
    expect(link).toHaveAttribute("href", "/subscriptions");
  });

  it("uses singular 'subscription' when count is 1", () => {
    renderWithRouter(<RecurringRemainingCard total={15.99} count={1} loading={false} />);
    expect(screen.getByText(/1 subscription\b/)).toBeInTheDocument();
  });
});
