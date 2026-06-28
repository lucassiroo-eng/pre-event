import { hubspotToSector, SECTORS } from "./sectorMap";

export { SECTORS as STANDARD_INDUSTRIES };

export function standardIndustry(raw: string): string {
  return hubspotToSector(raw);
}

// Valid provenance values from HubSpot picklist. Anything else (plan names,
// misaligned CSV columns) goes to Others.
const VALID_PROVENANCES = new Set([
  "Inbound", "Outbound", "Partner", "Partners", "Paid", "Referral",
  "Direct", "Cold", "Event", "SDR", "AE", "Marketing", "Community",
]);

export function normProvenance(raw: string): string {
  if (!raw) return "Others";
  const s = raw.trim();
  if (s === "Partner" || s === "Partners") return "Partners";
  if (VALID_PROVENANCES.has(s)) return s;
  // Plan names leak into this field (e.g. "Time Tracking Business Yearly V0")
  if (s.length > 25 || /\d|yearly|monthly|business|tracking|v\d/i.test(s)) return "Others";
  return s;
}

export function groupPipeline(raw: string): string {
  if (!raw || raw === "masked data") return "—";
  const dash = raw.indexOf(" - ");
  const base = dash > 0 ? raw.substring(0, dash).trim() : raw.trim();
  const upper = base.toUpperCase();
  if (upper === "SALES" || upper.startsWith("SALE")) return "Sales";
  if (upper === "CX" || upper.startsWith("CX")) return "CX";
  if (upper.startsWith("PARTNER")) return "Partners";
  if (upper === "OPERATIONS") return "Operations";
  if (upper.startsWith("PRE")) return "Pre Sales";
  return base;
}
