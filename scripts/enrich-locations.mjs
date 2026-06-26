#!/usr/bin/env node
/**
 * Location enrichment for strategy_companies rows missing ciudad.
 *
 * Tier 1 — HubSpot batch API: pull city/state/zip for companies that have
 *           a hubspot_company_id. Fast, free, ~100 per request.
 *
 * Tier 2 — AI (Haiku via Azure): DuckDuckGo search + Haiku extraction for
 *           companies still missing location after Tier 1.
 *
 * Env required:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   HUBSPOT_TOKEN
 *   AZURE_CONFIG  →  "endpoint|model|key"
 */

import { createClient } from "@supabase/supabase-js";

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;

const [AZURE_ENDPOINT, AZURE_MODEL, AZURE_KEY] = (
  process.env.AZURE_CONFIG ?? ""
).split("|");

const DRY_RUN = process.env.DRY_RUN === "1";
const TIER = process.env.TIER ?? "both"; // "1" | "2" | "both"
const LIMIT = parseInt(process.env.LIMIT ?? "0", 10); // 0 = no limit (all)

if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY");

const supa = createClient(SUPABASE_URL, SUPABASE_KEY);

// Azure AI Foundry requires ?api-version and Bearer auth — use fetch directly
// Use URL constructor so leading slash replaces path cleanly regardless of endpoint suffix
const AZURE_MESSAGES_URL = AZURE_ENDPOINT
  ? new URL("/anthropic/v1/messages?api-version=2025-01-01-preview", AZURE_ENDPOINT).href
  : null;

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(msg) {
  process.stdout.write(`[${new Date().toISOString().slice(11, 19)}] ${msg}\n`);
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function fetchUnresolved() {
  let query = supa
    .from("strategy_companies")
    .select("id, hubspot_company_id, company_name, ciudad, industria")
    .is("ciudad_enriched", null)
    .or("ciudad.is.null,ciudad.eq.");

  if (LIMIT > 0) query = query.limit(LIMIT);

  const { data, error } = await query;
  if (error) throw new Error(`Supabase fetch: ${error.message}`);
  return data ?? [];
}

async function saveCity(id, city, source) {
  if (DRY_RUN) {
    log(`  [DRY] id=${id} city="${city}" source=${source}`);
    return;
  }
  const { error } = await supa
    .from("strategy_companies")
    .update({
      ciudad_enriched: city,
      enriched_source: source,
      enriched_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) log(`  WARN save failed id=${id}: ${error.message}`);
}

// ── Tier 1: HubSpot ───────────────────────────────────────────────────────────

async function hubspotBatch(ids) {
  const res = await fetch(
    "https://api.hubapi.com/crm/v3/objects/companies/batch/read",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HUBSPOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: ids.map((id) => ({ id })),
        properties: ["city", "state", "zip", "country"],
      }),
    }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HubSpot ${res.status}: ${txt.slice(0, 200)}`);
  }
  const json = await res.json();
  return json.results ?? [];
}

async function runTier1(companies) {
  const withHsId = companies.filter((c) => c.hubspot_company_id);
  log(`Tier 1 — HubSpot: ${withHsId.length} companies with HS ID`);

  if (!HUBSPOT_TOKEN) {
    log("  SKIP: HUBSPOT_TOKEN not set");
    return { updated: 0, remaining: companies };
  }

  const BATCH = 100;
  let updated = 0;
  const resolvedIds = new Set();

  for (let i = 0; i < withHsId.length; i += BATCH) {
    const batch = withHsId.slice(i, i + BATCH);
    const hsIds = batch.map((c) => c.hubspot_company_id);

    try {
      const results = await hubspotBatch(hsIds);
      const byId = new Map(results.map((r) => [r.id, r.properties]));

      for (const company of batch) {
        const props = byId.get(company.hubspot_company_id);
        if (!props) continue;

        // Prefer city → state → zip (zip alone gives us enough for CCAA)
        const city = [props.city, props.state, props.zip]
          .map((v) => (v ?? "").trim())
          .find((v) => v.length > 0);

        if (city) {
          await saveCity(company.id, city, "hubspot");
          resolvedIds.add(company.id);
          updated++;
        }
      }
    } catch (e) {
      log(`  WARN batch ${i}: ${e.message}`);
    }

    log(
      `  HubSpot progress: ${Math.min(i + BATCH, withHsId.length)}/${withHsId.length} (${updated} updated)`
    );
    await sleep(150); // HubSpot: max 10 req/s
  }

  const remaining = companies.filter((c) => !resolvedIds.has(c.id));
  log(`Tier 1 done — ${updated} updated, ${remaining.length} remaining`);
  return { updated, remaining };
}

// ── Tier 2: AI (DDG search + Haiku extract) ───────────────────────────────────

async function duckduckgoSearch(query) {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (compatible; enrichment-bot/1.0)",
        Accept: "text/html",
      },
    });
    if (!res.ok) return "";
    const html = await res.text();

    // Extract result snippets from DDG HTML
    const snippets = [];
    for (const m of html.matchAll(
      /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
    )) {
      const text = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (text) snippets.push(text);
      if (snippets.length >= 5) break;
    }
    return snippets.join(" | ");
  } catch {
    return "";
  }
}

async function extractCityWithAI(companyName, industry) {
  if (!AZURE_MESSAGES_URL || !AZURE_KEY) return null;
  try {
    const resp = await fetch(AZURE_MESSAGES_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${AZURE_KEY}`,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: AZURE_MODEL,
        max_tokens: 30,
        messages: [
          {
            role: "user",
            content: `Eres un experto en empresas españolas. Dada esta empresa, di en qué ciudad española está ubicada.

Empresa: "${companyName}"${industry ? `\nSector: ${industry}` : ""}

Responde SOLO con el nombre de la ciudad española (ej: "Barcelona", "Madrid", "Valencia").
Si es una empresa muy genérica o no puedes determinarlo con certeza, responde exactamente: null`,
          },
        ],
      }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      log(`  WARN AI error: ${resp.status} ${body.slice(0, 120)}`);
      return null;
    }
    const data = await resp.json();
    const raw = data.content?.[0]?.text?.trim().replace(/^["']|["']$/g, "") ?? "";
    if (raw === "null" || raw === "" || raw.length > 50) return null;
    // Reject if it looks like a sentence instead of a city name
    if (raw.split(" ").length > 4) return null;
    return raw;
  } catch (e) {
    log(`  WARN AI error: ${e.message}`);
    return null;
  }
}

async function runTier2(companies) {
  log(`Tier 2 — AI (${AZURE_MODEL}): ${companies.length} companies`);

  if (!AZURE_MESSAGES_URL || !AZURE_KEY) {
    log("  SKIP: AZURE_CONFIG not set");
    return { updated: 0 };
  }

  let updated = 0;
  let notFound = 0;

  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];

    try {
      const city = await extractCityWithAI(company.company_name, company.industria ?? "");

      if (city) {
        await saveCity(company.id, city, "ai");
        updated++;
        log(`  ✓ [${i + 1}/${companies.length}] ${company.company_name} → ${city}`);
      } else {
        notFound++;
      }
    } catch (e) {
      log(`  ERR ${company.company_name}: ${e.message}`);
    }

    if ((i + 1) % 100 === 0) {
      log(
        `  AI progress: ${i + 1}/${companies.length} | ✓ ${updated} | ✗ ${notFound}`
      );
    }

    // ~3 req/s — Azure rate limit is generous but avoid hammering
    await sleep(350);
  }

  log(`Tier 2 done — ${updated} updated, ${notFound} not found`);
  return { updated };
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  log(`Starting enrichment (TIER=${TIER}, LIMIT=${LIMIT || "all"}, DRY_RUN=${DRY_RUN})`);

  const companies = await fetchUnresolved();
  log(`Found ${companies.length} companies without location`);

  if (companies.length === 0) {
    log("Nothing to do.");
    return;
  }

  let t1Updated = 0;
  let t2Updated = 0;
  let remaining = companies;

  if (TIER === "1" || TIER === "both") {
    const r = await runTier1(companies);
    t1Updated = r.updated;
    remaining = r.remaining;
  }

  if (TIER === "2" || TIER === "both") {
    const r = await runTier2(remaining);
    t2Updated = r.updated;
  }

  log("─────────────────────────────────────");
  log(`Total resolved: ${t1Updated + t2Updated} / ${companies.length}`);
  log(`  HubSpot: ${t1Updated}`);
  log(`  AI:      ${t2Updated}`);
  log(`  Still missing: ${companies.length - t1Updated - t2Updated}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
