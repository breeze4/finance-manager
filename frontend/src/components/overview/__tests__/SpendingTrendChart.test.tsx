import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { SpendingTrendChart } from "../SpendingTrendChart";
import type { TrendMonth } from "@/api/overview";

describe("SpendingTrendChart", () => {
  it("renders the loading state when loading is true", () => {
    render(<SpendingTrendChart data={[]} loading={true} />);
    expect(screen.getByText(/Loading chart/i)).toBeInTheDocument();
  });

  it("renders the empty state when no data", () => {
    render(<SpendingTrendChart data={[]} loading={false} />);
    expect(screen.getByText(/No data for this range/i)).toBeInTheDocument();
  });

  it("renders without crashing when given a small dataset", () => {
    const data: TrendMonth[] = [
      { month: "2025-04", actual: 1200, expected: 1500 },
      { month: "2025-05", actual: 1300, expected: 1500 },
      { month: "2025-06", actual: 1100, expected: 1500 },
    ];
    // Recharts renders into an SVG inside a ResponsiveContainer; the
    // container takes width from layout, which jsdom doesn't compute.
    // We just assert the component mounts without error and the empty/
    // loading branches don't trigger.
    const { container } = render(<SpendingTrendChart data={data} loading={false} />);
    expect(screen.queryByText(/Loading chart/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No data for this range/i)).not.toBeInTheDocument();
    // ResponsiveContainer always renders a wrapper div.
    expect(container.querySelector(".recharts-responsive-container")).not.toBeNull();
  });
});
