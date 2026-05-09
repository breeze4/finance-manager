import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import {
  MonthSelector,
  type MonthAnnotation,
} from "../MonthSelector";
import { currentMonthKey } from "../date-helpers";

const months = [
  "2026-01",
  "2026-02",
  "2026-03",
  "2026-04",
  "2026-05",
  "2026-06",
  "2026-07",
  "2026-08",
  "2026-09",
  "2026-10",
  "2026-11",
  "2026-12",
];

describe("MonthSelector", () => {
  it("renders all months as buttons", () => {
    render(
      <MonthSelector months={months} selected="2026-03" onChange={() => {}} />,
    );
    for (const label of [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("marks the selected button with the active variant class", () => {
    render(
      <MonthSelector months={months} selected="2026-03" onChange={() => {}} />,
    );
    const marButton = screen.getByText("Mar").closest("button");
    const aprButton = screen.getByText("Apr").closest("button");
    expect(marButton).not.toBeNull();
    expect(aprButton).not.toBeNull();
    // Active variant uses bg-primary; outline uses border-input.
    expect(marButton?.className).toContain("bg-primary");
    expect(aprButton?.className).toContain("border-input");
  });

  it("calls onChange when a month button is clicked", () => {
    const onChange = vi.fn();
    render(
      <MonthSelector months={months} selected="2026-03" onChange={onChange} />,
    );
    fireEvent.click(screen.getByText("Jul"));
    expect(onChange).toHaveBeenCalledWith("2026-07");
  });

  it("renders pct + delta annotations only on annotated months", () => {
    const annotations: Record<string, MonthAnnotation> = {
      "2026-04": { pct: "92%", delta: "-$120", color: "hsl(45, 90%, 50%)" },
    };
    render(
      <MonthSelector
        months={months}
        selected="2026-03"
        onChange={() => {}}
        annotations={annotations}
      />,
    );
    expect(screen.getByText("92%")).toBeInTheDocument();
    expect(screen.getByText("-$120")).toBeInTheDocument();
    // Other months should not have any pct text
    expect(screen.queryAllByText(/\d+%/)).toHaveLength(1);
  });

  it("lights the green-dot indicator on the current month button", () => {
    const { container } = render(
      <MonthSelector
        months={[currentMonthKey, "2099-12"]}
        selected="2099-12"
        onChange={() => {}}
      />,
    );
    const dots = container.querySelectorAll(".bg-green-400");
    expect(dots.length).toBe(1);
  });

  it("renders an All button when showAll is set", () => {
    const onChange = vi.fn();
    render(
      <MonthSelector
        months={months}
        selected="all"
        onChange={onChange}
        showAll
      />,
    );
    const allBtn = screen.getByText("All");
    expect(allBtn).toBeInTheDocument();
    expect(allBtn.closest("button")?.className).toContain("bg-primary");
    fireEvent.click(allBtn);
    expect(onChange).toHaveBeenCalledWith("all");
  });
});
