import { supa } from "./cloudStore";

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

export const STRATEGY_EMAILS = [
  "lucas.siroo@factorial.co",
  "albert.fernandez@factorial.co",
  "marc.macia@factorial.co",
];

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

  await supa.from("strategy_companies").delete().neq("id", 0);

  let inserted = 0;
  let errors = 0;
  const BATCH = 500;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map((r) => ({
      hubspot_company_id: r.hubspot_company_id ?? "",
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
      // New fields from Starburst query
      has_demo: parseBool(r.has_demo),
      is_won: parseBool(r.is_won),
      is_active_client: parseBool(r.is_active_client),
      provenance_norm: r.provenance_norm ?? null,
      size_segment: r.size_segment ?? null,
      ccaa: r.ccaa ?? null,
    }));

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

export async function importSasorCsv(
  rows: Record<string, string>[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ inserted: number; errors: number }> {
  if (!supa) return { inserted: 0, errors: 0 };

  const { resolveCCAA } = await import("./strategyCCAA");
  const { standardIndustry } = await import("./strategyNormalize");

  await supa.from("strategy_sasor").delete().neq("id", 0);

  // Deduplicate by company_id (SASOR has one row per company already, but just in case)
  const seen = new Set<string>();
  const deduped = rows.filter((r) => {
    const id = r.company_id ?? r.hubspot_company_id ?? "";
    if (seen.has(id) && id) return false;
    if (id) seen.add(id);
    return true;
  });

  let inserted = 0;
  let errors = 0;
  const BATCH = 500;

  for (let i = 0; i < deduped.length; i += BATCH) {
    const batch = deduped.slice(i, i + BATCH).map((r) => {
      // Support both SASOR column names and generic names
      const name =
        r.property_name ?? r.property_company_legal_name ?? r.company_name ?? r.nombre ?? "";
      const city =
        r.property_city ?? r.ciudad ?? r.city ?? "";
      const rawIndustry =
        r.property_industry ?? r.industria ?? r.sector ?? "";
      const rawEmployees =
        r.property_numberofemployees ?? r.employees ?? r.empleados ?? "0";
      const employees = parseInt(rawEmployees, 10) || 0;
      const hubspotId =
        r.company_id ?? r.hubspot_company_id ?? "";

      // Resolve CCAA from city
      const ccaaResult = resolveCCAA(city);
      const ccaa = ccaaResult.ccaa === "Unknown" ? "Others" : ccaaResult.ccaa;

      // Normalize industry
      const sector = standardIndustry(rawIndustry);

      // Compute size segment
      let size_segment = "Unknown";
      if (employees >= 1   && employees <= 50)  size_segment = "S (1-50)";
      else if (employees >= 51  && employees <= 200) size_segment = "M (51-200)";
      else if (employees >= 201 && employees <= 500) size_segment = "L (201-500)";
      else if (employees > 500)                      size_segment = "XL (500+)";

      return {
        hubspot_company_id: hubspotId,
        company_name: name,
        sector,
        size_segment,
        ccaa,
        employees,
        city,
      };
    });

    const { error } = await supa.from("strategy_sasor").insert(batch);
    if (error) {
      console.error("sasor batch insert", error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
    }
    onProgress?.(i + batch.length, deduped.length);
  }

  // Store total unique companies in meta
  await supa.from("strategy_meta").upsert({
    key: "sasor_total",
    value: String(deduped.length),
    updated_at: new Date().toISOString(),
  });

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
