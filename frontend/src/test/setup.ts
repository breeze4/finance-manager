import "@testing-library/jest-dom/vitest";

// jsdom doesn't ship ResizeObserver; Recharts (ResponsiveContainer) requires it.
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
}

