import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { BucketCard } from "../BucketCard";
import type { BucketPaceRollup } from "@/api/overview";

const baseBucket: BucketPaceRollup = {
  bucket: "fixed",
  actual: 200,
  expected: 250,
  budget: 1000,
  categories: [],
};

describe("BucketCard", () => {
  it("renders the pace status label in pace mode", () => {
    render(
      <BucketCard bucket={baseBucket} expanded={false} onToggle={vi.fn()} mode="pace" />,
    );
    // Variance is favorable here; expect "on pace" label.
    expect(screen.getByText(/on pace/i)).toBeInTheDocument();
    // The pace-mode header label is "expected".
    expect(screen.getByText(/expected \$250\.00/i)).toBeInTheDocument();
  });

  it("renders 'within budget' / 'budget' labels in actual_vs_budget mode", () => {
    render(
      <BucketCard
        bucket={baseBucket}
        expanded={false}
        onToggle={vi.fn()}
        mode="actual_vs_budget"
      />,
    );
    expect(screen.getByText(/within budget/i)).toBeInTheDocument();
    // AvB-mode header label is "budget".
    expect(screen.getByText(/^budget \$1,000\.00$/i)).toBeInTheDocument();
  });

  it("renders 'over budget' when actual > budget in AvB mode", () => {
    const overBucket: BucketPaceRollup = {
      ...baseBucket,
      actual: 1500,
      budget: 1000,
    };
    render(
      <BucketCard
        bucket={overBucket}
        expanded={false}
        onToggle={vi.fn()}
        mode="actual_vs_budget"
      />,
    );
    expect(screen.getByText(/over budget/i)).toBeInTheDocument();
  });

  it("renders the empty-state for a zero-budget zero-categories bucket", () => {
    const empty: BucketPaceRollup = {
      bucket: "savings",
      actual: 0,
      expected: 0,
      budget: 0,
      categories: [],
    };
    render(
      <BucketCard bucket={empty} expanded={false} onToggle={vi.fn()} mode="pace" />,
    );
    expect(screen.getByText("$0 budgeted")).toBeInTheDocument();
  });
});
