import { createServerFn } from "@tanstack/react-start";
import { regionFromCity } from "@/lib/frenchCityToRegion";
import type { RegionCode } from "@/data/mockData";

const BASE = "https://api.hubapi.com";

export type HubspotWonDeal = {
  dealId: string;
  dealname: string;
  pipeline: string | null;
  closedate: string | null; // ISO
  amount: number | null;
  mrr: number | null;
  companyId: string | null;
  companyName: string | null;
  city: string | null;
  industry: string | null;
  numEmployees: number | null;
  regionCode: RegionCode | "unknown";
  isWon: boolean;
  dateEnteredDemoStage: string | null;
};

export type SyncResult = {
  syncedAt: string;
  apiCalls: number;
  totalDeals: number; // wons (kept for back-compat)
  totalWons: number;
  totalDemos: number;
  dealsWithRegion: number;
  dealsUnknown: number;
  totalMrr: number;
  portalId: number | null;
  deals: HubspotWonDeal[];
  perRegion: Record<string, number>; // wons per region (back-compat)
  wonsPerRegion: Record<string, number>;
  demosPerRegion: Record<string, number>;
  mrrPerRegion: Record<string, number>;
};

type HsObject = { id: string; properties: Record<string, string | null> };

type SyncInput = {
  startYear?: number;
  endYear?: number;
  includePortal?: boolean;
};

// ---- In-memory usage tracker (per server isolate) ----
type DayUsage = {
  total: number;
  byEndpoint: Record<string, number>;
  byHour: number[]; // 24 buckets
  lastCallAt: string | null;
};
const usageByDay = new Map<string, DayUsage>();

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeEndpoint(path: string): string {
  // Strip query string + numeric ids for cleaner grouping
  return path.split("?")[0].replace(/\/\d+(?=\/|$)/g, "/:id");
}

export function recordHubspotCall(path: string, method = "GET") {
  const key = todayKey();
  const cur: DayUsage = usageByDay.get(key) ?? {
    total: 0,
    byEndpoint: {},
    byHour: Array(24).fill(0),
    lastCallAt: null,
  };
  cur.total += 1;
  const ep = `${method.toUpperCase()} ${normalizeEndpoint(path)}`;
  cur.byEndpoint[ep] = (cur.byEndpoint[ep] ?? 0) + 1;
  const h = new Date().getUTCHours();
  cur.byHour[h] = (cur.byHour[h] ?? 0) + 1;
  cur.lastCallAt = new Date().toISOString();
  usageByDay.set(key, cur);
}

async function hsFetch(path: string, init: RequestInit, token: string): Promise<unknown> {
  const MAX_RETRIES = 6;
  const method = (init.method ?? "GET").toString();
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    recordHubspotCall(path, method);
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    if (res.ok) return res.json();


    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Math.min(500 * 2 ** attempt, 8000) + Math.floor(Math.random() * 250);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }

    const text = await res.text().catch(() => "");
    throw new Error(`HubSpot ${res.status} on ${path}: ${text.slice(0, 300)}`);
  }
  throw new Error(`HubSpot request failed after retries: ${path}`);
}

export type HubspotUsageToday = {
  date: string;
  total: number;
  byEndpoint: { endpoint: string; count: number }[];
  byHour: number[];
  lastCallAt: string | null;
  serverNow: string;
};

export const getHubspotUsageToday = createServerFn({ method: "GET" }).handler(
  async (): Promise<HubspotUsageToday> => {
    const key = todayKey();
    const cur = usageByDay.get(key);
    const byEndpoint = cur
      ? Object.entries(cur.byEndpoint)
          .map(([endpoint, count]) => ({ endpoint, count }))
          .sort((a, b) => b.count - a.count)
      : [];
    return {
      date: key,
      total: cur?.total ?? 0,
      byEndpoint,
      byHour: cur?.byHour ?? Array(24).fill(0),
      lastCallAt: cur?.lastCallAt ?? null,
      serverNow: new Date().toISOString(),
    };
  },
);

export const syncHubspotWonDealsFrance = createServerFn({ method: "POST" })
  .inputValidator((input: SyncInput | undefined): Required<SyncInput> => {
    const maxYear = new Date().getUTCFullYear() + 2;
    const startYear = Number.isInteger(input?.startYear) ? input!.startYear! : 2000;
    const endYear = Number.isInteger(input?.endYear) ? input!.endYear! : maxYear;
    const safeStart = Math.max(1990, Math.min(startYear, maxYear));
    const safeEnd = Math.max(safeStart + 1, Math.min(endYear, maxYear + 1));
    return {
      startYear: safeStart,
      endYear: safeEnd,
      includePortal: input?.includePortal !== false,
    };
  })
  .handler(async ({ data }): Promise<SyncResult> => {
    const token = process.env.HUBSPOT_API_KEY;
    if (!token) throw new Error("HUBSPOT_API_KEY is not configured");

    const MAX_API_CALLS = 5000;
    let apiCalls = 0;
    const guard = () => {
      if (apiCalls >= MAX_API_CALLS) {
        throw new Error(`Sync aborted: exceeded ${MAX_API_CALLS} HubSpot API calls (safety cap).`);
      }
    };

    // 0) Portal info (for deal deep-links).
    let portalId: number | null = null;
    if (data.includePortal) {
      try {
        const info = (await hsFetch("/account-info/v3/details", { method: "GET" }, token)) as {
          portalId?: number;
        };
        apiCalls += 1;
        portalId = info?.portalId ?? null;
      } catch {
        // non-fatal
      }
    }

    // 1) Search Closed Won deals in France (paginated, 100 / page).
    // HubSpot search API caps at 10k results per query → window by date.
    const PROPS = [
      "dealname",
      "pipeline",
      "closedate",
      "country_qobra_samba",
      "amount",
      "hs_mrr",
      "hs_arr",
      "date_entered_demo_stage",
      "dealstage",
    ];

    const searchWindowed = async (
      dateProp: string,
      extraFilters: Array<{ propertyName: string; operator: string; value?: string }>,
    ): Promise<HsObject[]> => {
      const DAY_MS = 24 * 60 * 60 * 1000;
      const searchRange = async (startMs: number, endMs: number): Promise<HsObject[]> => {
        if (endMs <= startMs) return [];
        const local: HsObject[] = [];
        let after: string | undefined = undefined;
        let pageCount = 0;

        for (let i = 0; i < 99; i++) {
          const filters: Array<Record<string, unknown>> = [
            ...extraFilters,
            { propertyName: dateProp, operator: "GTE", value: String(startMs) },
            { propertyName: dateProp, operator: "LT", value: String(endMs) },
          ];
          const body: Record<string, unknown> = {
            filterGroups: [{ filters }],
            properties: PROPS,
            limit: 100,
          };
          if (after) body.after = after;

          const data = (await hsFetch(
            "/crm/v3/objects/deals/search",
            {
              method: "POST",
              body: JSON.stringify(body),
            },
            token,
          )) as { results?: HsObject[]; paging?: { next?: { after?: string } } };
          apiCalls += 1;
          guard();

          const results = data.results ?? [];
          local.push(...results);
          pageCount += results.length;

          const next = data.paging?.next?.after;
          if (!next) return local;
          after = next;

          // Never page into HubSpot's 10k search window. Split the date range instead.
          if (pageCount >= 9500) break;
        }

        if (endMs - startMs <= DAY_MS) {
          throw new Error(
            `HubSpot search range for ${dateProp} is still over 9,500 results in one day.`,
          );
        }

        const days = Math.floor((endMs - startMs) / DAY_MS);
        const midMs = startMs + Math.max(1, Math.floor(days / 2)) * DAY_MS;
        const left = await searchRange(startMs, midMs);
        const right = await searchRange(midMs, endMs);
        return [...left, ...right];
      };

      const yearlyResults: HsObject[][] = [];
      for (let year = data.startYear; year < data.endYear; year++) {
        yearlyResults.push(await searchRange(Date.UTC(year, 0, 1), Date.UTC(year + 1, 0, 1)));
      }
      return yearlyResults.flat();
    };

    const franceFilter = { propertyName: "country_qobra_samba", operator: "EQ", value: "France" };
    const wonsRaw = await searchWindowed("closedate", [
      franceFilter,
      { propertyName: "dealstage", operator: "EQ", value: "closedwon" },
    ]);
    const demosRaw = await searchWindowed("date_entered_demo_stage", [franceFilter]);

    // Merge + dedupe.
    const deals: HsObject[] = [];
    {
      const seen = new Set<string>();
      for (const d of [...wonsRaw, ...demosRaw]) {
        if (seen.has(d.id)) continue;
        seen.add(d.id);
        deals.push(d);
      }
    }

    // Concurrency helper — runs up to `n` async tasks at a time.
    const runPool = async <T, R>(
      items: T[],
      n: number,
      fn: (item: T) => Promise<R>,
    ): Promise<R[]> => {
      const out: R[] = new Array(items.length);
      let i = 0;
      const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
        while (true) {
          const idx = i++;
          if (idx >= items.length) return;
          out[idx] = await fn(items[idx]);
        }
      });
      await Promise.all(workers);
      return out;
    };

    // 2) Batch read deal -> company associations (500 / batch, parallel up to 5).
    const dealToCompany = new Map<string, string>();
    const dealIds = deals.map((d) => d.id);
    const assocBatches: string[][] = [];
    for (let i = 0; i < dealIds.length; i += 500) assocBatches.push(dealIds.slice(i, i + 500));
    const assocResults = await runPool(assocBatches, 5, async (batch) => {
      const data = (await hsFetch(
        "/crm/v3/associations/deals/companies/batch/read",
        {
          method: "POST",
          body: JSON.stringify({ inputs: batch.map((id) => ({ id })) }),
        },
        token,
      )) as { results?: Array<{ from?: { id: string }; to?: Array<{ id: string }> }> };
      apiCalls += 1;
      return data.results ?? [];
    });
    guard();
    for (const results of assocResults) {
      for (const r of results) {
        const dealId = r.from?.id;
        const compId = r.to?.[0]?.id;
        if (dealId && compId) dealToCompany.set(dealId, compId);
      }
    }

    // 3) Batch read unique companies (100 / batch, parallel up to 5).
    const uniqueCompanyIds = Array.from(new Set(dealToCompany.values()));
    type Comp = {
      name: string | null;
      city: string | null;
      industry: string | null;
      numEmployees: number | null;
    };
    const companyMap = new Map<string, Comp>();
    const compBatches: string[][] = [];
    for (let i = 0; i < uniqueCompanyIds.length; i += 100)
      compBatches.push(uniqueCompanyIds.slice(i, i + 100));
    const compResults = await runPool(compBatches, 5, async (batch) => {
      const data = (await hsFetch(
        "/crm/v3/objects/companies/batch/read",
        {
          method: "POST",
          body: JSON.stringify({
            properties: ["name", "city", "industry", "numberofemployees"],
            inputs: batch.map((id) => ({ id })),
          }),
        },
        token,
      )) as { results?: HsObject[] };
      apiCalls += 1;
      return data.results ?? [];
    });
    guard();
    for (const results of compResults) {
      for (const c of results) {
        const raw = c.properties?.numberofemployees ?? null;
        const n = raw != null && raw !== "" ? Number(raw) : null;
        companyMap.set(c.id, {
          name: c.properties?.name ?? null,
          city: c.properties?.city ?? null,
          industry: c.properties?.industry ?? null,
          numEmployees: n != null && Number.isFinite(n) ? n : null,
        });
      }
    }

    // 4) Build flat result + per-region counts (wons & demos separately).
    const wonsPerRegion: Record<string, number> = {};
    const demosPerRegion: Record<string, number> = {};
    const mrrPerRegion: Record<string, number> = {};
    let totalWons = 0;
    let totalDemos = 0;
    let dealsWithRegion = 0;
    let dealsUnknown = 0;
    let totalMrr = 0;
    const enriched: HubspotWonDeal[] = deals.map((d) => {
      const companyId = dealToCompany.get(d.id) ?? null;
      const comp = companyId ? (companyMap.get(companyId) ?? null) : null;
      const city = comp?.city ?? null;
      const regionCode = regionFromCity(city);
      const amountRaw = d.properties?.amount;
      const amount = amountRaw != null && amountRaw !== "" ? Number(amountRaw) : null;
      let mrr: number | null = null;
      if (amount != null && Number.isFinite(amount)) mrr = amount;
      if (mrr != null && !Number.isFinite(mrr)) mrr = null;

      const isWon = d.properties?.dealstage === "closedwon";
      const dateEnteredDemoStage = d.properties?.date_entered_demo_stage ?? null;
      const isDemo = dateEnteredDemoStage != null && dateEnteredDemoStage !== "";

      if (isWon) {
        wonsPerRegion[regionCode] = (wonsPerRegion[regionCode] ?? 0) + 1;
        totalWons += 1;
        if (mrr != null) {
          mrrPerRegion[regionCode] = (mrrPerRegion[regionCode] ?? 0) + mrr;
          totalMrr += mrr;
        }
      }
      if (isDemo) {
        demosPerRegion[regionCode] = (demosPerRegion[regionCode] ?? 0) + 1;
        totalDemos += 1;
      }
      if (regionCode === "unknown") dealsUnknown += 1;
      else dealsWithRegion += 1;
      return {
        dealId: d.id,
        dealname: d.properties?.dealname ?? "(no name)",
        pipeline: d.properties?.pipeline ?? null,
        closedate: d.properties?.closedate ?? null,
        amount: amount != null && Number.isFinite(amount) ? amount : null,
        mrr,
        companyId,
        companyName: comp?.name ?? null,
        city,
        industry: comp?.industry ?? null,
        numEmployees: comp?.numEmployees ?? null,
        regionCode,
        isWon,
        dateEnteredDemoStage,
      };
    });

    return {
      syncedAt: new Date().toISOString(),
      apiCalls,
      totalDeals: totalWons,
      totalWons,
      totalDemos,
      dealsWithRegion,
      dealsUnknown,
      totalMrr,
      portalId,
      deals: enriched,
      perRegion: wonsPerRegion,
      wonsPerRegion,
      demosPerRegion,
      mrrPerRegion,
    };
  });
