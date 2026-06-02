import { groupIndustry } from "./industryGroups";
import type { WonDeal } from "./csvStore";

// ─── Plan name simplification (for display) ───────────────────────────────────
// Strips the year prefix (F25, f24_, …) and the billing/tier suffix
// (Enterprise, Business, e-month, b-year) from either space- or underscore-
// separated HubSpot plan names.
export function simplifyPlan(plan: string): string {
  if (!plan) return "";
  return plan
    .replace(/_/g, " ")
    .replace(/^\s*f\d{2}\s+/i, "")
    .replace(/\s+(enterprise|business)\s*$/i, "")
    .replace(/\s+(e|b)-(month|year).*$/i, "")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// ─── Bundle → differentiating modules ────────────────────────────────────────
// Modules listed are those ABOVE the Core / Time Tracking / Time Off baseline.
// HubSpot plan names look like "F25 Starter Planning Enterprise",
// "F25 Planning Pro Business", "Core Enterprise". We detect the bundle keyword
// and the Pro tier from the raw string rather than matching an exact key, so
// any year prefix or Enterprise/Business suffix is tolerated.
const BUNDLE_MODULES: Record<string, string[]> = {
  people:       ["Performance", "Trainings", "Engagement"],
  planning:     ["Shifts", "Compensation"],
  productivity: ["Performance", "Compensation"],
  essentials:   ["Trainings", "Compensation"],
  consulting:   ["Projects", "Compensation"],
  shifts:       ["Shifts", "Compensation"],
  operations:   ["Compensation"],
  compensation: ["Compensation"],
};

// "Pro" tier always layers the full talent suite on top of the bundle.
const PRO_MODULES = ["Performance", "Trainings", "Engagement", "Compensation"];

export function getModulesForPlan(planName: string): string[] {
  if (!planName) return [];
  const s = planName.toLowerCase();

  // Detection order matters: more specific bundle keywords first.
  let base: string[] = [];
  for (const key of ["people", "planning", "productivity", "essentials", "consulting", "shifts", "operations", "compensation"]) {
    if (s.includes(key)) { base = BUNDLE_MODULES[key]; break; }
  }
  // "Employee platform" / "Core" carry only the baseline → no extra modules.

  const modules = new Set(base);
  if (/\bpro\b/.test(s)) for (const m of PRO_MODULES) modules.add(m);
  return [...modules];
}

// ─── Exclusions ───────────────────────────────────────────────────────────────
// Only exclude modules that are in EVERY bundle with no exception.
// The user asked to exclude Core and Time Off (Time Tracking always bundled too).
const ALWAYS_EXCLUDED = new Set(["Core", "Time Off", "Time Tracking"]);

export function getExcluded(_country: string): Set<string> {
  return ALWAYS_EXCLUDED;
}

// ─── Module counting ──────────────────────────────────────────────────────────
export interface ModuleCount {
  module: string;
  count: number;
  pct: number;
}

export function countModulesForIndustry(
  deals: WonDeal[],
  industry: string,
  country: string,
): ModuleCount[] {
  const excluded = getExcluded(country);
  const industryDeals = deals.filter((d) => groupIndustry(d.sector) === industry);
  const total = industryDeals.length;
  if (total === 0) return [];

  const counts = new Map<string, number>();
  for (const d of industryDeals) {
    for (const mod of getModulesForPlan(d.planName)) {
      if (excluded.has(mod)) continue;
      counts.set(mod, (counts.get(mod) ?? 0) + 1);
    }
  }

  if (counts.size === 0) return [];

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([module, count]) => ({ module, count, pct: Math.round((count / total) * 100) }));
}
