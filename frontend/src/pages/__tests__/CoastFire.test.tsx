import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import CoastFire from "../CoastFire";

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
        <CoastFire />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("CoastFire page", () => {
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

    // Wait for queries to settle.
    await waitFor(() => {
      const ageInput = screen.getByLabelText("Current Age") as HTMLInputElement;
      expect(ageInput.value).toBe("30");
    });

    // Other defaults present.
    expect((screen.getByLabelText("Retirement Age") as HTMLInputElement).value).toBe(
      "65"
    );
    expect(
      (screen.getByLabelText("Current Retirement Savings") as HTMLInputElement).value
    ).toBe("50000");
    expect(
      (screen.getByLabelText("Target Retirement Amount") as HTMLInputElement).value
    ).toBe("1000000");

    // Save CTA exposed for first-run.
    expect(screen.getByRole("button", { name: /save as scenario/i })).toBeInTheDocument();
  });

  it("seeds inputs from the active scenario when present", async () => {
    const active = {
      id: 5,
      name: "Aggressive",
      is_active: true,
      current_age: 35,
      retirement_age: 60,
      current_savings: 100000,
      expected_return_rate: 8,
      target_retirement_amount: 2000000,
      monthly_expenses: 5000,
      yearly_expenses: 60000,
      withdrawal_rate: 4,
      inflation_rate: 3,
      use_real_returns: false,
      last_edited_field: "monthly",
      created_at: "2026-05-06T00:00:00",
      updated_at: "2026-05-06T00:00:00"
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
      expect((screen.getByLabelText("Current Age") as HTMLInputElement).value).toBe(
        "35"
      );
    });
    expect(
      (screen.getByLabelText("Current Retirement Savings") as HTMLInputElement).value
    ).toBe("100000");
    expect(
      (screen.getByLabelText("Target Retirement Amount") as HTMLInputElement).value
    ).toBe("2000000");

    // Loaded scenario → "Save changes" CTA (and disabled until dirty).
    const saveBtn = screen.getByRole("button", { name: /saved/i });
    expect(saveBtn).toBeDisabled();
  });

  it("renders all eight result tiles when not Coast FIRE ready", async () => {
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/scenarios")) return jsonResponse(200, []);
      if (url.endsWith("/active")) return jsonResponse(404, {});
      return jsonResponse(404, {});
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Years to Retirement:")).toBeInTheDocument();
    });

    // Coast FIRE Number is always shown.
    expect(
      screen.getByText("Coast FIRE Number at Current Age:")
    ).toBeInTheDocument();
    expect(screen.getByText("Future Value of Current Savings:")).toBeInTheDocument();
    // Target tile label includes "(Today's $)" when not using real returns.
    expect(
      screen.getByText(/Target Retirement Amount \(Today's \$\):/i)
    ).toBeInTheDocument();

    // With defaults, $50k savings won't reach $1M, so the "not ready" tiles
    // should show.
    expect(screen.getByText(/Not Coast FIRE ready yet/i)).toBeInTheDocument();
    expect(screen.getByText("Additional Savings Needed Now:")).toBeInTheDocument();
    expect(screen.getByText("Coast FIRE Age:")).toBeInTheDocument();

    // Monthly Spending Available tile shown when target > 0.
    expect(screen.getByText("Monthly Spending Available:")).toBeInTheDocument();
  });
});
