import { groupIndustry } from "./industryGroups";
import type { WonDeal } from "./csvStore";

// ─── Plan name simplification (same logic as elsewhere) ──────────────────────
export function simplifyPlan(plan: string): string {
  if (!plan) return "";
  return plan
    .replace(/^f25_/i, "")
    .replace(/_(e|b)-(month|year).*$/i, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// ─── Bundle → differentiating modules ────────────────────────────────────────
// Listing only the modules ABOVE the always-included baseline (Core, TT, TO).
// Compensation is listed here; it gets filtered out for FR where it's baked in.
const BUNDLE_MODULES: Record<string, string[]> = {
  // ── Starter ──
  "Planning":          ["Shifts", "Compensation"],
  "Productivity":      ["Performance", "Compensation"],
  "Essentials":        ["Trainings", "Compensation"],
  "Consulting":        ["Projects", "Compensation"],
  "Operations":        ["Compensation"],
  "People":            ["Performance", "Trainings", "Engagement"],
  "People Talent":     ["Performance", "Trainings", "Engagement"],
  // ── PRO ──
  "Planning Pro":      ["Shifts", "Performance", "Trainings", "Engagement", "Compensation"],
  "Productivity Pro":  ["Performance", "Trainings", "Engagement", "Compensation"],
  "Essentials Pro":    ["Trainings", "Performance", "Engagement", "Compensation"],
  "Consulting Pro":    ["Projects", "Performance", "Trainings", "Engagement", "Compensation"],
  "People Pro":        ["Performance", "Trainings", "Engagement", "Compensation"],
  // ── Legacy HubSpot codes ──
  "Rrhh":              ["Performance", "Trainings"],          // ES: RRHH ≈ People
  "Hr":                ["Performance", "Trainings"],
  "Nominas":           ["Compensation"],
  "Fichaje":           ["Shifts"],
  "Proyectos":         ["Projects"],
  "Formacion":         ["Trainings"],
  "Evaluaciones":      ["Performance"],
};

// ─── Exclusions ───────────────────────────────────────────────────────────────
// Modules that are present in EVERY deal for a country — not informative to show.
const BASE_EXCLUDED = ["Core", "Time Off", "Time Tracking"];

const COUNTRY_EXTRA_EXCLUDED: Record<string, string[]> = {
  fr: ["Compensation", "CFN", "SILAE"],  // always baked into FR bundles
};

export function getExcluded(country: string): Set<string> {
  const extra = COUNTRY_EXTRA_EXCLUDED[country] ?? [];
  return new Set([...BASE_EXCLUDED, ...extra]);
}

// ─── Module counting ──────────────────────────────────────────────────────────
export function getModulesForPlan(planName: string): string[] {
  return BUNDLE_MODULES[simplifyPlan(planName)] ?? [];
}

export interface ModuleCount {
  module: string;
  count: number;
  pct: number;  // % of deals in the industry that have this module
}

/**
 * Count differentiating modules for a given industry across a set of deals.
 * Returns sorted descending, excluding always-included modules for the country.
 */
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

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([module, count]) => ({ module, count, pct: Math.round((count / total) * 100) }));
}
