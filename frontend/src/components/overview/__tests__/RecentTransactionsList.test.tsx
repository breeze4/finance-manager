import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { RecentTransactionsList } from "../RecentTransactionsList";

interface RawTxn {
  id: number;
  source_file: string;
  account_id: number;
  account_name: string;
  date: string;
  post_date: string | null;
  raw_description: string;
  vendor: string;
  amount: number;
  source_category: string | null;
  category_id: number | null;
  category_name: string | null;
  type: string | null;
  is_verified: boolean;
  is_transfer: boolean;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeRawTxn(overrides: Partial<RawTxn> & { id: number; vendor: string; amount: number }): RawTxn {
  return {
    id: overrides.id,
    source_file: "test.csv",
    account_id: 1,
    account_name: "Checking",
    date: overrides.date ?? "2026-05-08",
    post_date: null,
    raw_description: "raw",
    vendor: overrides.vendor,
    amount: overrides.amount,
    source_category: null,
    category_id: overrides.category_id ?? null,
    category_name: overrides.category_name ?? null,
    type: null,
    is_verified: false,
    is_transfer: false,
    memo: null,
    created_at: "2026-05-08T00:00:00",
    updated_at: "2026-05-08T00:00:00",
    ...overrides,
  };
}

function renderList() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <RecentTransactionsList />
    </QueryClientProvider>,
  );
}

describe("RecentTransactionsList", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("calls listTransactions with the documented Step-2 params", async () => {
    let calledUrl: string | null = null;
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      calledUrl = typeof input === "string" ? input : input.toString();
      return jsonResponse(200, { items: [], total: 0, page: 1, page_size: 10 });
    });

    renderList();

    await waitFor(() => {
      expect(calledUrl).not.toBeNull();
    });
    expect(calledUrl!).toContain("is_transfer=false");
    expect(calledUrl!).toContain("page=1");
    expect(calledUrl!).toContain("page_size=10");
    expect(calledUrl!).toContain("sort_by=date");
    expect(calledUrl!).toContain("sort_dir=desc");
    // Step 2 must NOT pass a date range.
    expect(calledUrl!).not.toContain("date_from=");
    expect(calledUrl!).not.toContain("date_to=");
  });

  it("renders each row with date, vendor, amount, and category badge", async () => {
    const items: RawTxn[] = [
      makeRawTxn({
        id: 1,
        vendor: "Whole Foods",
        amount: -42.5,
        category_name: "Groceries",
        date: "2026-05-07",
      }),
      makeRawTxn({
        id: 2,
        vendor: "Paycheck",
        amount: 2500,
        category_name: "Income",
        date: "2026-05-06",
      }),
      makeRawTxn({
        id: 3,
        vendor: "Mystery Charge",
        amount: -10,
        category_name: null,
        date: "2026-05-05",
      }),
    ];
    fetchSpy.mockImplementation(async () =>
      jsonResponse(200, { items, total: 3, page: 1, page_size: 10 }),
    );

    renderList();

    await waitFor(() => {
      expect(screen.getByText("Whole Foods")).toBeInTheDocument();
    });
    expect(screen.getByText("Paycheck")).toBeInTheDocument();
    expect(screen.getByText("Mystery Charge")).toBeInTheDocument();

    // Outflow gets destructive color, inflow gets success color.
    const outflow = screen.getByText("-$42.50");
    expect(outflow).toHaveClass("text-destructive");
    const inflow = screen.getByText("$2,500.00");
    expect(inflow).toHaveClass("text-success");

    // Category badge text for categorized rows.
    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(screen.getByText("Income")).toBeInTheDocument();
    // Uncategorized row renders the em-dash placeholder badge.
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders an empty-state when the API returns zero items", async () => {
    fetchSpy.mockImplementation(async () =>
      jsonResponse(200, { items: [], total: 0, page: 1, page_size: 10 }),
    );

    renderList();

    await waitFor(() => {
      expect(screen.getByText(/No transactions yet\./i)).toBeInTheDocument();
    });
  });
});
