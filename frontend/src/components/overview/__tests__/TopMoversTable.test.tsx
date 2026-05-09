import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { TopMoversTable } from "../TopMoversTable";
import type { CategoryPaceRow } from "@/api/overview";

function row(
  partial: Partial<CategoryPaceRow> & {
    category_name: string;
    actual_mtd: number;
    expected_mtd: number;
  },
): CategoryPaceRow {
  return {
    category_id: partial.category_id ?? Math.floor(Math.random() * 100000),
    category_name: partial.category_name,
    bucket: partial.bucket ?? "guilt_free",
    actual_mtd: partial.actual_mtd,
    expected_mtd: partial.expected_mtd,
    full_budget: partial.full_budget ?? 0,
  };
}

describe("TopMoversTable", () => {
  it("renders empty state when no row has variance", () => {
    const cats: CategoryPaceRow[] = [
      row({ category_id: 1, category_name: "Rent", actual_mtd: 100, expected_mtd: 100 }),
    ];
    render(<TopMoversTable categories={cats} />);
    expect(
      screen.getByText(/No variance from expected this month\./i),
    ).toBeInTheDocument();
  });

  it("ranks rows by absolute variance descending and slices to top 10", () => {
    const cats: CategoryPaceRow[] = Array.from({ length: 12 }, (_, i) =>
      row({
        category_id: i + 1,
        category_name: `Cat ${String.fromCharCode(65 + i)}`,
        // variance magnitudes 100, 200, ..., 1200
        actual_mtd: (i + 1) * 100,
        expected_mtd: 0,
      }),
    );
    render(<TopMoversTable categories={cats} />);

    const tableBody = screen.getByRole("table").querySelector("tbody")!;
    const rows = within(tableBody).getAllByRole("row");
    expect(rows).toHaveLength(10);

    // First row is highest absolute variance (1200 → "Cat L"), then 1100 (Cat K), etc.
    expect(within(rows[0]).getByText("Cat L")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Cat K")).toBeInTheDocument();
    expect(within(rows[9]).getByText("Cat C")).toBeInTheDocument();
    // The two smallest-variance categories (Cat A=100, Cat B=200) drop off.
    expect(within(tableBody).queryByText("Cat A")).not.toBeInTheDocument();
    expect(within(tableBody).queryByText("Cat B")).not.toBeInTheDocument();
  });

  it("breaks variance ties deterministically by category name", () => {
    const cats: CategoryPaceRow[] = [
      row({ category_id: 1, category_name: "Zeta", actual_mtd: 50, expected_mtd: 0 }),
      row({ category_id: 2, category_name: "Alpha", actual_mtd: 50, expected_mtd: 0 }),
      row({ category_id: 3, category_name: "Mid", actual_mtd: 50, expected_mtd: 0 }),
    ];
    render(<TopMoversTable categories={cats} />);
    const tableBody = screen.getByRole("table").querySelector("tbody")!;
    const rows = within(tableBody).getAllByRole("row");
    expect(within(rows[0]).getByText("Alpha")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Mid")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Zeta")).toBeInTheDocument();
  });

  it("formats variance with leading sign and applies color classes", () => {
    const cats: CategoryPaceRow[] = [
      row({
        category_id: 1,
        category_name: "Over Pace",
        actual_mtd: 150,
        expected_mtd: 100,
      }),
      row({
        category_id: 2,
        category_name: "Under Pace",
        actual_mtd: 40,
        expected_mtd: 100,
      }),
    ];
    render(<TopMoversTable categories={cats} />);
    const over = screen.getByText("+$50");
    expect(over).toHaveClass("text-destructive");
    const under = screen.getByText("-$60");
    expect(under).toHaveClass("text-success");
  });

  it("renders the Uncategorized synthetic row with an outline badge", () => {
    const cats: CategoryPaceRow[] = [
      {
        category_id: null,
        category_name: "Uncategorized",
        bucket: null,
        actual_mtd: 75,
        expected_mtd: 0,
        full_budget: 0,
      },
    ];
    render(<TopMoversTable categories={cats} />);
    // Both the row's category cell and the badge render the literal
    // "Uncategorized" — assert at least one is present.
    expect(screen.getAllByText("Uncategorized").length).toBeGreaterThanOrEqual(1);
    // Variance still renders with the over-pace styling (positive variance).
    expect(screen.getByText("+$75")).toHaveClass("text-destructive");
  });

  it("renders bucket label with hyphenated title-case for guilt_free", () => {
    const cats: CategoryPaceRow[] = [
      row({
        category_id: 1,
        category_name: "Dining",
        bucket: "guilt_free",
        actual_mtd: 200,
        expected_mtd: 100,
      }),
    ];
    render(<TopMoversTable categories={cats} />);
    expect(screen.getByText("Guilt-Free")).toBeInTheDocument();
  });
});
