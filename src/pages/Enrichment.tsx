import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Upload, Play, Square, Download, Trash2 } from "lucide-react";
import { readDeals, writeDeals, parseCsv, mergeDeals, writeMeta, countryStats, type WonDeal, type CsvMeta } from "@/lib/csvStore";
import { readEnrichmentStore, writeEnrichmentStore, addTrackingEntry, readTracking, recordApiCall, type EnrichmentRecord, type EnrichmentStore, type TrackingEntry } from "@/lib/enrichmentStore";
import { regionFromCity } from "@/lib/frenchCityToRegion";
import { regionFromPostalCode } from "@/lib/frenchPostalToRegion";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

export function EnrichmentPage() {
  const [deals, setDeals] = useState(() => readDeals());
  const [store, setStore] = useState<EnrichmentStore>(() => readEnrichmentStore());
  const [tracking, setTracking] = useState<TrackingEntry[]>(() => readTracking());
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [filter, setFilter] = useState("");
  const cancelRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const frDeals = useMemo(() => deals.filter((d) => d.country === "fr"), [deals]);
  const pending = useMemo(() => frDeals.filter((d) => !store[d.companyId]), [frDeals, store]);
  const enriched = useMemo(() => frDeals.filter((d) => store[d.companyId]), [frDeals, store]);
  const matched = useMemo(() => enriched.filter((d) => store[d.companyId]?.status === "hs-matched" || store[d.companyId]?.status === "sirene-enriched"), [enriched, store]);
  const withRegion = useMemo(() => enriched.filter((d) => store[d.companyId]?.regionCode !== "unknown"), [enriched, store]);

  const onFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length === 0) throw new Error("CSV vacío");
      const existing = readDeals();
      const { merged, newCount } = mergeDeals(existing, parsed);
      writeDeals(merged);
      const cs = countryStats(merged);
      const meta: CsvMeta = {
        uploadedAt: new Date().toISOString(),
        fileName: file.name,
        totalRows: merged.length,
        countries: Object.fromEntries(Object.entries(cs).map(([k, v]) => [k, v.count])),
      };
      writeMeta(meta);
      setDeals(merged);
    } catch { /* ignore */ }
  }, []);

  const runEnrichment = useCallback(async () => {
    if (running || pending.length === 0) return;
    cancelRef.current = false;
    setRunning(true);
    setProgress({ done: 0, total: pending.length });

    const next = { ...store };
    const BATCH = 25;
    let hsMatched = 0;
    let sireneMatched = 0;
    let errors = 0;

    for (let i = 0; i < pending.length; i += BATCH) {
      if (cancelRef.current) break;
      const batch = pending.slice(i, i + BATCH);
      const names = batch.map((d) => d.companyName);

      // Step 1: HubSpot lookup
      if (SUPABASE_URL) {
        try {
          const res = await fetch(`${SUPABASE_URL}/functions/v1/hubspot-lookup`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SUPABASE_ANON}`,
            },
            body: JSON.stringify({ names }),
          });
          if (res.ok) {
            const data = await res.json() as { results: Array<{ query: string; found: boolean; city: string | null; zip: string | null; hubspotId: string | null }> };
            recordApiCall("hubspot", data.results.length);
            for (const hit of data.results) {
              const deal = batch.find((d) => d.companyName === hit.query);
              if (!deal) continue;
              if (hit.found) {
                hsMatched++;
                const byPostal = regionFromPostalCode(hit.zip);
                const region = byPostal !== "unknown" ? byPostal : regionFromCity(hit.city);
                next[deal.companyId] = {
                  companyId: deal.companyId,
                  companyName: deal.companyName,
                  hubspotId: hit.hubspotId,
                  hubspotCity: hit.city,
                  hubspotZip: hit.zip,
                  sireneCity: null, sirenePostal: null, sireneSiren: null,
                  regionCode: region,
                  status: "hs-matched",
                  enrichedAt: new Date().toISOString(),
                  error: null,
                };
              }
            }
          }
        } catch { errors++; }
      }

      // Step 2: SIRENE lookup for unresolved
      const unresolved = batch.filter((d) => !next[d.companyId] || next[d.companyId].regionCode === "unknown");
      if (unresolved.length > 0 && SUPABASE_URL) {
        try {
          const res = await fetch(`${SUPABASE_URL}/functions/v1/sirene-lookup`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SUPABASE_ANON}`,
            },
            body: JSON.stringify({ names: unresolved.map((d) => d.companyName) }),
          });
          if (res.ok) {
            const data = await res.json() as { results: Array<{ query: string; found: boolean; city: string | null; postalCode: string | null; siren: string | null }> };
            recordApiCall("sirene", data.results.length);
            for (const hit of data.results) {
              const deal = unresolved.find((d) => d.companyName === hit.query);
              if (!deal) continue;
              const existing = next[deal.companyId];
              if (hit.found) {
                sireneMatched++;
                const byPostal = regionFromPostalCode(hit.postalCode);
                const region = byPostal !== "unknown" ? byPostal : regionFromCity(hit.city);
                next[deal.companyId] = {
                  ...existing ?? {
                    companyId: deal.companyId, companyName: deal.companyName,
                    hubspotId: null, hubspotCity: null, hubspotZip: null, error: null,
                  },
                  sireneCity: hit.city,
                  sirenePostal: hit.postalCode,
                  sireneSiren: hit.siren,
                  regionCode: region,
                  status: "sirene-enriched",
                  enrichedAt: new Date().toISOString(),
                };
              } else if (!existing) {
                next[deal.companyId] = {
                  companyId: deal.companyId, companyName: deal.companyName,
                  hubspotId: null, hubspotCity: null, hubspotZip: null,
                  sireneCity: null, sirenePostal: null, sireneSiren: null,
                  regionCode: "unknown", status: "no-match",
                  enrichedAt: new Date().toISOString(), error: null,
                };
              }
            }
          }
        } catch { errors++; }
      }

      // Mark remaining as no-match
      for (const d of batch) {
        if (!next[d.companyId]) {
          next[d.companyId] = {
            companyId: d.companyId, companyName: d.companyName,
            hubspotId: null, hubspotCity: null, hubspotZip: null,
            sireneCity: null, sirenePostal: null, sireneSiren: null,
            regionCode: "unknown", status: SUPABASE_URL ? "no-match" : "pending",
            enrichedAt: SUPABASE_URL ? new Date().toISOString() : null,
            error: SUPABASE_URL ? null : "Supabase not configured",
          };
        }
      }

      writeEnrichmentStore(next);
      setStore({ ...next });
      setProgress({ done: Math.min(i + batch.length, pending.length), total: pending.length });
    }

    // Update deals with enrichment data
    const updatedDeals = readDeals().map((d) => {
      const rec = next[d.companyId];
      if (!rec || rec.regionCode === "unknown") return d;
      return { ...d, regionCode: rec.regionCode, city: rec.hubspotCity ?? rec.sireneCity ?? d.city };
    });
    writeDeals(updatedDeals);
    setDeals(updatedDeals);

    const entry: TrackingEntry = {
      timestamp: new Date().toISOString(),
      type: "hubspot",
      batchSize: pending.length,
      matched: hsMatched + sireneMatched,
      errors,
    };
    addTrackingEntry(entry);
    setTracking(readTracking());
    setRunning(false);
  }, [running, pending, store]);

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
      <PageHeader title="Enrichment" subtitle="HubSpot + SIRENE — solo Francia" />

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
              <MiniStat label="Total FR" value={frDeals.length.toLocaleString()} />
              <MiniStat label="Enriched" value={enriched.length.toLocaleString()} />
              <MiniStat label="Matched" value={matched.length.toLocaleString()} />
              <MiniStat label="Con región" value={withRegion.length.toLocaleString()} hint={`${frDeals.length ? ((withRegion.length / frDeals.length) * 100).toFixed(0) : 0}%`} />
              <MiniStat label="Pendientes" value={pending.length.toLocaleString()} />
            </div>

            <Card className="p-4 flex flex-wrap items-center gap-3">
              {!running ? (
                <Button onClick={runEnrichment} disabled={pending.length === 0}>
                  <Play className="h-4 w-4 mr-2" />
                  {pending.length === 0 ? "Sin pendientes" : `Procesar ${pending.length}`}
                </Button>
              ) : (
                <Button variant="destructive" onClick={() => { cancelRef.current = true; }}>
                  <Square className="h-4 w-4 mr-2" /> Cancelar
                </Button>
              )}
              <Button variant="outline" onClick={exportCsv} disabled={frDeals.length === 0}>
                <Download className="h-4 w-4 mr-2" /> Export CSV
              </Button>
              <Button variant="ghost" onClick={clearStore} disabled={Object.keys(store).length === 0}>
                <Trash2 className="h-4 w-4 mr-2" /> Limpiar cache
              </Button>
              {running && (
                <div className="flex items-center gap-3 ml-auto text-sm">
                  <div className="w-48 h-2 bg-muted rounded overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                  </div>
                  <span className="tabular-nums text-muted-foreground">{progress.done} / {progress.total}</span>
                </div>
              )}
              {!SUPABASE_URL && (
                <span className="text-xs text-amber-600">Supabase no configurado (VITE_SUPABASE_URL)</span>
              )}
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Empresas FR ({filteredDeals.length})</h3>
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
                            : <span className="text-destructive">Error</span>}
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
                          <td className="px-3 py-1.5">{t.type}</td>
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
