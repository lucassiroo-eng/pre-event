import { supa } from "./cloudStore";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

async function runWithConcurrency<T>(
  items: T[], fn: (item: T) => Promise<void>,
  concurrency: number, cancelRef: { current: boolean },
) {
  const queue = [...items];
  let inFlight = 0;
  await new Promise<void>((resolve) => {
    function next() {
      while (inFlight < concurrency && queue.length > 0 && !cancelRef.current) {
        const item = queue.shift()!;
        inFlight++;
        fn(item).finally(() => { inFlight--; if (queue.length === 0 && inFlight === 0) resolve(); else next(); });
      }
      if ((queue.length === 0 || cancelRef.current) && inFlight === 0) resolve();
    }
    next();
  });
}

export interface StrategyCompany {
  id: number;
  hubspot_company_id: string;
  product_company_id: string;
  company_name: string;
  stage: string;
  pipeline: string;
  country: string;
  ciudad: string;
  codigo_postal: string;
  industria: string;
  empresa_size: number;
  provenance: string;
  close_date: string | null;
  after_demo_date: string | null;
  deal_after_demo_date: string | null;
  ciudad_enriched: string | null;
  tipo_empresa: string;
  partner_object_name: string;
  plan: string;
  plan_name: string;
  addons: string;
  item_names: string;
  cmrr: number;
  sub_id_status: string;
  sector: string;
  total_seats: number;
  lead_provenance: string;
  deal_closed_date: string;
  conversion: string;
  // Pre-computed by Starburst query (new CSV format)
  has_demo: boolean | null;
  is_won: boolean | null;
  is_active_client: boolean | null;
  provenance_norm: string | null;
  size_segment: string | null;
  ccaa: string | null;
}

// Strategy tab is open to all *@factorial.co users
export const STRATEGY_EMAILS: string[] = [];

export async function clearStrategyData(): Promise<void> {
  if (!supa) return;
  await supa.from("strategy_companies").delete().neq("id", 0);
}

export async function fetchStrategyCompanies(): Promise<StrategyCompany[]> {
  if (!supa) return [];
  const all: StrategyCompany[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supa
      .from("strategy_companies")
      .select("*")
      .order("cmrr", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) { console.error("strategy fetch", error); break; }
    if (!data || data.length === 0) break;
    all.push(...(data as StrategyCompany[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export async function fetchSasorTotal(): Promise<number> {
  if (!supa) return 0;
  const { data } = await supa
    .from("strategy_meta")
    .select("value")
    .eq("key", "sasor_total")
    .single();
  return data ? parseInt(data.value, 10) || 0 : 0;
}

// Breakdown: { byCcaa: { "Cataluña": 12000 }, bySize: { "S (1-50)": 60000 }, bySector, byCcaaBySize, byCcaaBySector }
export interface SasorBreakdown {
  byCcaa: Record<string, number>;
  bySize: Record<string, number>;
  bySector: Record<string, number>;
  byCcaaBySize: Record<string, Record<string, number>>;
  byCcaaBySector: Record<string, Record<string, number>>;
}

// Try reading precomputed breakdown from meta first; fall back to fetching all rows.
export async function fetchSasorBreakdown(): Promise<SasorBreakdown | null> {
  if (!supa) return null;

  // Try cached
  const { data: cached } = await supa
    .from("strategy_meta")
    .select("value")
    .eq("key", "sasor_breakdown")
    .single();
  if (cached?.value) {
    try { return JSON.parse(cached.value) as SasorBreakdown; } catch { /* fall through */ }
  }

  // Fetch all rows (only 2 columns — manageable for 95k rows)
  const PAGE = 1000;
  const byCcaa: Record<string, number> = {};
  const bySize: Record<string, number> = {};
  let from = 0;
  while (true) {
    const { data, error } = await supa
      .from("strategy_sasor")
      .select("ccaa, size_segment")
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    for (const r of data) {
      const c = r.ccaa || "Others";
      const s = r.size_segment || "Unknown";
      byCcaa[c] = (byCcaa[c] ?? 0) + 1;
      bySize[s] = (bySize[s] ?? 0) + 1;
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const breakdown: SasorBreakdown = { byCcaa, bySize, bySector: {}, byCcaaBySize: {}, byCcaaBySector: {} };

  // Cache it in meta for future loads
  await supa.from("strategy_meta").upsert({
    key: "sasor_breakdown",
    value: JSON.stringify(breakdown),
    updated_at: new Date().toISOString(),
  });

  return breakdown;
}

function safeTs(v: string): string | null {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v;
  return null;
}

function parseBool(v: string | undefined): boolean | null {
  if (!v) return null;
  return v === "true" || v === "1" || v === "TRUE";
}

export async function importStrategyCsv(
  rows: Record<string, string>[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ inserted: number; errors: number }> {
  if (!supa) return { inserted: 0, errors: 0 };

  // Fetch existing enrichment data to preserve it across re-imports
  const { data: existing } = await supa
    .from("strategy_companies")
    .select("hubspot_company_id, ciudad_enriched, enriched_source, enriched_at");
  const enrichmentMap = new Map(
    (existing ?? [])
      .filter((r) => r.ciudad_enriched)
      .map((r) => [r.hubspot_company_id, {
        ciudad_enriched: r.ciudad_enriched,
        enriched_source: r.enriched_source,
        enriched_at: r.enriched_at,
      }])
  );

  await supa.from("strategy_companies").delete().neq("id", 0);

  let inserted = 0;
  let errors = 0;
  const BATCH = 500;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map((r) => {
      const hsId = r.hubspot_company_id ?? "";
      const saved = enrichmentMap.get(hsId);
      return {
        hubspot_company_id: hsId,
        product_company_id: r.product_company_id ?? "",
        company_name: r.company_name ?? "",
        stage: r.stage ?? "",
        pipeline: r.pipeline ?? "",
        country: r.country ?? "",
        ciudad: r.ciudad ?? "",
        codigo_postal: r.codigo_postal ?? "",
        industria: r.industria ?? "",
        empresa_size: parseInt(r.empresa_size ?? "0", 10) || 0,
        provenance: r.provenance ?? "",
        close_date: safeTs(r.close_date ?? r.hs_close_date ?? ""),
        after_demo_date: safeTs(r.after_demo_date ?? ""),
        deal_after_demo_date: safeTs(r.deal_after_demo_date ?? ""),
        tipo_empresa: r.tipo_empresa ?? "",
        partner_object_name: r.partner_object_name ?? r.deal_partner_name ?? "",
        plan: r.plan ?? "",
        plan_name: r.plan_name ?? "",
        addons: r.addons ?? "",
        item_names: r.item_names ?? "",
        cmrr: parseFloat(r.cmrr ?? "0") || 0,
        sub_id_status: r.sub_id_status ?? "",
        sector: r.sector ?? "",
        total_seats: parseInt(r.total_seats ?? "0", 10) || 0,
        lead_provenance: r.lead_provenance ?? r.finance_lead_provenance ?? "",
        deal_closed_date: r.deal_closed_date ?? r.finance_deal_closed_date ?? "",
        conversion: (r.conversion ?? r["conversion\r"] ?? "").trim(),
        has_demo: parseBool(r.has_demo),
        is_won: parseBool(r.is_won),
        is_active_client: parseBool(r.is_active_client),
        provenance_norm: r.provenance_norm ?? null,
        size_segment: r.size_segment ?? null,
        ccaa: r.ccaa ?? null,
        // Preserve enrichment from previous imports/GitHub Actions runs
        ciudad_enriched: saved?.ciudad_enriched ?? null,
        enriched_source: saved?.enriched_source ?? null,
        enriched_at: saved?.enriched_at ?? null,
      };
    });

    const { error } = await supa.from("strategy_companies").insert(batch);
    if (error) {
      console.error("strategy batch insert", error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
    }
    onProgress?.(i + batch.length, rows.length);
  }

  return { inserted, errors };
}

// English CCAA names as used in Eduard's TAM CSV → Spanish canonical names
const TAM_CCAA_EN_TO_ES: Record<string, string> = {
  "COMMUNITY OF MADRID":   "Comunidad de Madrid",
  "CATALONIA":             "Cataluña",
  "ANDALUSIA":             "Andalucía",
  "VALENCIAN COMMUNITY":   "Comunidad Valenciana",
  "BASQUE COUNTRY":        "País Vasco",
  "GALICIA":               "Galicia",
  "CANARY ISLANDS":        "Canarias",
  "CASTILE AND LEON":      "Castilla y León",
  "REGION OF MURCIA":      "Región de Murcia",
  "CASTILE-LA MANCHA":     "Castilla-La Mancha",
  "ARAGON":                "Aragón",
  "BALEARIC ISLANDS":      "Islas Baleares",
  "ASTURIAS":              "Principado de Asturias",
  "NAVARRE":               "Comunidad Foral de Navarra",
  "EXTREMADURA":           "Extremadura",
  "CANTABRIA":             "Cantabria",
  "LA RIOJA":              "La Rioja",
  "CEUTA":                 "Ceuta",
  "MELILLA":               "Melilla",
};

function normTamCcaa(raw: string, city: string, resolveFn: (c: string) => { ccaa: string }): string {
  const upper = (raw ?? "").trim().toUpperCase();
  // Direct English→Spanish match (Eduard's TAM format)
  if (upper && TAM_CCAA_EN_TO_ES[upper]) return TAM_CCAA_EN_TO_ES[upper];
  // Already in Spanish (old format or manual entry)
  if (raw && raw.trim()) return raw.trim();
  // Last resort: resolve from city
  const resolved = resolveFn(city);
  return resolved.ccaa === "Unknown" ? "Others" : resolved.ccaa;
}

function tamSizeSegment(employees: number): string {
  if (employees >= 1   && employees <= 19)  return "XS (1-19)";
  if (employees >= 20  && employees <= 50)  return "S (20-50)";
  if (employees >= 51  && employees <= 200) return "M (51-200)";
  if (employees >= 201 && employees <= 500) return "L (201-500)";
  if (employees > 500)                      return "XL (500+)";
  return "Unknown";
}

export async function importSasorCsv(
  rows: Record<string, string>[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ inserted: number; errors: number }> {
  if (!supa) return { inserted: 0, errors: 0 };

  const { resolveCCAA } = await import("./strategyCCAA");
  const { cnaeToSector, hubspotToSector } = await import("./sectorMap");

  const { error: delErr } = await supa.from("strategy_sasor").delete().neq("id", 0);
  if (delErr) throw new Error(`No se pudo limpiar la tabla TAM: ${delErr.message}`);

  // Deduplicate by company_id
  const seen = new Set<string>();
  const deduped = rows.filter((r) => {
    const id = r.company_id ?? r.hubspot_company_id ?? "";
    if (seen.has(id) && id) return false;
    if (id) seen.add(id);
    return true;
  });

  // Pre-compute breakdown (same pass as insert to avoid double iteration)
  const byCcaa: Record<string, number> = {};
  const bySize: Record<string, number> = {};
  const bySector: Record<string, number> = {};
  const byCcaaBySize: Record<string, Record<string, number>> = {};
  const byCcaaBySector: Record<string, Record<string, number>> = {};

  let inserted = 0;
  let errors = 0;
  const BATCH = 500;

  for (let i = 0; i < deduped.length; i += BATCH) {
    const batch = deduped.slice(i, i + BATCH).map((r) => {
      const name      = r.property_name ?? r.property_company_legal_name ?? r.company_name ?? r.nombre ?? "";
      const city      = r.MUNICIPIO ?? r.property_city ?? r.ciudad ?? r.city ?? "";
      const hubspotId = r.company_id ?? r.hubspot_company_id ?? "";

      // CCAA: prefer direct column (100% filled in Eduard's TAM), fallback to city resolution
      const rawCcaa   = r.CCAA ?? r.ccaa ?? "";
      const ccaa      = normTamCcaa(rawCcaa, city, resolveCCAA);

      // Industry: prefer CNAE 4-digit (new TAM), fallback to property_industry string
      const rawCnae   = (r.CNAE ?? "").trim();
      const sector    = rawCnae
        ? cnaeToSector(rawCnae)
        : hubspotToSector(r.property_industry ?? r.industria ?? r.sector ?? "");

      // Size
      const rawEmp    = r.property_numberofemployees ?? r.employees ?? r.empleados ?? "0";
      const employees = parseInt(rawEmp, 10) || 0;
      const size_segment = tamSizeSegment(employees);

      // Accumulate breakdown
      byCcaa[ccaa]        = (byCcaa[ccaa] ?? 0) + 1;
      bySize[size_segment] = (bySize[size_segment] ?? 0) + 1;
      bySector[sector]    = (bySector[sector] ?? 0) + 1;
      if (!byCcaaBySize[ccaa]) byCcaaBySize[ccaa] = {};
      byCcaaBySize[ccaa][size_segment] = (byCcaaBySize[ccaa][size_segment] ?? 0) + 1;
      if (!byCcaaBySector[ccaa]) byCcaaBySector[ccaa] = {};
      byCcaaBySector[ccaa][sector] = (byCcaaBySector[ccaa][sector] ?? 0) + 1;

      return { hubspot_company_id: hubspotId, company_name: name, sector, size_segment, ccaa, employees };
    });

    const { error } = await supa.from("strategy_sasor").insert(batch);
    if (error) {
      // Throw on first batch so the real Supabase error is visible to the user
      throw new Error(`Supabase insert error: ${error.message} (code: ${error.code})`);
    }
    inserted += batch.length;
    onProgress?.(i + batch.length, deduped.length);
  }

  // Cache breakdown in meta so fetchSasorBreakdown() returns it instantly
  await Promise.all([
    supa.from("strategy_meta").upsert({ key: "sasor_total",     value: String(deduped.length),          updated_at: new Date().toISOString() }),
    supa.from("strategy_meta").upsert({ key: "sasor_breakdown", value: JSON.stringify({ byCcaa, bySize, bySector, byCcaaBySize, byCcaaBySector }), updated_at: new Date().toISOString() }),
  ]);

  return { inserted, errors };
}

// Cross-enrich CCAA between HubSpot and SASOR using shared hubspot_company_id.
// Direction 1: SASOR city → strategy_companies.ciudad_enriched (for HS companies with no city)
// Direction 2: HS ciudad/zip → strategy_sasor.ccaa (for SASOR rows with ccaa=Others)
export async function crossEnrichCcaa(
  onProgress?: (msg: string) => void,
): Promise<{ hsUpdated: number; sasorUpdated: number }> {
  if (!supa) return { hsUpdated: 0, sasorUpdated: 0 };

  const { resolveCCAA } = await import("./strategyCCAA");

  // ── Direction 1: SASOR city → HubSpot companies missing ciudad ──────────────
  onProgress?.("Leyendo empresas sin ciudad...");

  const { data: hsMissing } = await supa
    .from("strategy_companies")
    .select("id, hubspot_company_id")
    .or("ciudad.is.null,ciudad.eq.")
    .or("ciudad_enriched.is.null,ciudad_enriched.eq.");

  const { data: sasorCities } = await supa
    .from("strategy_sasor")
    .select("hubspot_company_id, city")
    .not("city", "is", null)
    .neq("city", "");

  const sasorCityMap = new Map<string, string>(
    (sasorCities ?? [])
      .filter((r) => r.hubspot_company_id && r.city)
      .map((r) => [r.hubspot_company_id, r.city]),
  );

  const hsBatch: { id: number; ciudad_enriched: string }[] = [];
  for (const company of hsMissing ?? []) {
    const city = sasorCityMap.get(company.hubspot_company_id);
    if (city) hsBatch.push({ id: company.id, ciudad_enriched: city });
  }

  onProgress?.(`Actualizando ${hsBatch.length} empresas HS desde SASOR...`);
  const CHUNK = 200;
  let hsUpdated = 0;
  for (let i = 0; i < hsBatch.length; i += CHUNK) {
    const chunk = hsBatch.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map((r) =>
        supa!.from("strategy_companies").update({
          ciudad_enriched: r.ciudad_enriched,
          enriched_source: "sasor_cross",
          enriched_at: new Date().toISOString(),
        }).eq("id", r.id),
      ),
    );
    hsUpdated += chunk.length;
    onProgress?.(`HS: ${hsUpdated}/${hsBatch.length}`);
  }

  // ── Direction 2: HS ciudad/zip → SASOR rows missing ccaa ────────────────────
  onProgress?.("Leyendo SASOR sin CCAA...");

  const { data: sasorMissing } = await supa
    .from("strategy_sasor")
    .select("id, hubspot_company_id")
    .or("ccaa.is.null,ccaa.eq.Others,ccaa.eq.");

  const { data: hsWithCity } = await supa
    .from("strategy_companies")
    .select("hubspot_company_id, ciudad, ciudad_enriched, codigo_postal");

  const hsCityMap = new Map<string, { ciudad: string; zip: string }>(
    (hsWithCity ?? []).map((r) => [
      r.hubspot_company_id,
      { ciudad: r.ciudad_enriched || r.ciudad || "", zip: r.codigo_postal || "" },
    ]),
  );

  const sasorBatch: { id: number; ccaa: string }[] = [];
  for (const row of sasorMissing ?? []) {
    const hs = hsCityMap.get(row.hubspot_company_id);
    if (!hs) continue;
    const resolved = resolveCCAA(hs.ciudad || hs.zip);
    if (resolved.ccaa !== "Unknown") sasorBatch.push({ id: row.id, ccaa: resolved.ccaa });
  }

  onProgress?.(`Actualizando ${sasorBatch.length} filas SASOR desde HS...`);
  let sasorUpdated = 0;
  for (let i = 0; i < sasorBatch.length; i += CHUNK) {
    const chunk = sasorBatch.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map((r) =>
        supa!.from("strategy_sasor").update({ ccaa: r.ccaa }).eq("id", r.id),
      ),
    );
    sasorUpdated += chunk.length;
    onProgress?.(`SASOR: ${sasorUpdated}/${sasorBatch.length}`);
  }

  return { hsUpdated, sasorUpdated };
}

// ── Browser-side CCAA enrichment ──────────────────────────────────────────────

export interface EnrichCcaaProgress {
  stage: string; done: number; total: number; updated: number; errors: number;
}

async function fetchMissingCcaa(table: "strategy_companies" | "strategy_sasor") {
  if (!supa) return [];
  const all: { id: number; company_name: string }[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supa
      .from(table)
      .select("id, company_name")
      .or("ccaa.is.null,ccaa.eq.,ccaa.eq.Others")
      .order("id")
      .range(from, from + 999);
    if (error || !data || data.length === 0) break;
    all.push(...(data as { id: number; company_name: string }[]));
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

// Quick count of how many are missing CCAA in each table
export async function fetchCcaaGapStats(): Promise<{ hs: number; sasor: number }> {
  if (!supa) return { hs: 0, sasor: 0 };
  const [r1, r2] = await Promise.all([
    supa.from("strategy_companies").select("*", { count: "exact", head: true }).or("ccaa.is.null,ccaa.eq.,ccaa.eq.Others"),
    supa.from("strategy_sasor").select("*", { count: "exact", head: true }).or("ccaa.is.null,ccaa.eq.,ccaa.eq.Others"),
  ]);
  return { hs: r1.count ?? 0, sasor: r2.count ?? 0 };
}

// Step 1 (HubSpot only): call hubspot-lookup edge function by company name → city → resolveCCAA
export async function enrichHsCcaaViaHubspot(
  onProgress?: (p: EnrichCcaaProgress) => void,
  cancelRef: { current: boolean } = { current: false },
): Promise<{ updated: number; errors: number }> {
  if (!supa || !SUPABASE_URL) return { updated: 0, errors: 0 };
  const { resolveCCAA } = await import("./strategyCCAA");

  const missing = await fetchMissingCcaa("strategy_companies");
  let updated = 0, errors = 0, done = 0;
  const total = missing.length;
  onProgress?.({ stage: "HubSpot API", done: 0, total, updated: 0, errors: 0 });

  const BATCH = 25;
  const chunks: typeof missing[] = [];
  for (let i = 0; i < missing.length; i += BATCH) chunks.push(missing.slice(i, i + BATCH));

  await runWithConcurrency(chunks, async (batch) => {
    if (cancelRef.current) return;
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/hubspot-lookup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_ANON}` },
        body: JSON.stringify({ names: batch.map((c) => c.company_name) }),
      });
      if (res.ok) {
        const data = await res.json() as { results: Array<{ query: string; found: boolean; city: string | null; zip: string | null }> };
        await Promise.allSettled(data.results.map(async (hit) => {
          const company = batch.find((c) => c.company_name === hit.query);
          if (!company || !hit.found) return;
          const raw = hit.city || hit.zip || "";
          if (!raw) return;
          const { ccaa } = resolveCCAA(raw);
          if (ccaa === "Unknown") return;
          const { error } = await supa!.from("strategy_companies").update({
            ccaa,
            ciudad_enriched: raw,
            enriched_source: "hubspot_browser",
            enriched_at: new Date().toISOString(),
          }).eq("id", company.id);
          if (!error) updated++; else errors++;
        }));
      }
    } catch { errors++; }
    done += batch.length;
    onProgress?.({ stage: "HubSpot API", done: Math.min(done, total), total, updated, errors });
  }, 10, cancelRef);

  return { updated, errors };
}

// Step 2: ai-region-lookup for HubSpot or TAM companies still missing CCAA
export async function enrichCcaaViaAI(
  table: "strategy_companies" | "strategy_sasor",
  onProgress?: (p: EnrichCcaaProgress) => void,
  cancelRef: { current: boolean } = { current: false },
): Promise<{ updated: number; errors: number }> {
  if (!supa || !SUPABASE_URL) return { updated: 0, errors: 0 };
  const { CCAA_LIST } = await import("./strategyCCAA");
  const regions = CCAA_LIST.filter((c) => c !== "Unknown" && c !== "Others");

  const missing = await fetchMissingCcaa(table);
  let updated = 0, errors = 0, done = 0;
  const total = missing.length;
  const stage = table === "strategy_companies" ? "AI · HubSpot" : "AI · TAM";
  onProgress?.({ stage, done: 0, total, updated: 0, errors: 0 });

  const BATCH = 20;
  const chunks: typeof missing[] = [];
  for (let i = 0; i < missing.length; i += BATCH) chunks.push(missing.slice(i, i + BATCH));

  for (const batch of chunks) {
    if (cancelRef.current) break;
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-region-lookup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_ANON}` },
        body: JSON.stringify({
          companies: batch.map((c) => ({ id: String(c.id), name: c.company_name })),
          country: "Spain",
          regions,
        }),
      });
      if (res.ok) {
        const data = await res.json() as { results: Record<string, { region: string; city: string }> };
        await Promise.allSettled(Object.entries(data.results).map(async ([idStr, hit]) => {
          if (!hit.region || hit.region === "unknown") return;
          const id = parseInt(idStr, 10);
          const extra: Record<string, string> = {};
          if (table === "strategy_companies" && hit.city) {
            extra.ciudad_enriched = hit.city;
            extra.enriched_source = "ai_browser";
            extra.enriched_at = new Date().toISOString();
          }
          const { error } = await supa!.from(table).update({ ccaa: hit.region, ...extra }).eq("id", id);
          if (!error) updated++; else errors++;
        }));
      }
    } catch { errors++; }
    done += batch.length;
    onProgress?.({ stage, done: Math.min(done, total), total, updated, errors });
  }

  return { updated, errors };
}
