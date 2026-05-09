import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";

import Budget, { ActualTab, HistoricalTab, SetTab } from "../Budget";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Stub every backend GET the Budget page issues with a safe empty payload.
 * The page must render the sub-nav even when no data exists. Wire shapes
 * match the snake_case backend contract — see api/budget.ts and api/csp.ts. */
function stubAllFetches() {
  const planningRollup = {
    month: "2026-05",
    mode: "planning",
    month_yyyymm: 202605,
    denominator: 0,
    take_home: 0,
    pre_tax_total: 0,
    has_net_income: false,
    buckets: [],
    unbucketed_categories: [],
  };
  const actualsRollup = { ...planningRollup, mode: "actuals" };

  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input.toString();

    // /api/budget?year=YYYY  → empty array (becomes empty BudgetState)
    if (/\/api\/budget\?year=/.test(url)) {
      return jsonResponse(200, []);
    }
    // /api/budget/historical → empty stats array
    if (url.includes("/api/budget/historical")) {
      return jsonResponse(200, []);
    }
    // /api/budget/actual/{year} → empty actuals (snake_case wire)
    if (/\/api\/budget\/actual\/\d+/.test(url)) {
      return jsonResponse(200, { entries: [], monthly_rollups: [] });
    }
    // /api/categories → empty array
    if (url.endsWith("/api/categories")) {
      return jsonResponse(200, []);
    }
    // /api/csp/rollup?…&mode=planning → minimal planning rollup
    if (url.includes("/api/csp/rollup") && url.includes("mode=planning")) {
      return jsonResponse(200, planningRollup);
    }
    // /api/csp/rollup?…&mode=actuals → minimal actuals rollup
    if (url.includes("/api/csp/rollup") && url.includes("mode=actuals")) {
      return jsonResponse(200, actualsRollup);
    }
    // /api/net-income?month=YYYY-MM → no period set
    if (url.includes("/api/net-income?month=")) {
      return jsonResponse(200, {
        month: "2026-05",
        amount: null,
        from_period: null,
      });
    }
    // /api/net-income/history → no history
    if (url.includes("/api/net-income/history")) {
      return jsonResponse(200, []);
    }
    // /api/paycheck-detection/suggest → no suggestion
    if (url.includes("/api/paycheck-detection/suggest")) {
      return jsonResponse(200, { suggested_monthly_net: null });
    }

    // Fallback for anything unexpected — fail loudly so missing stubs surface.
    throw new Error(`Unstubbed fetch in Budget routing test: ${url}`);
  });
}

function renderAt(initialPath: string) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/" element={<Navigate to="/budget" replace />} />
          <Route path="/budget" element={<Budget />}>
            <Route index element={<Navigate to="actual" replace />} />
            <Route path="historical" element={<HistoricalTab />} />
            <Route path="set" element={<SetTab />} />
            <Route path="actual" element={<ActualTab />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Budget page routing", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = stubAllFetches();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("redirects /budget to /budget/actual (default view)", async () => {
    renderAt("/budget");
    // Sub-nav renders once data is loaded.
    await waitFor(() => {
      expect(screen.getByRole("navigation", { name: /budget sub-navigation/i }))
        .toBeInTheDocument();
    });
    // Empty actuals view shows the no-budgets prompt for that tab.
    expect(
      await screen.findByText(/Set up budgets first to see actual vs target/i),
    ).toBeInTheDocument();
  });

  it("renders the historical tab content when navigating to /budget/historical", async () => {
    renderAt("/budget/historical");
    expect(
      await screen.findByText(/No historical spending yet/i),
    ).toBeInTheDocument();
  });

  it("renders the set-budget tab content when navigating to /budget/set", async () => {
    renderAt("/budget/set");
    expect(
      await screen.findByText(/No budgets set yet/i),
    ).toBeInTheDocument();
  });

  it("renders the actual-vs-budget tab content when navigating to /budget/actual", async () => {
    renderAt("/budget/actual");
    expect(
      await screen.findByText(/Set up budgets first to see actual vs target/i),
    ).toBeInTheDocument();
  });

  it("marks the active sub-nav link based on the current route", async () => {
    renderAt("/budget/set");
    const setLink = await screen.findByRole("link", { name: /set budget/i });
    const historicalLink = screen.getByRole("link", { name: /^historical$/i });
    // Active link gets the active background class; inactive doesn't.
    await waitFor(() => {
      expect(setLink.className).toMatch(/bg-background/);
    });
    expect(historicalLink.className).not.toMatch(/bg-background/);
  });

  it("navigates between sub-tabs by clicking the sub-nav links", async () => {
    const user = userEvent.setup();
    renderAt("/budget/actual");

    expect(
      await screen.findByText(/Set up budgets first to see actual vs target/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: /^historical$/i }));
    expect(
      await screen.findByText(/No historical spending yet/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: /set budget/i }));
    expect(
      await screen.findByText(/No budgets set yet/i),
    ).toBeInTheDocument();
  });
});
