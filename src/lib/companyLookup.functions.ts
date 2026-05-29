import { createServerFn } from "@tanstack/react-start";
import { regionFromCity } from "@/lib/frenchCityToRegion";
import { regionFromPostalCode } from "@/lib/frenchPostalToRegion";
import { recordHubspotCall } from "@/lib/hubspot.functions";
import type { RegionCode } from "@/data/mockData";

const BASE = "https://api.hubapi.com";

export type CompanyLookupRow = {
  key: string; // normalized name used as map key
  query: string; // original name searched
  found: boolean;
  hubspotId: string | null;
  name: string | null;
  city: string | null;
  zip: string | null;
  regionCode: RegionCode | "unknown";
};

function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export const lookupHubspotCompaniesByNames = createServerFn({ method: "POST" })
  .inputValidator((input: { names: string[] }) => {
    if (!input || !Array.isArray(input.names)) throw new Error("names[] required");
    const names = input.names
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
    return { names };
  })
  .handler(async ({ data }): Promise<{ results: CompanyLookupRow[] }> => {
    const token = process.env.HUBSPOT_API_KEY;
    if (!token) throw new Error("HUBSPOT_API_KEY is not configured");

    const results: CompanyLookupRow[] = [];
    // dedupe by normalized key while preserving original query
    const queryByKey = new Map<string, string>();
    for (const n of data.names) {
      const k = normalizeName(n);
      if (!queryByKey.has(k)) queryByKey.set(k, n);
    }
    const keys = Array.from(queryByKey.keys());

    for (let i = 0; i < keys.length; i += 50) {
      const batchKeys = keys.slice(i, i + 50);
      const batchQueries = batchKeys.map((k) => queryByKey.get(k)!);

      const lookupPath = "/crm/v3/objects/companies/search";
      recordHubspotCall(lookupPath, "POST");
      const res = await fetch(`${BASE}${lookupPath}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filterGroups: [
            {
              filters: [
                { propertyName: "name", operator: "IN", values: batchQueries },
              ],
            },
          ],
          properties: ["name", "city", "zip"],
          limit: 100,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HubSpot ${res.status}: ${text.slice(0, 200)}`);
      }
      const json = (await res.json()) as {
        results?: Array<{ id: string; properties: Record<string, string | null> }>;
      };

      const matched = new Map<string, { id: string; props: Record<string, string | null> }>();
      for (const c of json.results ?? []) {
        const nm = c.properties?.name ?? "";
        const k = normalizeName(nm);
        if (queryByKey.has(k) && !matched.has(k)) {
          matched.set(k, { id: c.id, props: c.properties });
        }
      }

      for (const k of batchKeys) {
        const q = queryByKey.get(k)!;
        const m = matched.get(k);
        if (m) {
          const city = m.props?.city ?? null;
          const zip = m.props?.zip ?? null;
          const byPostal = regionFromPostalCode(zip);
          const region = byPostal !== "unknown" ? byPostal : regionFromCity(city);
          results.push({
            key: k,
            query: q,
            found: true,
            hubspotId: m.id,
            name: m.props?.name ?? null,
            city,
            zip,
            regionCode: region,
          });
        } else {
          results.push({
            key: k,
            query: q,
            found: false,
            hubspotId: null,
            name: null,
            city: null,
            zip: null,
            regionCode: "unknown",
          });
        }
      }
    }

    return { results };
  });

export { normalizeName };
