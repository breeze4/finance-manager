import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { render } from "@testing-library/react";
import { ProjectionLineChart } from "../ProjectionLineChart";
import { ComparisonLineChart } from "../ComparisonLineChart";

// Recharts measures the parent's clientWidth/Height with ResponsiveContainer.
// In jsdom these are 0 by default, so we patch them just for these tests.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, value: 800 });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 800 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, value: 600 });
});

afterAll(() => {
  // No-op: leaving the patched props is fine for jsdom's lifetime.
});

describe("chart wrappers", () => {
  it("ProjectionLineChart renders without crashing", () => {
    const data = [
      { age: 30, value: 50000, target: 1000000 },
      { age: 31, value: 53500, target: 1000000 },
      { age: 32, value: 57245, target: 1000000 }
    ];
    const { container } = render(
      <ProjectionLineChart data={data} xKey="age" valueKey="value" targetKey="target" />
    );
    expect(container.querySelector(".recharts-responsive-container")).toBeTruthy();
  });

  it("ComparisonLineChart renders multiple series", () => {
    const data = [
      { month: 0, standard: 300000, accelerated: 300000 },
      { month: 12, standard: 290000, accelerated: 280000 },
      { month: 24, standard: 280000, accelerated: 260000 }
    ];
    const { container } = render(
      <ComparisonLineChart
        data={data}
        xKey="month"
        series={[
          { key: "standard", label: "Standard", color: "#000" },
          { key: "accelerated", label: "Accelerated", color: "#0a0" }
        ]}
      />
    );
    expect(container.querySelector(".recharts-responsive-container")).toBeTruthy();
  });

  it("ComparisonLineChart accepts crossoverMonth without crashing", () => {
    const data = [
      { month: 0, mortgageEquity: 0, investmentValue: 0 },
      { month: 12, mortgageEquity: 100, investmentValue: 50 },
      { month: 24, mortgageEquity: 200, investmentValue: 250 }
    ];
    const { container } = render(
      <ComparisonLineChart
        data={data}
        xKey="month"
        series={[
          { key: "mortgageEquity", label: "Mortgage", color: "#000" },
          { key: "investmentValue", label: "Investment", color: "#0a0" }
        ]}
        crossoverMonth={24}
        crossoverSeriesKey="investmentValue"
      />
    );
    expect(container.querySelector(".recharts-responsive-container")).toBeTruthy();
  });
});
