import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { BucketDashboardCard } from "../BucketDashboardCard";
import type { BucketRollup } from "@/api/csp";

function makeBucket(overrides: Partial<BucketRollup> = {}): BucketRollup {
  return {
    bucket: "fixed",
    numerator: 2500,
    denominator: 5000,
    percentage: 50.0,
    ramit_min: 50,
    ramit_max: 60,
    status: "in-range",
    is_open_ended_over: false,
    planned_percentage: null,
    tracking_status: null,
    ...overrides,
  };
}

describe("BucketDashboardCard", () => {
  it("shows the under (yellow) badge when status is under", () => {
    render(
      <BucketDashboardCard
        b={makeBucket({ status: "under", percentage: 30 })}
      />,
    );
    const badge = screen.getByText("under");
    expect(badge).toBeInTheDocument();
    // The badge wrapper carries the yellow border color.
    expect(badge.closest("[class*='border-yellow-500']")).not.toBeNull();
  });

  it("shows over (destructive) when status is over and not open-ended", () => {
    render(
      <BucketDashboardCard
        b={makeBucket({
          status: "over",
          is_open_ended_over: false,
          percentage: 80,
        })}
      />,
    );
    const badge = screen.getByText("over");
    expect(badge).toBeInTheDocument();
    expect(badge.closest("[class*='border-destructive']")).not.toBeNull();
  });

  it("shows over (ok) success when is_open_ended_over is true", () => {
    render(
      <BucketDashboardCard
        b={makeBucket({
          bucket: "investments",
          status: "over",
          is_open_ended_over: true,
          ramit_min: 10,
          ramit_max: null,
          percentage: 25,
        })}
      />,
    );
    const badge = screen.getByText("over (ok)");
    expect(badge).toBeInTheDocument();
    expect(badge.closest("[class*='border-success']")).not.toBeNull();
  });

  it("renders the bucketRangeLabel text in the header", () => {
    render(
      <BucketDashboardCard b={makeBucket({ ramit_min: 50, ramit_max: 60 })} />,
    );
    expect(screen.getByText("Range: 50–60%")).toBeInTheDocument();
  });

  it("renders the open-ended range label when ramit_max is null", () => {
    render(
      <BucketDashboardCard
        b={makeBucket({
          bucket: "investments",
          ramit_min: 10,
          ramit_max: null,
        })}
      />,
    );
    expect(screen.getByText("Range: ≥10%")).toBeInTheDocument();
  });

  it("renders the percentage and the formatted-currency numerator", () => {
    render(
      <BucketDashboardCard
        b={makeBucket({ percentage: 52.7, numerator: 2635 })}
      />,
    );
    expect(screen.getByText("52.7%")).toBeInTheDocument();
    expect(screen.getByText("$2,635")).toBeInTheDocument();
  });
});
