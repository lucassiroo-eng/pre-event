import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadDeals, readDeals, writeDeals, dealsByCountry, countryStats, type WonDeal, type CsvMeta, readMeta, writeMeta } from "./csvStore";
import { readEnrichmentStore, writeEnrichmentStore, type EnrichmentStore } from "./enrichmentStore";
import { cityToRegion } from "./cityToRegionByCountry";
import { postalToRegion } from "./postalToRegionByCountry";
import {
  cloudEnabled,
  cloudFetchDeals,
  cloudFetchEnrichment,
  cloudFetchMeta,
  cloudUpsertDeals,
  cloudWriteMeta,
} from "./cloudStore";

function applyEnrichmentOverlay(deals: WonDeal[]): WonDeal[] {
  const store = readEnrichmentStore();
  if (!store || Object.keys(store).length === 0) return deals;
  let changed = false;
  const result = deals.map((d) => {
    if (d.regionCode !== "unknown") return d;
    const rec = store[d.companyId];
    if (!rec) return d;
    const country = d.country;
    let region: string = rec.regionCode;
    if (region === "unknown" && rec.hubspotZip)
      region = postalToRegion(country, rec.hubspotZip);
    if (region === "unknown" && rec.hubspotCity)
      region = cityToRegion(country, rec.hubspotCity);
    if (region === "unknown" && rec.sirenePostal)
      region = postalToRegion(country, rec.sirenePostal);
    if (region === "unknown" && rec.sireneCity)
      region = cityToRegion(country, rec.sireneCity);
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

  // Hydrate from cloud first (so any device sees the shared CSV + enrichment),
  // fall back to localStorage on failure or when Supabase isn't configured.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1) Paint quickly with whatever localStorage has, so first paint isn't blank.
      const local = await loadDeals();
      if (!cancelled) {
        const enriched = applyEnrichmentOverlay(local);
        setDealsState(enriched);
      }

      // 2) Then try the cloud and overwrite the cache if it has data.
      if (cloudEnabled) {
        try {
          const [cloudDeals, cloudEnrich, cloudMeta] = await Promise.all([
            cloudFetchDeals(),
            cloudFetchEnrichment(),
            cloudFetchMeta(),
          ]);
          if (cancelled) return;
          if (cloudEnrich && cloudEnrich.length > 0) {
            const store: EnrichmentStore = {};
            for (const r of cloudEnrich) store[r.companyId] = r;
            writeEnrichmentStore(store);
          }
          if (cloudDeals && cloudDeals.length > 0) {
            const enriched = applyEnrichmentOverlay(cloudDeals);
            writeDeals(enriched);
            setDealsState(enriched);
          }
          if (cloudMeta && cloudMeta.fileName) {
            writeMeta(cloudMeta);
            setMeta(cloudMeta);
          }
        } catch (err) {
          console.warn("[cloud] hydration failed", err);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
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
    // Mirror to cloud (best-effort). The Enrichment page also does an explicit
    // cloud push on CSV upload — this catches any other code path that
    // mutates deals.
    if (cloudEnabled) void cloudUpsertDeals(enriched);
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
