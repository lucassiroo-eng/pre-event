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

AI_ENDPOINT = Deno.env.get("AI_ENDPOINT") ?? "https://api.anthropic.com/v1/messages";
AI_API_KEY = Deno.env.get("AI_API_KEY") ?? "";
AI_MODEL = Deno.env.get("AI_MODEL") ?? "claude-sonnet-4-6";
const IS_AZURE = AI_ENDPOINT.includes("azure");

interface CompanyIn {
  id: string;
  name: string;
}

async function askRegions(
  companies: CompanyIn[],
  country: string,
  regions: Record<string, string>,
): Promise<{ mapped: Record<string, { region: string; city: string }>; debug?: string }> {
  const regionList = Object.entries(regions)
    .map(([code, name]) => `${code} = ${name}`)
    .join("\n");

  // Use numeric indices — much more reliable than passing long companyIds
  const companyList = companies
    .map((c, i) => `${i}. ${c.name}`)
    .join("\n");

  const prompt = `For each company, return the region code where it is headquartered in ${country}.

Valid regions:
${regionList}

Reply ONLY with a JSON array, no other text:
[{"i":0,"r":"region_code","c":"city_name"},{"i":1,"r":"...","c":"..."}]
Use "unknown" for r if unsure. Keep c short (city name only). "i" is the company index number.

Companies:
${companyList}`;

  const res = await fetch(AI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      ...(IS_AZURE
        ? { "Authorization": `Bearer ${AI_API_KEY}` }
        : { "x-api-key": AI_API_KEY }),
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    return { mapped: {}, debug: `AI returned ${res.status}: ${body.slice(0, 500)}` };
  }

  const data = await res.json();
  const text: string = data.content?.[0]?.text ?? "";

  if (!text) {
    return { mapped: {}, debug: `Empty AI response. Full payload: ${JSON.stringify(data).slice(0, 500)}` };
  }

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    return { mapped: {}, debug: `No JSON array in AI response: ${text.slice(0, 300)}` };
  }

  try {
    const arr = JSON.parse(jsonMatch[0]) as Array<{ i: number; r: string; c?: string }>;
    const validCodes = new Set(Object.keys(regions));
    const mapped: Record<string, { region: string; city: string }> = {};
    for (const item of arr) {
      const company = companies[item.i];
      if (company && item.r && item.r !== "unknown" && validCodes.has(item.r)) {
        mapped[company.id] = { region: item.r, city: item.c ?? "" };
      }
    }
    return { mapped };
  } catch (e) {
    return { mapped: {}, debug: `JSON parse error: ${e}. Raw: ${jsonMatch[0].slice(0, 300)}` };
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

    const { mapped, debug } = await askRegions(companies, country, regions);

    return new Response(JSON.stringify({ results: mapped, debug }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
