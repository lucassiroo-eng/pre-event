import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { lookupSireneBatch, type SireneHit } from "@/lib/enrichment.functions";
import { regionFromCity } from "@/lib/frenchCityToRegion";
import { regionFromPostalCode } from "@/lib/frenchPostalToRegion";
import type { RegionCode } from "@/data/mockData";

export const ENRICHMENT_STORAGE_KEY = "enrichment-sirene-v1";
export const ENRICHMENT_UPDATE_EVENT = "enrichment-store-update";
const STORAGE_KEY = ENRICHMENT_STORAGE_KEY;
const BATCH_SIZE = 25;

export type EnrichmentRecord = {
  companyId: string;
  companyName: string;
  originalCity: string | null;
  enrichedCity: string | null;
  postalCode: string | null;
  siren: string | null;
  newRegionCode: RegionCode | "unknown";
  found: boolean;
  enrichedAt: string;
  error?: string;
};

export type EnrichmentStore = Record<string, EnrichmentRecord>; // keyed by companyId

function readStore(): EnrichmentStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as EnrichmentStore) : {};
  } catch {
    return {};
  }
}

function writeStore(store: EnrichmentStore) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    window.dispatchEvent(new Event(ENRICHMENT_UPDATE_EVENT));
  } catch {
    // ignore quota
  }
}

export type QueueItem = {
  companyId: string;
  companyName: string;
  originalCity: string | null;
};

export function useEnrichment() {
  const [store, setStore] = useState<EnrichmentStore>({});
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const cancelRef = useRef(false);
  const lookupFn = useServerFn(lookupSireneBatch);

  // Hydrate from localStorage on mount, re-resolving any cached records whose
  // newRegionCode is "unknown" but now resolvable via the improved mapping.
  useEffect(() => {
    const cur = readStore();
    let changed = false;
    for (const id of Object.keys(cur)) {
      const r = cur[id];
      if (r.newRegionCode !== "unknown") continue;
      const byPostal = regionFromPostalCode(r.postalCode);
      const next = byPostal !== "unknown" ? byPostal : regionFromCity(r.enrichedCity);
      if (next !== "unknown") {
        cur[id] = { ...r, newRegionCode: next };
        changed = true;
      }
    }
    if (changed) writeStore(cur);
    setStore(cur);
  }, []);

  const clearStore = useCallback(() => {
    setStore({});
    writeStore({});
  }, []);

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const run = useCallback(
    async (queue: QueueItem[]) => {
      if (running) return;
      cancelRef.current = false;
      setRunning(true);

      // Filter out already-enriched companyIds.
      const current = readStore();
      const pending = queue.filter((q) => !current[q.companyId] && q.companyName);

      setProgress({ done: 0, total: pending.length });

      for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        if (cancelRef.current) break;
        const batch = pending.slice(i, i + BATCH_SIZE);
        const nameToItem = new Map<string, QueueItem>();
        for (const it of batch) nameToItem.set(it.companyName, it);

        let res: { results: SireneHit[] };
        try {
          res = await lookupFn({ data: { names: batch.map((b) => b.companyName) } });
        } catch (e) {
          // Mark batch as errored and continue.
          const err = e instanceof Error ? e.message : "lookup failed";
          const errored: SireneHit[] = batch.map((b) => ({
            query: b.companyName, found: false, city: null, postalCode: null,
            siren: null, nomComplet: null, error: err,
          }));
          res = { results: errored };
        }

        const next = { ...readStore() };
        for (const hit of res.results) {
          const item = nameToItem.get(hit.query);
          if (!item) continue;
          // Postal code is deterministic (dep → region); fall back to city map.
          const byPostal = regionFromPostalCode(hit.postalCode);
          const newRegionCode =
            byPostal !== "unknown" ? byPostal : regionFromCity(hit.city);
          next[item.companyId] = {
            companyId: item.companyId,
            companyName: item.companyName,
            originalCity: item.originalCity,
            enrichedCity: hit.city,
            postalCode: hit.postalCode,
            siren: hit.siren,
            newRegionCode,
            found: hit.found,
            enrichedAt: new Date().toISOString(),
            error: hit.error,
          };
        }
        writeStore(next);
        setStore(next);
        setProgress({ done: Math.min(i + batch.length, pending.length), total: pending.length });
      }

      setRunning(false);
    },
    [lookupFn, running],
  );

  return { store, run, running, progress, cancel, clearStore };
}
