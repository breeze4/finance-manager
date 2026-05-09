import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type DateRangeLabel =
  | "This Month"
  | "Last 30 Days"
  | "This Year"
  | "Last Year"
  | "All Time";

export interface ResolvedDateRange {
  /** ``YYYY-MM-DD`` or ``undefined`` when the range is unbounded. */
  dateFrom: string | undefined;
  dateTo: string | undefined;
}

interface GlobalFilters {
  accountId: number | null;
  setAccountId: (id: number | null) => void;
  dateRange: DateRangeLabel;
  setDateRange: (label: DateRangeLabel) => void;
  /** Derived ``{ dateFrom, dateTo }`` from the active label. */
  resolvedRange: ResolvedDateRange;
}

const GlobalFiltersContext = createContext<GlobalFilters | null>(null);

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function resolveDateRange(label: DateRangeLabel, today: Date = new Date()): ResolvedDateRange {
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (label) {
    case "This Month": {
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0);
      return { dateFrom: isoDate(start), dateTo: isoDate(end) };
    }
    case "Last 30 Days": {
      const end = new Date(y, m, today.getDate());
      const start = new Date(y, m, today.getDate() - 29);
      return { dateFrom: isoDate(start), dateTo: isoDate(end) };
    }
    case "This Year":
      return { dateFrom: `${y}-01-01`, dateTo: `${y}-12-31` };
    case "Last Year":
      return { dateFrom: `${y - 1}-01-01`, dateTo: `${y - 1}-12-31` };
    case "All Time":
      return { dateFrom: undefined, dateTo: undefined };
  }
}

export function GlobalFiltersProvider({ children }: { children: ReactNode }) {
  const [accountId, setAccountId] = useState<number | null>(null);
  const [dateRange, setDateRange] = useState<DateRangeLabel>("This Month");
  const value = useMemo<GlobalFilters>(
    () => ({
      accountId,
      setAccountId,
      dateRange,
      setDateRange,
      resolvedRange: resolveDateRange(dateRange),
    }),
    [accountId, dateRange],
  );
  return (
    <GlobalFiltersContext.Provider value={value}>
      {children}
    </GlobalFiltersContext.Provider>
  );
}

export function useGlobalFilters(): GlobalFilters {
  const ctx = useContext(GlobalFiltersContext);
  if (!ctx) throw new Error("useGlobalFilters must be used within GlobalFiltersProvider");
  return ctx;
}
