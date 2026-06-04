import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Supports both Anthropic direct and Azure AI Foundry.
// Option A: set AI_ENDPOINT + AI_API_KEY + AI_MODEL individually.
// Option B: set AZURE_CONFIG as "endpoint|model|key" (same format as feo/partner-audit).
let AI_ENDPOINT: string;
let AI_API_KEY: string;
let AI_MODEL: string;

const azureCfg = Deno.env.get("AZURE_CONFIG");
if (azureCfg) {
  const [ep, model, key] = azureCfg.split("|");
  AI_ENDPOINT = ep;
  AI_MODEL = model;
  AI_API_KEY = key;
} else {
  AI_ENDPOINT = Deno.env.get("AI_ENDPOINT") ?? "https://api.anthropic.com/v1/messages";
  AI_API_KEY = Deno.env.get("AI_API_KEY") ?? "";
  AI_MODEL = Deno.env.get("AI_MODEL") ?? "claude-haiku-4-5-20251001";
}

interface CompanyIn {
  id: string;
  name: string;
}

async function askRegions(
  companies: CompanyIn[],
  country: string,
  regions: Record<string, string>,
): Promise<Record<string, { region: string; city: string }>> {
  const regionList = Object.entries(regions)
    .map(([code, name]) => `${code} = ${name}`)
    .join("\n");

  const companyList = companies
    .map((c, i) => `${i + 1}. [${c.id}] ${c.name}`)
    .join("\n");

  const prompt = `For each company, return the region code where it is headquartered in ${country}.

Valid regions:
${regionList}

Reply ONLY with a JSON array, no other text:
[{"id":"<company_id>","r":"<region_code>","c":"<city_name>"}]
Use "unknown" for r if unsure. Keep c short (city name only).

Companies:
${companyList}`;

  const res = await fetch(AI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": AI_API_KEY,
      "api-key": AI_API_KEY,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`AI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text: string = data.content?.[0]?.text ?? "";

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return {};

  try {
    const arr = JSON.parse(jsonMatch[0]) as Array<{
      id: string;
      r: string;
      c?: string;
    }>;
    const validCodes = new Set(Object.keys(regions));
    validCodes.add("unknown");
    const out: Record<string, { region: string; city: string }> = {};
    for (const item of arr) {
      if (item.id && item.r && validCodes.has(item.r)) {
        out[item.id] = { region: item.r, city: item.c ?? "" };
      }
    }
    return out;
  } catch {
    return {};
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    if (!AI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI not configured. Set AZURE_CONFIG or AI_API_KEY + AI_ENDPOINT." }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const { companies, country, regions } = (await req.json()) as {
      companies: CompanyIn[];
      country: string;
      regions: Record<string, string>;
    };

    const results = await askRegions(companies, country, regions);

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
