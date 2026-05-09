import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { ActualsBucketCard } from "../ActualsBucketCard";
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
    planned_percentage: 50,
    tracking_status: "on-track",
    ...overrides,
  };
}

describe("ActualsBucketCard", () => {
  it("renders +X.X pts when actual exceeds planned", () => {
    render(
      <ActualsBucketCard
        b={makeBucket({
          percentage: 55.3,
          planned_percentage: 50,
          tracking_status: "over-plan",
        })}
      />,
    );
    expect(screen.getByText("+5.3 pts")).toBeInTheDocument();
  });

  it("renders the negative delta unsigned (no leading +) when actual is below planned", () => {
    render(
      <ActualsBucketCard
        b={makeBucket({
          percentage: 47.0,
          planned_percentage: 50,
          tracking_status: "under-plan",
        })}
      />,
    );
    expect(screen.getByText("-3.0 pts")).toBeInTheDocument();
    expect(screen.queryByText("+-3.0 pts")).toBeNull();
  });

  it("shows the on-track tracking badge", () => {
    render(
      <ActualsBucketCard
        b={makeBucket({ tracking_status: "on-track" })}
      />,
    );
    expect(screen.getByText("on track")).toBeInTheDocument();
  });

  it("shows the over-plan tracking badge", () => {
    render(
      <ActualsBucketCard
        b={makeBucket({ tracking_status: "over-plan", percentage: 60 })}
      />,
    );
    expect(screen.getByText("over plan")).toBeInTheDocument();
  });

  it("shows the under-plan tracking badge", () => {
    render(
      <ActualsBucketCard
        b={makeBucket({ tracking_status: "under-plan", percentage: 40 })}
      />,
    );
    expect(screen.getByText("under plan")).toBeInTheDocument();
  });

  it("renders the 'target X.X% · actual Y.Y%' line in the header", () => {
    render(
      <ActualsBucketCard
        b={makeBucket({ percentage: 47.5, planned_percentage: 50.0 })}
      />,
    );
    expect(
      screen.getByText("target 50.0% · actual 47.5%"),
    ).toBeInTheDocument();
  });
});
