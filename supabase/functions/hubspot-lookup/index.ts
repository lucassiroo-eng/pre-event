import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HS_TOKEN = Deno.env.get("HUBSPOT_TOKEN") ?? "";
const HS_SEARCH = "https://api.hubapi.com/crm/v3/objects/companies/search";

interface HsCompany {
  id: string;
  properties: {
    name: string;
    city: string | null;
    zip: string | null;
    domain: string | null;
  };
}

async function searchCompany(name: string): Promise<HsCompany | null> {
  const body = {
    filterGroups: [{
      filters: [{ propertyName: "name", operator: "EQ", value: name }],
    }],
    properties: ["name", "city", "zip", "domain"],
    limit: 1,
  };

  const res = await fetch(HS_SEARCH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${HS_TOKEN}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) return null;
  const data = await res.json() as { results: HsCompany[] };
  return data.results?.[0] ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { names } = await req.json() as { names: string[] };

    const results = await Promise.all(names.map(async (query) => {
      const company = await searchCompany(query);
      if (!company) return { query, found: false, city: null, zip: null, hubspotId: null, domain: null };
      return {
        query,
        found: true,
        city: company.properties.city ?? null,
        zip: company.properties.zip ?? null,
        hubspotId: company.id,
        domain: company.properties.domain ?? null,
      };
    }));

    return new Response(JSON.stringify({ results }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
