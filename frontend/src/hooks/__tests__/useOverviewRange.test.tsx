import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

import { useOverviewRange } from "../useOverviewRange";

function makeWrapper(initial: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[initial]}>{children}</MemoryRouter>;
  };
}

describe("useOverviewRange", () => {
  it("defaults to current-mtd on a bare URL", () => {
    const { result } = renderHook(() => useOverviewRange(), {
      wrapper: makeWrapper("/"),
    });
    expect(result.current.range.preset).toBe("current-mtd");
    // date_from is the first of the current month; date_to is today.
    const today = new Date();
    expect(result.current.range.date_to).toBe(
      `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
        today.getDate(),
      ).padStart(2, "0")}`,
    );
    expect(result.current.range.date_from).toBe(
      `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`,
    );
  });

  it("resolves ?range=ytd to Jan 1 of current year through today", () => {
    const { result } = renderHook(() => useOverviewRange(), {
      wrapper: makeWrapper("/?range=ytd"),
    });
    expect(result.current.range.preset).toBe("ytd");
    const today = new Date();
    expect(result.current.range.date_from).toBe(`${today.getFullYear()}-01-01`);
  });

  it("resolves ?range=last-year to Jan 1 → Dec 31 of prior year", () => {
    const { result } = renderHook(() => useOverviewRange(), {
      wrapper: makeWrapper("/?range=last-year"),
    });
    expect(result.current.range.preset).toBe("last-year");
    const today = new Date();
    const prior = today.getFullYear() - 1;
    expect(result.current.range.date_from).toBe(`${prior}-01-01`);
    expect(result.current.range.date_to).toBe(`${prior}-12-31`);
  });

  it("resolves ?from=… &to=… to a custom range", () => {
    const { result } = renderHook(() => useOverviewRange(), {
      wrapper: makeWrapper("/?from=2024-01-01&to=2024-06-30"),
    });
    expect(result.current.range.preset).toBe("custom");
    expect(result.current.range.date_from).toBe("2024-01-01");
    expect(result.current.range.date_to).toBe("2024-06-30");
  });

  it("setRange writes ?range=<key> for preset changes", () => {
    function Probe() {
      const { range, setRange } = useOverviewRange();
      const loc = useLocation();
      return (
        <div>
          <div data-testid="search">{loc.search}</div>
          <div data-testid="preset">{range.preset}</div>
          <button onClick={() => setRange("ytd")}>set-ytd</button>
        </div>
      );
    }

    const { result } = renderHook(
      () => {
        const { range, setRange } = useOverviewRange();
        const loc = useLocation();
        return { range, setRange, search: loc.search };
      },
      { wrapper: makeWrapper("/") },
    );

    expect(result.current.range.preset).toBe("current-mtd");
    act(() => {
      result.current.setRange("ytd");
    });
    expect(result.current.search).toBe("?range=ytd");
    expect(result.current.range.preset).toBe("ytd");
    // Avoid unused variable warning for the Probe component used only
    // for narrative documentation in this test.
    void Probe;
  });

  it("setRange('custom', {from,to}) writes ?from=…&to=… and removes range", () => {
    const { result } = renderHook(
      () => {
        const { range, setRange } = useOverviewRange();
        const loc = useLocation();
        return { range, setRange, search: loc.search };
      },
      { wrapper: makeWrapper("/?range=ytd") },
    );

    expect(result.current.range.preset).toBe("ytd");
    act(() => {
      result.current.setRange("custom", {
        date_from: "2024-01-01",
        date_to: "2024-06-30",
      });
    });
    expect(result.current.search).toContain("from=2024-01-01");
    expect(result.current.search).toContain("to=2024-06-30");
    expect(result.current.search).not.toContain("range=");
    expect(result.current.range.preset).toBe("custom");
    expect(result.current.range.date_from).toBe("2024-01-01");
    expect(result.current.range.date_to).toBe("2024-06-30");
  });
});
