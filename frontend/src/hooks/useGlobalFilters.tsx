import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface GlobalFilters {
  accountId: number | null;
  setAccountId: (id: number | null) => void;
}

const GlobalFiltersContext = createContext<GlobalFilters | null>(null);

export function GlobalFiltersProvider({ children }: { children: ReactNode }) {
  const [accountId, setAccountId] = useState<number | null>(null);
  const value = useMemo(() => ({ accountId, setAccountId }), [accountId]);
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
