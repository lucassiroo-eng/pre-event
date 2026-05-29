import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  syncHubspotWonDealsFrance,
  type HubspotWonDeal,
  type SyncResult,
} from "@/lib/hubspot.functions";
import {
  ENRICHMENT_STORAGE_KEY,
  ENRICHMENT_UPDATE_EVENT,
  type EnrichmentStore,
} from "@/lib/useEnrichment";

const KEY = ["hubspot-sync"] as const;
const STORAGE_KEY = "hubspot-sync-v1";
const FIRST_HISTORICAL_YEAR = 2015;
const YEARS_PER_SYNC_CHUNK = 2;

function readStorage(): SyncResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SyncResult) : null;
  } catch {
    return null;
  }
}

function writeStorage(data: SyncResult | null) {
  if (typeof window === "undefined") return;
  try {
    if (data) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore quota errors
  }
}

function aggregateDeals(deals: HubspotWonDeal[]) {
  const wonsPerRegion: Record<string, number> = {};
  const demosPerRegion: Record<string, number> = {};
  const mrrPerRegion: Record<string, number> = {};
  let totalWons = 0;
  let totalDemos = 0;
  let dealsWithRegion = 0;
  let dealsUnknown = 0;
  let totalMrr = 0;

  for (const deal of deals) {
    if (deal.isWon) {
      totalWons += 1;
      wonsPerRegion[deal.regionCode] = (wonsPerRegion[deal.regionCode] ?? 0) + 1;
      if (deal.mrr != null) {
        totalMrr += deal.mrr;
        mrrPerRegion[deal.regionCode] = (mrrPerRegion[deal.regionCode] ?? 0) + deal.mrr;
      }
    }
    if (deal.dateEnteredDemoStage) {
      totalDemos += 1;
      demosPerRegion[deal.regionCode] = (demosPerRegion[deal.regionCode] ?? 0) + 1;
    }
    if (deal.regionCode === "unknown") dealsUnknown += 1;
    else dealsWithRegion += 1;
  }

  return {
    totalWons, totalDemos, dealsWithRegion, dealsUnknown, totalMrr,
    wonsPerRegion, demosPerRegion, mrrPerRegion,
  };
}

function buildMergedSync(chunks: SyncResult[]): SyncResult {
  const byId = new Map<string, HubspotWonDeal>();
  let apiCalls = 0;
  let portalId: number | null = null;

  for (const chunk of chunks) {
    apiCalls += chunk.apiCalls;
    portalId ??= chunk.portalId;
    for (const deal of chunk.deals) byId.set(deal.dealId, deal);
  }

  const deals = Array.from(byId.values());
  const agg = aggregateDeals(deals);

  return {
    syncedAt: new Date().toISOString(),
    apiCalls,
    totalDeals: agg.totalWons,
    ...agg,
    portalId,
    deals,
    perRegion: agg.wonsPerRegion,
  };
}

function applyEnrichmentOverlay(
  sync: SyncResult | null,
  store: EnrichmentStore,
): SyncResult | null {
  if (!sync) return sync;
  if (!store || Object.keys(store).length === 0) return sync;
  let changed = false;
  const deals = sync.deals.map((d) => {
    if (d.regionCode !== "unknown" || !d.companyId) return d;
    const rec = store[d.companyId];
    if (!rec || !rec.found || rec.newRegionCode === "unknown") return d;
    changed = true;
    return { ...d, regionCode: rec.newRegionCode, city: rec.enrichedCity ?? d.city };
  });
  if (!changed) return sync;
  const agg = aggregateDeals(deals);
  return {
    ...sync,
    ...agg,
    totalDeals: agg.totalWons,
    perRegion: agg.wonsPerRegion,
    deals,
  };
}

function subscribeEnrichment(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(ENRICHMENT_UPDATE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(ENRICHMENT_UPDATE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
function getEnrichmentSnapshot(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(ENRICHMENT_STORAGE_KEY) ?? "";
}
function useEnrichmentStore(): EnrichmentStore {
  const snap = useSyncExternalStore(subscribeEnrichment, getEnrichmentSnapshot, () => "");
  return useMemo(() => {
    try { return snap ? (JSON.parse(snap) as EnrichmentStore) : {}; }
    catch { return {}; }
  }, [snap]);
}

export function useSync() {
  const qc = useQueryClient();
  const syncFn = useServerFn(syncHubspotWonDealsFrance);
  const year = new Date().getUTCFullYear();

  const { data: rawSync = null } = useQuery<SyncResult | null>({
    queryKey: KEY,
    queryFn: () => Promise.resolve(qc.getQueryData<SyncResult>(KEY) ?? null),
    staleTime: Infinity,
    gcTime: Infinity,
    initialData: null,
  });

  // Hydrate from localStorage on mount if cache is empty
  useEffect(() => {
    if (qc.getQueryData<SyncResult>(KEY)) return;
    const stored = readStorage();
    if (stored) qc.setQueryData(KEY, stored);
  }, [qc]);

  const mutation = useMutation({
    mutationFn: async () => {
      const chunks: SyncResult[] = [];
      for (
        let startYear = FIRST_HISTORICAL_YEAR;
        startYear <= year;
        startYear += YEARS_PER_SYNC_CHUNK
      ) {
        const chunk = await syncFn({
          data: {
            startYear,
            endYear: Math.min(startYear + YEARS_PER_SYNC_CHUNK, year + 1),
            includePortal: chunks.length === 0,
          },
        });
        chunks.push(chunk);
      }
      const merged = buildMergedSync(chunks);
      qc.setQueryData(KEY, merged);
      writeStorage(merged);
      return buildMergedSync(chunks);
    },
    onSuccess: (data) => {
      qc.setQueryData(KEY, data);
      writeStorage(data);
    },
  });

  // Auto-sync daily at 6:00 AM local time. Triggers on mount (and at the next
  // 6am tick) whenever the cached sync is older than today's 6am threshold.
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const nextSixAm = (from: Date) => {
      const next = new Date(from);
      next.setHours(6, 0, 0, 0);
      if (next <= from) next.setDate(next.getDate() + 1);
      return next;
    };

    const lastThresholdSixAm = (from: Date) => {
      const t = new Date(from);
      t.setHours(6, 0, 0, 0);
      if (t > from) t.setDate(t.getDate() - 1);
      return t;
    };

    const tick = () => {
      const current = qc.getQueryData<SyncResult>(KEY) ?? readStorage();
      const now = new Date();
      const threshold = lastThresholdSixAm(now);
      const lastSync = current?.syncedAt ? new Date(current.syncedAt) : null;
      const needsSync = !lastSync || lastSync < threshold;
      if (needsSync && !mutation.isPending) mutation.mutate();
      const delay = Math.max(1000, nextSixAm(new Date()).getTime() - Date.now());
      timeoutId = setTimeout(tick, delay);
    };

    tick();
    return () => { if (timeoutId) clearTimeout(timeoutId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc]);

  const enrichmentStore = useEnrichmentStore();
  const sync = useMemo<SyncResult | null>(
    () => applyEnrichmentOverlay(rawSync, enrichmentStore),
    [rawSync, enrichmentStore],
  );

  return { sync, mutation };
}
