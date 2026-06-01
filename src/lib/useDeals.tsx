import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { readDeals, writeDeals, dealsByCountry, countryStats, type WonDeal, type CsvMeta, readMeta } from "./csvStore";

interface DealsCtx {
  deals: WonDeal[];
  meta: CsvMeta | null;
  refresh: () => void;
  setDeals: (deals: WonDeal[]) => void;
  byCountry: (country: string) => WonDeal[];
  stats: Record<string, { count: number; mrr: number }>;
}

const Ctx = createContext<DealsCtx | null>(null);

export function DealsProvider({ children }: { children: ReactNode }) {
  const [deals, setDealsState] = useState<WonDeal[]>(() => readDeals());
  const [meta, setMeta] = useState<CsvMeta | null>(() => readMeta());

  const refresh = useCallback(() => {
    setDealsState(readDeals());
    setMeta(readMeta());
  }, []);

  const setDeals = useCallback((newDeals: WonDeal[]) => {
    writeDeals(newDeals);
    setDealsState(newDeals);
  }, []);

  const byCountry = useCallback(
    (country: string) => dealsByCountry(deals, country),
    [deals],
  );

  const stats = useMemo(() => countryStats(deals), [deals]);

  return (
    <Ctx.Provider value={{ deals, meta, refresh, setDeals, byCountry, stats }}>
      {children}
    </Ctx.Provider>
  );
}

export function useDeals() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDeals must be used within DealsProvider");
  return v;
}
