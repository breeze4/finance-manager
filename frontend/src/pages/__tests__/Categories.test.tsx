import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import Categories from "../Categories";
import { API_BASE } from "@/api/_client";

interface Cat {
  id: number;
  name: string;
  is_system: boolean;
  exclude_from_budget: boolean;
  csp_bucket: "fixed" | "investments" | "savings" | "guilt_free" | null;
  is_pre_tax: boolean;
  transaction_count: number;
}

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
        <Categories />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Categories page", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("renders the categories table with names, type badge, and counts", async () => {
    const cats: Cat[] = [
      {
        id: 1,
        name: "Groceries",
        is_system: true,
        exclude_from_budget: false,
        csp_bucket: "fixed",
        is_pre_tax: false,
        transaction_count: 12
      },
      {
        id: 2,
        name: "Mortgage Payoff",
        is_system: false,
        exclude_from_budget: true,
        csp_bucket: null,
        is_pre_tax: false,
        transaction_count: 0
      }
    ];
    fetchSpy.mockImplementation(async () => jsonResponse(200, cats));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Groceries")).toBeInTheDocument();
    });
    expect(screen.getByText("Mortgage Payoff")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();

    // Both type-badges present (one system, one custom)
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });

  it("creates a new category with the exclude flag set", async () => {
    const user = userEvent.setup();
    let posted: { url: string; body: unknown } | null = null;
    let listCalls = 0;

    fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (init?.method === "POST" && url.endsWith(`${API_BASE}/categories`)) {
        posted = { url, body: JSON.parse((init.body as string) ?? "{}") };
        return jsonResponse(201, {
          id: 42,
          name: "Mortgage Payoff",
          is_system: false,
          exclude_from_budget: true,
          csp_bucket: null,
          is_pre_tax: false,
          transaction_count: 0
        });
      }
      // GET
      listCalls += 1;
      const after: Cat[] =
        listCalls > 1
          ? [
              {
                id: 42,
                name: "Mortgage Payoff",
                is_system: false,
                exclude_from_budget: true,
                csp_bucket: null,
                is_pre_tax: false,
                transaction_count: 0
              }
            ]
          : [];
      return jsonResponse(200, after);
    });

    renderPage();

    await user.click(await screen.findByRole("button", { name: /new category/i }));
    await user.type(screen.getByLabelText("Name"), "Mortgage Payoff");
    await user.click(screen.getByLabelText("Exclude from budget"));
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(posted).not.toBeNull();
    });
    expect(posted!.body).toEqual({
      name: "Mortgage Payoff",
      exclude_from_budget: true,
      csp_bucket: null,
      is_pre_tax: false
    });
  });

  it("toggles exclude_from_budget inline via PATCH", async () => {
    const user = userEvent.setup();
    let patched: { url: string; body: unknown } | null = null;

    fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (init?.method === "PATCH") {
        patched = { url, body: JSON.parse((init.body as string) ?? "{}") };
        return jsonResponse(200, {
          id: 1,
          name: "Investments",
          is_system: true,
          exclude_from_budget: true,
          csp_bucket: "investments",
          is_pre_tax: false,
          transaction_count: 5
        });
      }
      return jsonResponse(200, [
        {
          id: 1,
          name: "Investments",
          is_system: true,
          exclude_from_budget: false,
          csp_bucket: "investments",
          is_pre_tax: false,
          transaction_count: 5
        }
      ]);
    });

    renderPage();

    const toggle = await screen.findByLabelText("Exclude Investments from budget");
    await user.click(toggle);

    await waitFor(() => {
      expect(patched).not.toBeNull();
    });
    expect(patched!.url).toContain(`${API_BASE}/categories/1`);
    expect(patched!.body).toEqual({ exclude_from_budget: true });
  });

  it("toggles is_pre_tax inline via PATCH", async () => {
    const user = userEvent.setup();
    let patched: { url: string; body: unknown } | null = null;

    fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (init?.method === "PATCH") {
        patched = { url, body: JSON.parse((init.body as string) ?? "{}") };
        return jsonResponse(200, {
          id: 7,
          name: "401k",
          is_system: false,
          exclude_from_budget: false,
          csp_bucket: "investments",
          is_pre_tax: true,
          transaction_count: 0
        });
      }
      return jsonResponse(200, [
        {
          id: 7,
          name: "401k",
          is_system: false,
          exclude_from_budget: false,
          csp_bucket: "investments",
          is_pre_tax: false,
          transaction_count: 0
        }
      ]);
    });

    renderPage();

    const toggle = await screen.findByLabelText("Mark 401k as pre-tax");
    await user.click(toggle);

    await waitFor(() => {
      expect(patched).not.toBeNull();
    });
    expect(patched!.url).toContain(`${API_BASE}/categories/7`);
    expect(patched!.body).toEqual({ is_pre_tax: true });
  });

  it("disables Delete on categories with transactions", async () => {
    fetchSpy.mockImplementation(async () =>
      jsonResponse(200, [
        {
          id: 1,
          name: "Groceries",
          is_system: true,
          exclude_from_budget: false,
          csp_bucket: "fixed",
          is_pre_tax: false,
          transaction_count: 12
        }
      ] as Cat[])
    );

    renderPage();

    const deleteBtn = await screen.findByRole("button", { name: /delete/i });
    expect(deleteBtn).toBeDisabled();
  });
});
