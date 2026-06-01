import { regionFromCity } from "./frenchCityToRegion";
import { idbGet, idbSet } from "./idb";
import type { CountryCode } from "./countryConfig";

export interface WonDeal {
  companyId: string;
  companyName: string;
  country: string;
  market: string;
  sector: string;
  totalActualMrr: number;
  totalCmrr: number;
  seats: number;
  leadProvenance: string;
  partnerName: string;
  planName: string;
  convertedAt: string;
  dealClosedDate: string;
  companyOwner: string;
  hubspotTeam: string;
  regionCode: string; // computed for FR, "unknown" otherwise
  city: string; // enriched later
}

const STORAGE_KEY = "pre-event-csv-v1";
const UPLOAD_META_KEY = "pre-event-csv-meta-v1";

export interface CsvMeta {
  uploadedAt: string;
  fileName: string;
  totalRows: number;
  countries: Record<string, number>;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function parseNum(s: string | undefined): number {
  if (!s || s === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function parseCsv(text: string): WonDeal[] {
  const clean = text.replace(/^﻿/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const idx = (name: string) => headers.indexOf(name);

  const iCompanyId = idx("company_id");
  const iCompanyName = idx("company_name");
  const iCountry = idx("country");
  const iMarket = idx("market");
  const iSector = idx("sector");
  const iMrr = idx("total_actual_mrr");
  const iCmrr = idx("total_cmrr");
  const iSeats = idx("seats");
  const iLead = idx("lead_provenance");
  const iPartner = idx("partner_name");
  const iPlan = idx("plan_name");
  const iConverted = idx("converted_at");
  const iClosed = idx("deal_closed_date");
  const iOwner = idx("company_owner");
  const iTeam = idx("hubspot_team");

  if (iCompanyName === -1) throw new Error("CSV: column 'company_name' not found");

  const seen = new Set<string>();
  const deals: WonDeal[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const companyId = (cells[iCompanyId] ?? "").trim();
    const companyName = (cells[iCompanyName] ?? "").trim();
    if (!companyName) continue;

    const key = companyId || companyName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const country = (cells[iCountry] ?? "").trim().toLowerCase();

    deals.push({
      companyId: companyId || `gen-${i}`,
      companyName,
      country,
      market: (cells[iMarket] ?? "").trim(),
      sector: (cells[iSector] ?? "").trim(),
      totalActualMrr: parseNum(cells[iMrr]),
      totalCmrr: parseNum(cells[iCmrr]),
      seats: Math.round(parseNum(cells[iSeats])),
      leadProvenance: (cells[iLead] ?? "").trim(),
      partnerName: (cells[iPartner] ?? "").trim(),
      planName: (cells[iPlan] ?? "").trim(),
      convertedAt: (cells[iConverted] ?? "").trim(),
      dealClosedDate: (cells[iClosed] ?? "").trim(),
      companyOwner: (cells[iOwner] ?? "").trim(),
      hubspotTeam: (cells[iTeam] ?? "").trim(),
      regionCode: country === "fr" ? regionFromCity(null) : "unknown",
      city: "",
    });
  }

  return deals;
}

let _cache: WonDeal[] | null = null;

export function readDeals(): WonDeal[] {
  return _cache ?? [];
}

export function writeDeals(deals: WonDeal[]) {
  _cache = deals;
  idbSet(STORAGE_KEY, deals).catch(() => {});
}

export async function loadDeals(): Promise<WonDeal[]> {
  if (_cache && _cache.length > 0) return _cache;
  const stored = await idbGet<WonDeal[]>(STORAGE_KEY);
  _cache = stored ?? [];
  return _cache;
}

export function readMeta(): CsvMeta | null {
  try {
    const raw = window.localStorage.getItem(UPLOAD_META_KEY);
    return raw ? (JSON.parse(raw) as CsvMeta) : null;
  } catch {
    return null;
  }
}

export function writeMeta(meta: CsvMeta) {
  try {
    window.localStorage.setItem(UPLOAD_META_KEY, JSON.stringify(meta));
  } catch { /* quota */ }
}

export function mergeDeals(existing: WonDeal[], incoming: WonDeal[]): { merged: WonDeal[]; newCount: number } {
  const map = new Map(existing.map((d) => [d.companyId, d]));
  let newCount = 0;
  for (const d of incoming) {
    if (!map.has(d.companyId)) {
      newCount++;
      map.set(d.companyId, d);
    } else {
      const old = map.get(d.companyId)!;
      map.set(d.companyId, {
        ...d,
        regionCode: old.regionCode !== "unknown" ? old.regionCode : d.regionCode,
        city: old.city || d.city,
      });
    }
  }
  return { merged: Array.from(map.values()), newCount };
}

export function dealsByCountry(deals: WonDeal[], country: string): WonDeal[] {
  return deals.filter((d) => d.country === country.toLowerCase());
}

export function countryStats(deals: WonDeal[]): Record<string, { count: number; mrr: number }> {
  const stats: Record<string, { count: number; mrr: number }> = {};
  for (const d of deals) {
    const c = d.country || "unknown";
    if (!stats[c]) stats[c] = { count: 0, mrr: 0 };
    stats[c].count += 1;
    stats[c].mrr += d.totalActualMrr;
  }
  return stats;
}

export type RegionCode =
  | "11" | "24" | "27" | "28" | "32" | "44" | "52"
  | "53" | "75" | "76" | "84" | "93" | "94";

export const REGIONS: { code: RegionCode; name: string }[] = [
  { code: "11", name: "Île-de-France" },
  { code: "24", name: "Centre-Val de Loire" },
  { code: "27", name: "Bourgogne-Franche-Comté" },
  { code: "28", name: "Normandie" },
  { code: "32", name: "Hauts-de-France" },
  { code: "44", name: "Grand Est" },
  { code: "52", name: "Pays de la Loire" },
  { code: "53", name: "Bretagne" },
  { code: "75", name: "Nouvelle-Aquitaine" },
  { code: "76", name: "Occitanie" },
  { code: "84", name: "Auvergne-Rhône-Alpes" },
  { code: "93", name: "Provence-Alpes-Côte d'Azur" },
  { code: "94", name: "Corse" },
];

export function regionName(code: string): string {
  return REGIONS.find((r) => r.code === code)?.name ?? code;
}

export function formatEUR(n: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}
