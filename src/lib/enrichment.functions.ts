import { createServerFn } from "@tanstack/react-start";

// Public SIRENE / recherche-entreprises endpoint. No auth, no key.
// Rate limit: ~7 req/s per IP. We stay well under by batching with sleeps.
const SIRENE_BASE = "https://recherche-entreprises.api.gouv.fr/search";

export type SireneHit = {
  query: string; // original company name we searched
  found: boolean;
  city: string | null;
  postalCode: string | null;
  siren: string | null;
  nomComplet: string | null;
  error?: string;
};

type RawSearch = {
  results?: Array<{
    nom_complet?: string;
    nom_raison_sociale?: string;
    siren?: string;
    siege?: {
      libelle_commune?: string | null;
      code_postal?: string | null;
    };
  }>;
};

async function lookupOne(name: string): Promise<SireneHit> {
  const q = name.trim();
  if (!q) return { query: name, found: false, city: null, postalCode: null, siren: null, nomComplet: null };

  const url = `${SIRENE_BASE}?q=${encodeURIComponent(q)}&per_page=1`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "factorial-france-enrichment/1.0" },
    });
    if (res.status === 429) {
      // Cool off and retry once.
      const retry = Number(res.headers.get("retry-after")) || 2;
      await new Promise((r) => setTimeout(r, retry * 1000));
      return lookupOne(name);
    }
    if (!res.ok) {
      return {
        query: name, found: false, city: null, postalCode: null, siren: null, nomComplet: null,
        error: `HTTP ${res.status}`,
      };
    }
    const data = (await res.json()) as RawSearch;
    const top = data.results?.[0];
    if (!top) {
      return { query: name, found: false, city: null, postalCode: null, siren: null, nomComplet: null };
    }
    return {
      query: name,
      found: true,
      city: top.siege?.libelle_commune ?? null,
      postalCode: top.siege?.code_postal ?? null,
      siren: top.siren ?? null,
      nomComplet: top.nom_complet ?? top.nom_raison_sociale ?? null,
    };
  } catch (e) {
    return {
      query: name, found: false, city: null, postalCode: null, siren: null, nomComplet: null,
      error: e instanceof Error ? e.message : "unknown error",
    };
  }
}

export const lookupSireneBatch = createServerFn({ method: "POST" })
  .inputValidator((input: { names: string[] }) => {
    if (!input || !Array.isArray(input.names)) throw new Error("names[] required");
    const cleaned = input.names
      .filter((n): n is string => typeof n === "string")
      .map((n) => n.trim())
      .filter((n) => n.length > 0)
      .slice(0, 50); // cap per request
    return { names: cleaned };
  })
  .handler(async ({ data }): Promise<{ results: SireneHit[] }> => {
    const results: SireneHit[] = [];
    // Sequential with 150ms gap → ~6.5 req/s, safe under the 7 req/s SIRENE limit.
    for (const name of data.names) {
      const hit = await lookupOne(name);
      results.push(hit);
      await new Promise((r) => setTimeout(r, 150));
    }
    return { results };
  });
