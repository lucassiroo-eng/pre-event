import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadDeals, readDeals, writeDeals, dealsByCountry, countryStats, type WonDeal, type CsvMeta, readMeta } from "./csvStore";
import { readEnrichmentStore } from "./enrichmentStore";
import { regionFromCity } from "./frenchCityToRegion";
import { regionFromPostalCode } from "./frenchPostalToRegion";

function applyEnrichmentOverlay(deals: WonDeal[]): WonDeal[] {
  const store = readEnrichmentStore();
  if (!store || Object.keys(store).length === 0) return deals;
  let changed = false;
  const result = deals.map((d) => {
    if (d.regionCode !== "unknown") return d;
    const rec = store[d.companyId];
    if (!rec) return d;
    let region: string = rec.regionCode;
    if (region === "unknown" && rec.hubspotZip) {
      region = regionFromPostalCode(rec.hubspotZip) ?? "unknown";
    }
    if (region === "unknown" && rec.hubspotCity) {
      region = regionFromCity(rec.hubspotCity) ?? "unknown";
    }
    if (region === "unknown" && rec.sirenePostal) {
      region = regionFromPostalCode(rec.sirenePostal) ?? "unknown";
    }
    if (region === "unknown" && rec.sireneCity) {
      region = regionFromCity(rec.sireneCity) ?? "unknown";
    }
    if (region === "unknown") return d;
    changed = true;
    return { ...d, regionCode: region, city: rec.hubspotCity ?? rec.sireneCity ?? d.city };
  });
  if (changed) writeDeals(result);
  return changed ? result : deals;
}

interface DealsCtx {
  deals: WonDeal[];
  meta: CsvMeta | null;
  loading: boolean;
  refresh: () => void;
  setDeals: (deals: WonDeal[]) => void;
  byCountry: (country: string) => WonDeal[];
  stats: Record<string, { count: number; mrr: number }>;
}

const Ctx = createContext<DealsCtx | null>(null);

export function DealsProvider({ children }: { children: ReactNode }) {
  const [deals, setDealsState] = useState<WonDeal[]>([]);
  const [meta, setMeta] = useState<CsvMeta | null>(() => readMeta());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDeals().then((loaded) => {
      const enriched = applyEnrichmentOverlay(loaded);
      setDealsState(enriched);
      setLoading(false);
    });
  }, []);

  const refresh = useCallback(() => {
    loadDeals().then((loaded) => {
      const enriched = applyEnrichmentOverlay(loaded);
      setDealsState(enriched);
      setMeta(readMeta());
    });
  }, []);

  const setDeals = useCallback((newDeals: WonDeal[]) => {
    const enriched = applyEnrichmentOverlay(newDeals);
    writeDeals(enriched);
    setDealsState(enriched);
  }, []);

  const byCountry = useCallback(
    (country: string) => dealsByCountry(deals, country),
    [deals],
  );

  const stats = useMemo(() => countryStats(deals), [deals]);

  return (
    <Ctx.Provider value={{ deals, meta, loading, refresh, setDeals, byCountry, stats }}>
      {children}
    </Ctx.Provider>
  );
}

export function useDeals() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDeals must be used within DealsProvider");
  return v;
}
