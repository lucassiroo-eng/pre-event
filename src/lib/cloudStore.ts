// Shared-state layer on top of Supabase. Mirrors `csvStore.ts` (deals + meta)
// and `enrichmentStore.ts`, but persists to public Postgres tables so every
// user of the app sees the same wons + enrichment. localStorage stays as a
// per-user cache so the app still works offline / on first paint.

import { createClient } from "@supabase/supabase-js";
import type { WonDeal, CsvMeta } from "./csvStore";
import type { EnrichmentRecord } from "./enrichmentStore";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

export const cloudEnabled = !!(SUPABASE_URL && SUPABASE_ANON);

export const supa = cloudEnabled
  ? createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } })
  : null;

// ── deals ────────────────────────────────────────────────────────────────────
// snake_case row matching the SQL schema.
interface DealRow {
  company_id: string;
  company_name: string;
  country: string;
  market: string;
  sector: string;
  total_actual_mrr: number;
  total_cmrr: number;
  seats: number;
  lead_provenance: string;
  partner_name: string;
  plan_name: string;
  converted_at: string;
  deal_closed_date: string;
  company_owner: string;
  hubspot_team: string;
  region_code: string;
  city: string;
  nps: string | null;
  nps_score: number | null;
  nps_category: string;
  nps_date: string;
}

function rowToDeal(r: DealRow): WonDeal {
  return {
    companyId: r.company_id,
    companyName: r.company_name,
    country: r.country ?? "fr",
    market: r.market ?? "",
    sector: r.sector ?? "",
    totalActualMrr: Number(r.total_actual_mrr ?? 0),
    totalCmrr: Number(r.total_cmrr ?? 0),
    seats: Number(r.seats ?? 0),
    leadProvenance: r.lead_provenance ?? "",
    partnerName: r.partner_name ?? "",
    planName: r.plan_name ?? "",
    convertedAt: r.converted_at ?? "",
    dealClosedDate: r.deal_closed_date ?? "",
    companyOwner: r.company_owner ?? "",
    hubspotTeam: r.hubspot_team ?? "",
    regionCode: r.region_code ?? "unknown",
    city: r.city ?? "",
    nps: r.nps ?? null,
    npsScore: r.nps_score ?? null,
    npsCategory: r.nps_category ?? "",
    npsDate: r.nps_date ?? "",
  };
}

function dealToRow(d: WonDeal): DealRow {
  return {
    company_id: d.companyId,
    company_name: d.companyName,
    country: d.country,
    market: d.market ?? "",
    sector: d.sector ?? "",
    total_actual_mrr: d.totalActualMrr ?? 0,
    total_cmrr: d.totalCmrr ?? 0,
    seats: d.seats ?? 0,
    lead_provenance: d.leadProvenance ?? "",
    partner_name: d.partnerName ?? "",
    plan_name: d.planName ?? "",
    converted_at: d.convertedAt ?? "",
    deal_closed_date: d.dealClosedDate ?? "",
    company_owner: d.companyOwner ?? "",
    hubspot_team: d.hubspotTeam ?? "",
    region_code: d.regionCode ?? "unknown",
    city: d.city ?? "",
    nps: d.nps ?? null,
    nps_score: d.npsScore ?? null,
    nps_category: d.npsCategory ?? "",
    nps_date: d.npsDate ?? "",
  };
}

export async function cloudFetchDeals(): Promise<WonDeal[] | null> {
  if (!supa) return null;
  // Supabase has a 1000-row default limit per request — page through it.
  const PAGE = 1000;
  const all: DealRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supa
      .from("deals")
      .select("*")
      .range(from, from + PAGE - 1);
    if (error) {
      console.warn("[cloud] fetchDeals", error.message);
      return null;
    }
    if (!data || data.length === 0) break;
    all.push(...(data as DealRow[]));
    if (data.length < PAGE) break;
  }
  return all.map(rowToDeal);
}

export async function cloudUpsertDeals(deals: WonDeal[]): Promise<{ ok: boolean; error?: string }> {
  if (!supa || deals.length === 0) return { ok: false, error: "no client / empty" };
  const rows = deals.map(dealToRow);
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supa.from("deals").upsert(chunk, { onConflict: "company_id" });
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

// ── meta ─────────────────────────────────────────────────────────────────────
export async function cloudFetchMeta(): Promise<CsvMeta | null> {
  if (!supa) return null;
  const { data, error } = await supa.from("csv_meta").select("*").eq("id", 1).maybeSingle();
  if (error || !data) return null;
  return {
    uploadedAt: data.uploaded_at ?? "",
    fileName: data.file_name ?? "",
    totalRows: data.total_rows ?? 0,
    countries: data.countries ?? {},
  };
}

export async function cloudWriteMeta(m: CsvMeta): Promise<void> {
  if (!supa) return;
  await supa.from("csv_meta").upsert({
    id: 1,
    uploaded_at: m.uploadedAt,
    file_name: m.fileName,
    total_rows: m.totalRows,
    countries: m.countries,
  });
}

// ── enrichment ───────────────────────────────────────────────────────────────
interface EnrichRow {
  company_id: string;
  company_name: string | null;
  hubspot_id: string | null;
  hubspot_city: string | null;
  hubspot_zip: string | null;
  domain: string | null;
  nps: string | null;
  sirene_city: string | null;
  sirene_postal: string | null;
  sirene_siren: string | null;
  region_code: string;
  status: string;
  enriched_at: string | null;
  error: string | null;
}

function recordToRow(r: EnrichmentRecord): EnrichRow {
  return {
    company_id: r.companyId,
    company_name: r.companyName ?? null,
    hubspot_id: r.hubspotId,
    hubspot_city: r.hubspotCity,
    hubspot_zip: r.hubspotZip,
    domain: r.domain,
    nps: r.nps ?? null,
    sirene_city: r.sireneCity,
    sirene_postal: r.sirenePostal,
    sirene_siren: r.sireneSiren,
    region_code: r.regionCode,
    status: r.status,
    enriched_at: r.enrichedAt,
    error: r.error,
  };
}

function rowToRecord(r: EnrichRow): EnrichmentRecord {
  return {
    companyId: r.company_id,
    companyName: r.company_name ?? "",
    hubspotId: r.hubspot_id,
    hubspotCity: r.hubspot_city,
    hubspotZip: r.hubspot_zip,
    domain: r.domain,
    nps: r.nps,
    sireneCity: r.sirene_city,
    sirenePostal: r.sirene_postal,
    sireneSiren: r.sirene_siren,
    regionCode: r.region_code as any,
    status: r.status as any,
    enrichedAt: r.enriched_at,
    error: r.error,
  };
}

export async function cloudFetchEnrichment(): Promise<EnrichmentRecord[] | null> {
  if (!supa) return null;
  const PAGE = 1000;
  const all: EnrichRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supa
      .from("enrichment")
      .select("*")
      .range(from, from + PAGE - 1);
    if (error) {
      console.warn("[cloud] fetchEnrichment", error.message);
      return null;
    }
    if (!data || data.length === 0) break;
    all.push(...(data as EnrichRow[]));
    if (data.length < PAGE) break;
  }
  return all.map(rowToRecord);
}

// Best-effort: push a batch of enrichment records to the cloud. Never throws.
export async function cloudUpsertEnrichment(records: EnrichmentRecord[]): Promise<void> {
  if (!supa || records.length === 0) return;
  const rows = records.map(recordToRow);
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supa.from("enrichment").upsert(chunk, { onConflict: "company_id" });
    if (error) {
      console.warn("[cloud] upsertEnrichment", error.message);
      return;
    }
  }
}
