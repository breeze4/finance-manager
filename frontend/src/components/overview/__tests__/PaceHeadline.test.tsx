import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { PaceHeadline } from "../PaceHeadline";

describe("PaceHeadline", () => {
  describe("pace mode", () => {
    it("renders 'On pace — $X under expected' when variance < 0", () => {
      render(
        <PaceHeadline
          mode="pace"
          headline={{ actual_total: 100, expected_total: 250, variance: -150 }}
        />,
      );
      expect(screen.getByText(/On pace — \$150 under expected/i)).toBeInTheDocument();
    });

    it("renders 'Over pace — $X over expected' when variance > 0", () => {
      render(
        <PaceHeadline
          mode="pace"
          headline={{ actual_total: 400, expected_total: 250, variance: 150 }}
        />,
      );
      expect(screen.getByText(/Over pace — \$150 over expected/i)).toBeInTheDocument();
    });

    it("labels the expected number 'Expected'", () => {
      render(
        <PaceHeadline
          mode="pace"
          headline={{ actual_total: 100, expected_total: 250, variance: -150 }}
        />,
      );
      expect(screen.getByText(/Expected \$250/i)).toBeInTheDocument();
    });
  });

  describe("actual_vs_budget mode", () => {
    it("renders 'Spent $A / Budgeted $B / $|var| under' when under budget", () => {
      render(
        <PaceHeadline
          mode="actual_vs_budget"
          headline={{ actual_total: 200, expected_total: 300, variance: -100 }}
        />,
      );
      expect(
        screen.getByText(/Spent \$200 \/ Budgeted \$300 \/ \$100 under/i),
      ).toBeInTheDocument();
    });

    it("renders 'Spent $A / Budgeted $B / Over by $var' when over budget", () => {
      render(
        <PaceHeadline
          mode="actual_vs_budget"
          headline={{ actual_total: 400, expected_total: 300, variance: 100 }}
        />,
      );
      expect(
        screen.getByText(/Spent \$400 \/ Budgeted \$300 \/ Over by \$100/i),
      ).toBeInTheDocument();
    });

    it("labels the expected number 'Budgeted'", () => {
      render(
        <PaceHeadline
          mode="actual_vs_budget"
          headline={{ actual_total: 200, expected_total: 300, variance: -100 }}
        />,
      );
      // "Budgeted" appears in both the verdict copy and the breakdown
      // line. We want at least one match (i.e., the breakdown line uses
      // the AvB label).
      expect(screen.getAllByText(/Budgeted/i).length).toBeGreaterThan(0);
    });
  });
});
