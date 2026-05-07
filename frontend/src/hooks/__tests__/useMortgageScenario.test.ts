import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";

import {
  useActiveScenario,
  useCreateScenario,
  useUpdateScenario,
  useActivateScenario,
  useDeleteScenario,
  useScenarios,
  ACTIVE_KEY,
  SCENARIOS_KEY
} from "../useMortgageScenario";
import type { MortgageScenario, MortgageScenarioCreate } from "@/api/mortgage";

const SAMPLE: MortgageScenario = {
  id: 1,
  name: "Plan A",
  is_active: true,
  principal: 300000,
  years_left: 25,
  interest_rate: 4.5,
  monthly_payment: 1500,
  additional_monthly_payment: 0,
  lump_sum_payment: 0,
  investment_return_rate: 7,
  investment_tax_rate: 20,
  created_at: "2026-05-07T00:00:00",
  updated_at: "2026-05-07T00:00:00"
};

const SAMPLE_CREATE: MortgageScenarioCreate = {
  name: "Plan A",
  principal: 300000,
  years_left: 25,
  interest_rate: 4.5,
  monthly_payment: 1500,
  additional_monthly_payment: 0,
  lump_sum_payment: 0,
  investment_return_rate: 7,
  investment_tax_rate: 20
};

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false }
    }
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("useMortgageScenario", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("useScenarios fetches the list", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, [SAMPLE]));
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useScenarios(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([SAMPLE]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/calculators/mortgage/scenarios");
  });

  it("useActiveScenario returns the active scenario when present", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, SAMPLE));
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useActiveScenario(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(SAMPLE);
  });

  it("useActiveScenario swallows 404 as null (first-run path)", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(404, { detail: "No active scenario" })
    );
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useActiveScenario(), { wrapper });

    await waitFor(() => expect(result.current.isFetched).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(false);
  });

  it("useCreateScenario invalidates scenarios + active caches on success", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(201, SAMPLE));
    const { wrapper, client } = makeWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useCreateScenario(), { wrapper });

    let returned: unknown;
    await act(async () => {
      returned = await result.current.mutateAsync(SAMPLE_CREATE);
    });

    expect(returned).toEqual(SAMPLE);
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ method: "POST" });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: SCENARIOS_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ACTIVE_KEY });
  });

  it("useUpdateScenario PUTs to the right URL", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, { ...SAMPLE, principal: 250000 })
    );
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useUpdateScenario(), { wrapper });
    let returned: { principal: number } | undefined;
    await act(async () => {
      returned = await result.current.mutateAsync({
        id: 1,
        payload: { principal: 250000 }
      });
    });

    expect(fetchSpy.mock.calls[0][0]).toBe("/api/calculators/mortgage/scenarios/1");
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ method: "PUT" });
    expect(returned?.principal).toBe(250000);
  });

  it("useActivateScenario POSTs to /activate", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(200, SAMPLE));
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useActivateScenario(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(1);
    });

    expect(fetchSpy.mock.calls[0][0]).toBe(
      "/api/calculators/mortgage/scenarios/1/activate"
    );
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ method: "POST" });
  });

  it("useDeleteScenario DELETEs the right URL", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useDeleteScenario(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(7);
    });

    expect(fetchSpy.mock.calls[0][0]).toBe("/api/calculators/mortgage/scenarios/7");
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ method: "DELETE" });
  });
});
