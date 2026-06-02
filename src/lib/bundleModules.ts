import { groupIndustry } from "./industryGroups";
import type { WonDeal } from "./csvStore";

// ─── Plan name simplification ─────────────────────────────────────────────────
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
// Keys = simplified plan names. Values = modules above Core/TT/TO baseline.
// Compensation IS listed here — it's informative to show even for FR.
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
  // ── Common French combos (Compensation baked into plan name) ──
  "Operations Compensation":   ["Compensation"],
  "Planning Compensation":     ["Shifts", "Compensation"],
  "Productivity Compensation": ["Performance", "Compensation"],
  "Essentials Compensation":   ["Trainings", "Compensation"],
  "Consulting Compensation":   ["Projects", "Compensation"],
  "Starter Planning":          ["Shifts", "Compensation"],
  "Starter Productivity":      ["Performance", "Compensation"],
  "Starter Essentials":        ["Trainings", "Compensation"],
  "Starter Consulting":        ["Projects", "Compensation"],
  "Starter Operations":        ["Compensation"],
  "Starter People":            ["Performance", "Trainings", "Engagement"],
  // ── Legacy HubSpot codes ──
  "Rrhh":       ["Performance", "Trainings"],
  "Hr":         ["Performance", "Trainings"],
  "Nominas":    ["Compensation"],
  "Fichaje":    ["Shifts"],
  "Proyectos":  ["Projects"],
  "Formacion":  ["Trainings"],
  "Evaluaciones": ["Performance"],
};

export function getModulesForPlan(planName: string): string[] {
  if (!planName) return [];
  const key = simplifyPlan(planName);
  return BUNDLE_MODULES[key] ?? [];
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
