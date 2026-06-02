// Ad-hoc HubSpot company lookup — same edge function the Enrichment page uses,
// but callable on demand (e.g. right before generating a slide) so we can grab
// domains for logos without running the full sync.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

export interface HubspotHit {
  query: string;
  found: boolean;
  city: string | null;
  zip: string | null;
  hubspotId: string | null;
  domain: string | null;
}

async function callBatch(names: string[]): Promise<HubspotHit[]> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/hubspot-lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_ANON}` },
    body: JSON.stringify({ names }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { results: HubspotHit[] };
  return data.results ?? [];
}

// Looks up the given company names in HubSpot and returns a map
// normalized-name → hit. Safe to call with a handful of names; batches of 25.
// Returns an empty map (never throws) if Supabase isn't configured or fails.
export async function lookupHubspotByName(names: string[]): Promise<Map<string, HubspotHit>> {
  const out = new Map<string, HubspotHit>();
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (unique.length === 0 || !SUPABASE_URL) return out;

  const BATCH = 25;
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += BATCH) chunks.push(unique.slice(i, i + BATCH));

  const all = await Promise.all(
    chunks.map((c) => callBatch(c).catch(() => [] as HubspotHit[])),
  );
  for (const results of all) {
    for (const hit of results) {
      out.set(hit.query.trim().toLowerCase(), hit);
    }
  }
  return out;
}
