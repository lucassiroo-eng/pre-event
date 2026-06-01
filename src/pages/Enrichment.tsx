import { useCallback, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Upload, Square, Download, Trash2, Database, Search, FlaskConical, Globe } from "lucide-react";
import { readDeals, parseCsv, mergeDeals, writeMeta, countryStats, type WonDeal } from "@/lib/csvStore";
import { useDeals } from "@/lib/useDeals";
import { readEnrichmentStore, writeEnrichmentStore, addTrackingEntry, readTracking, recordApiCall, type EnrichmentRecord, type EnrichmentStore, type TrackingEntry } from "@/lib/enrichmentStore";
import { cityToRegion } from "@/lib/cityToRegionByCountry";
import { postalToRegion } from "@/lib/postalToRegionByCountry";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

type RunType = "hubspot" | "sirene" | "all" | null;

// Always keeps `concurrency` tasks in flight — no barrier between groups.
async function runWithConcurrency<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency: number,
  cancelRef: { current: boolean },
) {
  const queue = [...items];
  let inFlight = 0;
  await new Promise<void>((resolve) => {
    function next() {
      while (inFlight < concurrency && queue.length > 0 && !cancelRef.current) {
        const item = queue.shift()!;
        inFlight++;
        fn(item).finally(() => {
          inFlight--;
          if (queue.length === 0 && inFlight === 0) resolve();
          else next();
        });
      }
      if ((queue.length === 0 || cancelRef.current) && inFlight === 0) resolve();
    }
    next();
  });
}

export function EnrichmentPage() {
  const { deals, setDeals, refresh } = useDeals();
  const selectedCountry = window.localStorage.getItem("pre-event-country") ?? "fr";
  const [store, setStore] = useState<EnrichmentStore>(() => readEnrichmentStore());
  const [tracking, setTracking] = useState<TrackingEntry[]>(() => readTracking());
  const [running, setRunning] = useState<RunType>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0, matched: 0, errors: 0, startedAt: 0 });
  const [testResult, setTestResult] = useState<{ total: number; found: number; withRegion: number; samples: { name: string; city: string | null; region: string }[] } | null>(null);
  const [filter, setFilter] = useState("");
  const cancelRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const frDeals = useMemo(() => deals.filter((d) => d.country === selectedCountry), [deals, selectedCountry]);

  const hsPending = useMemo(() => frDeals.filter((d) => {
    const rec = store[d.companyId];
    if (!rec) return true;
    if (rec.status === "error" || rec.status === "pending") return true;
    return false;
  }), [frDeals, store]);

  const sirenePending = useMemo(() => frDeals.filter((d) => {
    const rec = store[d.companyId];
    if (!rec) return true;
    if (rec.status === "error" || rec.status === "pending") return true;
    if (rec.status === "hs-matched" && rec.regionCode === "unknown") return true;
    if (rec.status === "no-match") return true;
    return false;
  }), [frDeals, store]);

  const enrichedCount = useMemo(() => frDeals.filter((d) => {
    const rec = store[d.companyId];
    return rec && rec.status !== "error" && rec.status !== "pending";
  }).length, [frDeals, store]);

  const matchedCount = useMemo(() => frDeals.filter((d) => {
    const rec = store[d.companyId];
    return rec && (rec.status === "hs-matched" || rec.status === "sirene-enriched");
  }).length, [frDeals, store]);

  const withRegionCount = useMemo(() => frDeals.filter((d) => {
    const rec = store[d.companyId];
    return rec && rec.regionCode !== "unknown";
  }).length, [frDeals, store]);

  const onFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length === 0) throw new Error("CSV vacío");
      const { merged } = mergeDeals(deals, parsed);
      setDeals(merged);
      const cs = countryStats(merged);
      writeMeta({
        uploadedAt: new Date().toISOString(),
        fileName: file.name,
        totalRows: merged.length,
        countries: Object.fromEntries(Object.entries(cs).map(([k, v]) => [k, v.count])),
      });
      refresh();
    } catch { /* ignore */ }
  }, []);

  const callHubspotLookup = useCallback(async (batch: WonDeal[]) => {
    const names = batch.map((d) => d.companyName);
    const res = await fetch(`${SUPABASE_URL}/functions/v1/hubspot-lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_ANON}` },
      body: JSON.stringify({ names }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<{ results: Array<{ query: string; found: boolean; city: string | null; zip: string | null; hubspotId: string | null; domain: string | null }> }>;
  }, []);

  const runHubspot = useCallback(async () => {
    if (running || hsPending.length === 0 || !SUPABASE_URL) return;
    cancelRef.current = false;
    setRunning("hubspot");
    setTestResult(null);
    const startedAt = Date.now();
    setProgress({ done: 0, total: hsPending.length, matched: 0, errors: 0, startedAt });

    const next = { ...store };
    const BATCH = 25;
    const CONCURRENCY = 15;
    let matched = 0;
    let errors = 0;
    let done = 0;

    const chunks: WonDeal[][] = [];
    for (let i = 0; i < hsPending.length; i += BATCH) chunks.push(hsPending.slice(i, i + BATCH));

    const processBatch = async (batch: WonDeal[]) => {
      if (cancelRef.current) return;
      try {
        const data = await callHubspotLookup(batch);
        recordApiCall("hubspot", data.results.length);
        for (const hit of data.results) {
          const deal = batch.find((d) => d.companyName === hit.query);
          if (!deal) continue;
          if (hit.found) {
            matched++;
            const byPostal = postalToRegion(deal.country, hit.zip);
            const region = byPostal !== "unknown" ? byPostal : cityToRegion(deal.country, hit.city);
            next[deal.companyId] = {
              companyId: deal.companyId, companyName: deal.companyName,
              hubspotId: hit.hubspotId, hubspotCity: hit.city, hubspotZip: hit.zip, domain: hit.domain ?? null,
              sireneCity: null, sirenePostal: null, sireneSiren: null,
              regionCode: region as any, status: "hs-matched",
              enrichedAt: new Date().toISOString(), error: null,
            };
          } else {
            next[deal.companyId] = {
              companyId: deal.companyId, companyName: deal.companyName,
              hubspotId: null, hubspotCity: null, hubspotZip: null, domain: null,
              sireneCity: null, sirenePostal: null, sireneSiren: null,
              regionCode: "unknown", status: "no-match",
              enrichedAt: new Date().toISOString(), error: null,
            };
          }
        }
      } catch { errors++; }
      done += batch.length;
      writeEnrichmentStore(next);
      setStore({ ...next });
      setProgress({ done: Math.min(done, hsPending.length), total: hsPending.length, matched, errors, startedAt });
    };

    // Concurrency queue: always keeps CONCURRENCY requests in flight (no barrier)
    await runWithConcurrency(chunks, processBatch, CONCURRENCY, cancelRef);

    applyEnrichmentToDeals(next);
    refresh();
    addTrackingEntry({ timestamp: new Date().toISOString(), type: "hubspot", batchSize: hsPending.length, matched, errors });
    setTracking(readTracking());
    setRunning(null);
  }, [running, hsPending, store, deals, refresh, callHubspotLookup]);

  const runTest = useCallback(async () => {
    if (running || hsPending.length === 0 || !SUPABASE_URL) return;
    setRunning("hubspot");
    setTestResult(null);
    const sample = hsPending.slice(0, 20);
    try {
      const data = await callHubspotLookup(sample);
      let found = 0;
      let withRegion = 0;
      const samples: { name: string; city: string | null; region: string }[] = [];
      for (const hit of data.results) {
        const deal = sample.find((d) => d.companyName === hit.query);
        if (!deal) continue;
        if (hit.found) {
          found++;
          const byPostal = postalToRegion(deal.country, hit.zip);
          const region = byPostal !== "unknown" ? byPostal : cityToRegion(deal.country, hit.city);
          if (region !== "unknown") withRegion++;
          samples.push({ name: hit.query, city: hit.city, region });
        }
      }
      setTestResult({ total: sample.length, found, withRegion, samples });
    } catch { /* ignore */ }
    setRunning(null);
  }, [running, hsPending, callHubspotLookup]);

  const runSirene = useCallback(async () => {
    if (running || sirenePending.length === 0 || !SUPABASE_URL) return;
    cancelRef.current = false;
    setRunning("sirene");
    const startedAt = Date.now();
    setProgress({ done: 0, total: sirenePending.length, matched: 0, errors: 0, startedAt });

    const next = { ...store };
    const BATCH = 25;
    let matched = 0;
    let errors = 0;

    for (let i = 0; i < sirenePending.length; i += BATCH) {
      if (cancelRef.current) break;
      const batch = sirenePending.slice(i, i + BATCH);

      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/sirene-lookup`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_ANON}` },
          body: JSON.stringify({ names: batch.map((d) => d.companyName) }),
        });
        if (res.ok) {
          const data = await res.json() as { results: Array<{ query: string; found: boolean; city: string | null; postalCode: string | null; siren: string | null }> };
          recordApiCall("sirene", data.results.length);
          for (const hit of data.results) {
            const deal = batch.find((d) => d.companyName === hit.query);
            if (!deal) continue;
            const existing = next[deal.companyId];
            if (hit.found) {
              matched++;
              const byPostal = postalToRegion(deal.country, hit.postalCode);
              const region = byPostal !== "unknown" ? byPostal : cityToRegion(deal.country, hit.city);
              next[deal.companyId] = {
                ...existing ?? {
                  companyId: deal.companyId, companyName: deal.companyName,
                  hubspotId: null, hubspotCity: null, hubspotZip: null, domain: null, error: null,
                },
                sireneCity: hit.city, sirenePostal: hit.postalCode, sireneSiren: hit.siren,
                regionCode: (existing?.regionCode !== "unknown" ? existing.regionCode : region) as any,
                status: "sirene-enriched",
                enrichedAt: new Date().toISOString(),
              };
            }
          }
        } else {
          errors++;
        }
      } catch { errors++; }

      writeEnrichmentStore(next);
      setStore({ ...next });
      setProgress({ done: Math.min(i + batch.length, sirenePending.length), total: sirenePending.length, matched, errors, startedAt });
    }

    applyEnrichmentToDeals(next);
    refresh();
    addTrackingEntry({ timestamp: new Date().toISOString(), type: "sirene", batchSize: sirenePending.length, matched, errors });
    setTracking(readTracking());
    setRunning(null);
  }, [running, sirenePending, store, deals, refresh]);

  const runAllCountries = useCallback(async () => {
    if (running || !SUPABASE_URL) return;
    const allPending = deals.filter((d) => {
      const rec = store[d.companyId];
      return !rec || rec.status === "error" || rec.status === "pending";
    });
    if (allPending.length === 0) return;
    cancelRef.current = false;
    setRunning("all");
    setTestResult(null);
    const startedAt = Date.now();
    setProgress({ done: 0, total: allPending.length, matched: 0, errors: 0, startedAt });

    const next = { ...store };
    const BATCH = 25;
    const CONCURRENCY = 15;
    let matched = 0;
    let errors = 0;
    let done = 0;

    const chunks: WonDeal[][] = [];
    for (let i = 0; i < allPending.length; i += BATCH) chunks.push(allPending.slice(i, i + BATCH));

    const processBatch = async (batch: WonDeal[]) => {
      if (cancelRef.current) return;
      try {
        const data = await callHubspotLookup(batch);
        recordApiCall("hubspot", data.results.length);
        for (const hit of data.results) {
          const deal = batch.find((d) => d.companyName === hit.query);
          if (!deal) continue;
          if (hit.found) {
            matched++;
            const byPostal = postalToRegion(deal.country, hit.zip);
            const region = byPostal !== "unknown" ? byPostal : cityToRegion(deal.country, hit.city);
            next[deal.companyId] = {
              companyId: deal.companyId, companyName: deal.companyName,
              hubspotId: hit.hubspotId, hubspotCity: hit.city, hubspotZip: hit.zip, domain: hit.domain ?? null,
              sireneCity: null, sirenePostal: null, sireneSiren: null,
              regionCode: region as any, status: "hs-matched",
              enrichedAt: new Date().toISOString(), error: null,
            };
          } else {
            next[deal.companyId] = {
              companyId: deal.companyId, companyName: deal.companyName,
              hubspotId: null, hubspotCity: null, hubspotZip: null, domain: null,
              sireneCity: null, sirenePostal: null, sireneSiren: null,
              regionCode: "unknown", status: "no-match",
              enrichedAt: new Date().toISOString(), error: null,
            };
          }
        }
      } catch { errors++; }
      done += batch.length;
      writeEnrichmentStore(next);
      setStore({ ...next });
      setProgress({ done: Math.min(done, allPending.length), total: allPending.length, matched, errors, startedAt });
    };

    await runWithConcurrency(chunks, processBatch, CONCURRENCY, cancelRef);

    applyEnrichmentToDeals(next);
    refresh();
    addTrackingEntry({ timestamp: new Date().toISOString(), type: "hubspot", batchSize: allPending.length, matched, errors });
    setTracking(readTracking());
    setRunning(null);
  }, [running, deals, store, refresh, callHubspotLookup]);

  const applyEnrichmentToDeals = (enrichStore: EnrichmentStore) => {
    const fresh = readDeals();
    const updatedDeals = fresh.map((d) => {
      const rec = enrichStore[d.companyId];
      if (!rec || rec.regionCode === "unknown") return d;
      return { ...d, regionCode: rec.regionCode, city: rec.hubspotCity ?? rec.sireneCity ?? d.city };
    });
    setDeals(updatedDeals);
  };

  const clearStore = () => {
    if (!confirm("Borrar todos los resultados de enrichment?")) return;
    writeEnrichmentStore({});
    setStore({});
  };

  const exportCsv = () => {
    const header = ["companyId", "companyName", "hubspotId", "hubspotCity", "hubspotZip", "sireneCity", "sirenePostal", "siren", "regionCode", "status"].join(",");
    const rows = frDeals.map((d) => {
      const r = store[d.companyId];
      return [d.companyId, d.companyName, r?.hubspotId ?? "", r?.hubspotCity ?? "", r?.hubspotZip ?? "", r?.sireneCity ?? "", r?.sirenePostal ?? "", r?.sireneSiren ?? "", r?.regionCode ?? "", r?.status ?? "pending"]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",");
    });
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `enrichment-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const filteredDeals = useMemo(() => {
    const q = filter.toLowerCase();
    const rows = frDeals.map((d) => ({ ...d, record: store[d.companyId] ?? null }));
    if (!q) return rows;
    return rows.filter((r) =>
      r.companyName.toLowerCase().includes(q) || (r.record?.hubspotCity ?? "").toLowerCase().includes(q),
    );
  }, [frDeals, store, filter]);

  return (
    <div className="mx-auto max-w-[1500px] px-6 py-6 lg:px-8 lg:py-8">
      <PageHeader title="Enrichment" subtitle={`HubSpot${selectedCountry === "fr" ? " + SIRENE" : ""} · ${selectedCountry.toUpperCase()}`} />

      <div className="mt-6 space-y-6">
        <Card
          className="p-6 border-dashed cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
        >
          <div className="flex items-center gap-3 text-sm">
            <Upload className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1">
              <div className="font-medium">Actualizar CSV</div>
              <div className="text-xs text-muted-foreground">Solo se enriquecerán las nuevas empresas</div>
            </div>
          </div>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
        </Card>

        <Tabs defaultValue="companies">
          <TabsList>
            <TabsTrigger value="companies">Empresas ({frDeals.length})</TabsTrigger>
            <TabsTrigger value="tracking">Tracking ({tracking.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="companies" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <MiniStat label={`Total ${selectedCountry.toUpperCase()}`} value={frDeals.length.toLocaleString()} />
              <MiniStat label="Enriched" value={enrichedCount.toLocaleString()} />
              <MiniStat label="Matched" value={matchedCount.toLocaleString()} />
              <MiniStat label="Con región" value={withRegionCount.toLocaleString()} hint={`${frDeals.length ? ((withRegionCount / frDeals.length) * 100).toFixed(0) : 0}%`} />
              <MiniStat label="Pendientes HS" value={hsPending.length.toLocaleString()} />
            </div>

            <Card className="p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                {running === null ? (
                  <>
                    {(() => {
                      const allPendingCount = deals.filter((d) => {
                        const rec = store[d.companyId];
                        return !rec || rec.status === "error" || rec.status === "pending";
                      }).length;
                      return (
                        <Button onClick={runAllCountries} disabled={allPendingCount === 0 || !SUPABASE_URL} variant="default">
                          <Globe className="h-4 w-4 mr-2" />
                          Enrich all países ({allPendingCount.toLocaleString()})
                        </Button>
                      );
                    })()}
                    <div className="h-5 w-px bg-border" />
                    <Button onClick={runHubspot} disabled={hsPending.length === 0 || !SUPABASE_URL} variant="outline">
                      <Database className="h-4 w-4 mr-2" />
                      {hsPending.length === 0 ? "HS: sin pendientes" : `HS ${selectedCountry.toUpperCase()} (${hsPending.length})`}
                    </Button>
                    <Button variant="outline" onClick={runTest} disabled={hsPending.length === 0 || !SUPABASE_URL} title="Prueba con 20 empresas para ver si el enrich funciona en este país">
                      <FlaskConical className="h-4 w-4 mr-2" />
                      Probar 20
                    </Button>
                    {selectedCountry === "fr" && (
                      <Button onClick={runSirene} disabled={sirenePending.length === 0 || !SUPABASE_URL} variant="outline">
                        <Search className="h-4 w-4 mr-2" />
                        {sirenePending.length === 0 ? "SIRENE: sin pendientes" : `SIRENE (${sirenePending.length})`}
                      </Button>
                    )}
                  </>
                ) : (
                  <Button variant="destructive" onClick={() => { cancelRef.current = true; }}>
                    <Square className="h-4 w-4 mr-2" /> Cancelar {running === "all" ? "Enrich All" : running === "hubspot" ? "HubSpot" : "SIRENE"}
                  </Button>
                )}
                <Button variant="outline" onClick={exportCsv} disabled={frDeals.length === 0}>
                  <Download className="h-4 w-4 mr-2" /> Export CSV
                </Button>
                <Button variant="ghost" onClick={clearStore} disabled={Object.keys(store).length === 0}>
                  <Trash2 className="h-4 w-4 mr-2" /> Limpiar cache
                </Button>
                {!SUPABASE_URL && (
                  <span className="text-xs text-amber-600">Supabase no configurado (VITE_SUPABASE_URL)</span>
                )}
              </div>

              {running && progress.total > 0 && (() => {
                const pct = progress.total ? (progress.done / progress.total) * 100 : 0;
                const elapsed = (Date.now() - progress.startedAt) / 1000;
                const rate = progress.done > 0 ? progress.done / elapsed : 0;
                const eta = rate > 0 ? Math.ceil((progress.total - progress.done) / rate) : null;
                const matchRate = progress.done > 0 ? Math.round((progress.matched / progress.done) * 100) : null;
                return (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium text-primary">{running === "hubspot" ? "HubSpot" : "SIRENE"}</span>
                      <div className="flex gap-3 tabular-nums">
                        {matchRate !== null && <span className="text-emerald-600 font-medium">{matchRate}% match</span>}
                        <span>{progress.done} / {progress.total}</span>
                        {eta !== null && <span>~{eta < 60 ? `${eta}s` : `${Math.ceil(eta / 60)}min`}</span>}
                      </div>
                    </div>
                    <div className="h-2 w-full bg-muted rounded overflow-hidden">
                      <div className="h-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })()}

              {testResult && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-2">
                  <div className="flex items-center gap-3 font-medium">
                    <span>Muestra: {testResult.total} empresas</span>
                    <span className={testResult.found > 0 ? "text-emerald-600" : "text-red-500"}>
                      {testResult.found} encontradas en HubSpot ({Math.round((testResult.found / testResult.total) * 100)}%)
                    </span>
                    <span className="text-blue-600">{testResult.withRegion} con región ({Math.round((testResult.withRegion / testResult.total) * 100)}%)</span>
                  </div>
                  {testResult.samples.length > 0 && (
                    <div className="grid grid-cols-3 gap-1 mt-1">
                      {testResult.samples.slice(0, 6).map((s) => (
                        <div key={s.name} className="truncate text-muted-foreground">
                          <span className="font-medium text-foreground">{s.name}</span>
                          {s.city && <span> · {s.city}</span>}
                          {s.region !== "unknown" && <span className="text-emerald-600"> [{s.region}]</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {testResult.found === 0 && (
                    <p className="text-amber-600 font-medium">⚠ Sin matches. Las empresas de este país podrían no estar en HubSpot o tienen nombres distintos.</p>
                  )}
                </div>
              )}
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Empresas {selectedCountry.toUpperCase()} ({filteredDeals.length})</h3>
                <Input placeholder="Filtrar..." value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-xs" />
              </div>
              <div className="overflow-auto max-h-[640px] border rounded">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium">Empresa</th>
                      <th className="px-3 py-2 font-medium">City (HS)</th>
                      <th className="px-3 py-2 font-medium">City (SIRENE)</th>
                      <th className="px-3 py-2 font-medium">Region</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDeals.slice(0, 500).map((row) => (
                      <tr key={row.companyId} className="border-t hover:bg-muted/30">
                        <td className="px-3 py-1.5 font-medium">{row.companyName}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{row.record?.hubspotCity ?? "—"}</td>
                        <td className="px-3 py-1.5">{row.record?.sireneCity ?? "—"}</td>
                        <td className="px-3 py-1.5">
                          {row.record ? (
                            <Badge variant={row.record.regionCode === "unknown" ? "outline" : "default"} className="text-[10px]">
                              {row.record.regionCode}
                            </Badge>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-1.5">
                          {!row.record ? <span className="text-muted-foreground">Pendiente</span>
                            : row.record.status === "hs-matched" ? <span className="text-blue-600">HubSpot</span>
                            : row.record.status === "sirene-enriched" ? <span className="text-emerald-600">SIRENE</span>
                            : row.record.status === "no-match" ? <span className="text-amber-600">No match</span>
                            : row.record.status === "error" ? <span className="text-destructive">Error</span>
                            : <span className="text-muted-foreground">Pendiente</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="tracking" className="mt-4">
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-3">Historial de enrichment</h3>
              {tracking.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin runs todavía</p>
              ) : (
                <div className="overflow-auto max-h-[400px] border rounded">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr className="text-left">
                        <th className="px-3 py-2 font-medium">Fecha</th>
                        <th className="px-3 py-2 font-medium">Tipo</th>
                        <th className="px-3 py-2 font-medium text-right">Batch</th>
                        <th className="px-3 py-2 font-medium text-right">Matched</th>
                        <th className="px-3 py-2 font-medium text-right">Errors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tracking.map((t, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-1.5 tabular-nums">{new Date(t.timestamp).toLocaleString()}</td>
                          <td className="px-3 py-1.5">{t.type === "hubspot" ? "HubSpot" : "SIRENE"}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{t.batchSize}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{t.matched}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{t.errors}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
    </Card>
  );
}
