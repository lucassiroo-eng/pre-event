// Maps a French postal code to a region code (RegionCode in mockData.ts).
// The first 2 digits of a French postal code = département → région (INSEE).
// This is deterministic and covers 100% of metropolitan France + Corsica.
// Overseas DOM/TOM (971-988) → "unknown" (we don't show them on the map).

type RegionCode =
  | "11" | "24" | "27" | "28" | "32" | "44" | "52"
  | "53" | "75" | "76" | "84" | "93" | "94";

// département (2-digit string) → region code
const DEP_REGION: Record<string, RegionCode> = {};

function add(region: RegionCode, deps: string[]) {
  for (const d of deps) DEP_REGION[d] = region;
}

// 11 — Île-de-France
add("11", ["75", "77", "78", "91", "92", "93", "94", "95"]);
// 24 — Centre-Val de Loire
add("24", ["18", "28", "36", "37", "41", "45"]);
// 27 — Bourgogne-Franche-Comté
add("27", ["21", "25", "39", "58", "70", "71", "89", "90"]);
// 28 — Normandie
add("28", ["14", "27", "50", "61", "76"]);
// 32 — Hauts-de-France
add("32", ["02", "59", "60", "62", "80"]);
// 44 — Grand Est
add("44", ["08", "10", "51", "52", "54", "55", "57", "67", "68", "88"]);
// 52 — Pays de la Loire
add("52", ["44", "49", "53", "72", "85"]);
// 53 — Bretagne
add("53", ["22", "29", "35", "56"]);
// 75 — Nouvelle-Aquitaine
add("75", ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"]);
// 76 — Occitanie
add("76", ["09", "11", "12", "30", "31", "32", "34", "46", "48", "65", "66", "81", "82"]);
// 84 — Auvergne-Rhône-Alpes
add("84", ["01", "03", "07", "15", "26", "38", "42", "43", "63", "69", "73", "74"]);
// 93 — Provence-Alpes-Côte d'Azur
add("93", ["04", "05", "06", "13", "83", "84"]);
// 94 — Corse (2A + 2B; postal codes start with "20")
add("94", ["20", "2A", "2B"]);

export function regionFromPostalCode(
  postal: string | null | undefined,
): RegionCode | "unknown" {
  if (!postal) return "unknown";
  const clean = String(postal).trim().replace(/\s+/g, "");
  if (clean.length < 2) return "unknown";
  const dep = clean.slice(0, 2);
  // Corsica special case: postal 20000-20190 → 2A, 20200-20620 → 2B,
  // but both map to region 94 so the "20" entry is enough.
  return DEP_REGION[dep] ?? "unknown";
}
