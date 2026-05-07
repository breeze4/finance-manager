import { describe, it, expect } from "vitest";
import {
  generateCoastFireProjectionChart,
  generateRequiredSavingsByAgeChart,
  generateMortgageBalanceChart,
  generateInterestComparisonChart,
  generateInvestmentComparisonChart
} from "../charts";
import {
  coastFireProjectionToRecharts,
  requiredSavingsByAgeToRecharts,
  mortgageBalanceToRecharts,
  interestComparisonToRecharts,
  investmentComparisonToRecharts
} from "../charts/rechartsAdapters";

describe("rechartsAdapters", () => {
  describe("coastFireProjectionToRecharts", () => {
    it("translates Chart.js shape to row array with age/value/target", () => {
      const data = generateCoastFireProjectionChart(50000, 30, 65, 0.07, 1000000);
      const rows = coastFireProjectionToRecharts(data);

      expect(rows).toHaveLength(36); // ages 30..65 inclusive
      expect(rows[0]).toEqual({
        age: 30,
        value: 50000,
        target: 1000000
      });
      expect(rows[rows.length - 1].age).toBe(65);
      // last value should be roughly 50000 * 1.07^35 ≈ 533829
      expect(rows[rows.length - 1].value).toBeCloseTo(50000 * Math.pow(1.07, 35), 0);
    });

    it("respects inflation-adjusted target line", () => {
      const data = generateCoastFireProjectionChart(50000, 30, 35, 0.07, 1000000, 0.03, false);
      const rows = coastFireProjectionToRecharts(data);
      expect(rows[0].target).toBe(1000000);
      expect(rows[5].target).toBeCloseTo(1000000 * Math.pow(1.03, 5), 0);
    });
  });

  describe("requiredSavingsByAgeToRecharts", () => {
    it("translates single-series chart to age/requiredSavings rows", () => {
      const data = generateRequiredSavingsByAgeChart(1000000, 65, 0.07);
      const rows = requiredSavingsByAgeToRecharts(data);

      // Default 20..50 step 5 => 7 rows
      expect(rows).toHaveLength(7);
      expect(rows[0].age).toBe(20);
      expect(rows[0].requiredSavings).toBeGreaterThan(0);
      expect(rows[0].requiredSavings).toBeLessThan(rows[rows.length - 1].requiredSavings);
    });
  });

  describe("mortgageBalanceToRecharts", () => {
    it("translates two-series balance chart to month/standard/accelerated", () => {
      const data = generateMortgageBalanceChart(300000, 1520, 200, 4.5 / 100 / 12);
      const rows = mortgageBalanceToRecharts(data);

      expect(rows[0]).toEqual({ month: 0, standard: 300000, accelerated: 300000 });
      // Accelerated should pay down faster
      const mid = rows[Math.floor(rows.length / 2)];
      expect(mid.accelerated).toBeLessThan(mid.standard);
    });

    it("applies lump sum to month-0 accelerated balance", () => {
      const data = generateMortgageBalanceChart(300000, 1520, 0, 4.5 / 100 / 12, 25000);
      const rows = mortgageBalanceToRecharts(data);
      expect(rows[0].standard).toBe(300000);
      expect(rows[0].accelerated).toBe(275000);
    });
  });

  describe("interestComparisonToRecharts", () => {
    it("translates Year-N labels to month numbers in row.month", () => {
      const data = generateInterestComparisonChart(300000, 1520, 200, 4.5 / 100 / 12);
      const rows = interestComparisonToRecharts(data);

      expect(rows[0].month).toBe(0);
      expect(rows[0].standardCumInterest).toBe(0);
      expect(rows[0].acceleratedCumInterest).toBe(0);
      expect(rows[1].month).toBe(12);

      const last = rows[rows.length - 1];
      expect(last.acceleratedCumInterest).toBeLessThanOrEqual(last.standardCumInterest);
    });
  });

  describe("investmentComparisonToRecharts", () => {
    it("returns rows + crossover month", () => {
      // Scenario where investment likely overtakes mortgage equity at some point
      const data = generateInvestmentComparisonChart(300000, 1520, 500, 4.5 / 100 / 12, 10000, 0.07 / 12, 0.2);
      const result = investmentComparisonToRecharts(data);

      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0].month).toBe(0);

      // Each row carries both series
      result.rows.forEach(row => {
        expect(typeof row.mortgageEquity).toBe("number");
        expect(typeof row.investmentValue).toBe("number");
      });

      // crossoverMonth is undefined or a positive month
      if (result.crossoverMonth !== undefined) {
        expect(result.crossoverMonth).toBeGreaterThan(0);
      }
    });

    it("returns undefined crossover when investment never overtakes", () => {
      // Construct a synthetic dataset where investmentValue stays below mortgageEquity
      const fake = {
        labels: ["Start", "Year 1", "Year 2"],
        datasets: [
          {
            label: "Mortgage",
            data: [0, 100, 200],
            borderColor: "#000",
            backgroundColor: "#000"
          },
          {
            label: "Investment",
            data: [0, 50, 80],
            borderColor: "#000",
            backgroundColor: "#000"
          }
        ]
      };
      const result = investmentComparisonToRecharts(fake);
      expect(result.crossoverMonth).toBeUndefined();
    });

    it("detects crossover at the first month where investment overtakes mortgage", () => {
      const fake = {
        labels: ["Start", "Year 1", "Year 2", "Year 3"],
        datasets: [
          {
            label: "Mortgage",
            data: [0, 100, 200, 300],
            borderColor: "#000",
            backgroundColor: "#000"
          },
          {
            label: "Investment",
            data: [0, 50, 250, 600],
            borderColor: "#000",
            backgroundColor: "#000"
          }
        ]
      };
      const result = investmentComparisonToRecharts(fake);
      // Year 2 = month 24 is where investment first overtakes
      expect(result.crossoverMonth).toBe(24);
    });
  });
});
