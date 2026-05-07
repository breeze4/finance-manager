import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import Mortgage from "../Mortgage";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false }
    }
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Mortgage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Mortgage page", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("renders seeded defaults on first run (404 on /active)", async () => {
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/scenarios")) {
        return jsonResponse(200, []);
      }
      if (url.endsWith("/active")) {
        return jsonResponse(404, { detail: "No active scenario" });
      }
      return jsonResponse(404, {});
    });

    renderPage();

    await waitFor(() => {
      const principalInput = screen.getByLabelText(
        "Current Principal Balance"
      ) as HTMLInputElement;
      expect(principalInput.value).toBe("300000");
    });

    expect(
      (screen.getByLabelText("Years Remaining") as HTMLInputElement).value
    ).toBe("25");
    expect(
      (screen.getByLabelText("Interest Rate (%)") as HTMLInputElement).value
    ).toBe("4.5");
    expect(
      (screen.getByLabelText("Monthly P&I Payment") as HTMLInputElement).value
    ).toBe("1500");
    expect(
      (screen.getByLabelText("Expected Annual Return (%)") as HTMLInputElement).value
    ).toBe("7");
    expect(
      (screen.getByLabelText("Capital Gains Tax Rate (%)") as HTMLInputElement).value
    ).toBe("20");

    // Save CTA exposed for first-run.
    expect(
      screen.getByRole("button", { name: /save as scenario/i })
    ).toBeInTheDocument();
  });

  it("seeds inputs from the active scenario when present", async () => {
    const active = {
      id: 5,
      name: "Aggressive payoff",
      is_active: true,
      principal: 250000,
      years_left: 20,
      interest_rate: 5.5,
      monthly_payment: 1800,
      additional_monthly_payment: 200,
      lump_sum_payment: 5000,
      investment_return_rate: 8,
      investment_tax_rate: 25,
      created_at: "2026-05-07T00:00:00",
      updated_at: "2026-05-07T00:00:00"
    };

    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/scenarios")) {
        return jsonResponse(200, [active]);
      }
      if (url.endsWith("/active")) {
        return jsonResponse(200, active);
      }
      return jsonResponse(404, {});
    });

    renderPage();

    await waitFor(() => {
      expect(
        (screen.getByLabelText("Current Principal Balance") as HTMLInputElement).value
      ).toBe("250000");
    });
    expect(
      (screen.getByLabelText("Years Remaining") as HTMLInputElement).value
    ).toBe("20");
    expect(
      (screen.getByLabelText("Extra Monthly Payment") as HTMLInputElement).value
    ).toBe("200");

    // Loaded scenario → "Saved" CTA disabled until dirty.
    const saveBtn = screen.getByRole("button", { name: /saved/i });
    expect(saveBtn).toBeDisabled();
  });

  it("renders all ten result tiles plus the recommendation", async () => {
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/scenarios")) return jsonResponse(200, []);
      if (url.endsWith("/active")) return jsonResponse(404, {});
      return jsonResponse(404, {});
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Monthly Interest Rate:")).toBeInTheDocument();
    });

    // Verify each labeled tile is on the page (10 distinct labels).
    expect(screen.getAllByText("Time to Payoff:")).toHaveLength(2); // base + accelerated
    expect(screen.getAllByText("Total Interest:")).toHaveLength(2);
    expect(screen.getByText("Time Saved:")).toBeInTheDocument();
    expect(screen.getByText("Interest Saved:")).toBeInTheDocument();
    expect(screen.getByText("Monthly Contributions:")).toBeInTheDocument();
    expect(screen.getByText("Lump Sum Contributions:")).toBeInTheDocument();
    expect(screen.getByText("Total All Contributions:")).toBeInTheDocument();
    expect(screen.getByText("Investment Value:")).toBeInTheDocument();
    expect(screen.getByText("Investment Profit:")).toBeInTheDocument();
    expect(screen.getByText("Taxes Owed:")).toBeInTheDocument();
    expect(screen.getByText("Net Investment Return:")).toBeInTheDocument();
    expect(screen.getByText("Investment Net Benefit:")).toBeInTheDocument();
    expect(screen.getByText("Recommendation")).toBeInTheDocument();
  });
});
