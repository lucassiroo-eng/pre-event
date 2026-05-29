import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSync } from "@/lib/useSync";
import {
  lookupHubspotCompaniesByNames,
  normalizeName,
  type CompanyLookupRow,
} from "@/lib/companyLookup.functions";
import { Sidebar } from "@/components/layout/Sidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Upload, Play, Trash2, Download } from "lucide-react";
import { EnrichmentPanel } from "@/components/enrichment/EnrichmentPanel";

export const Route = createFileRoute("/data-cleaning")({
  head: () => ({ meta: [{ title: "Data cleaning · Factorial France" }] }),
  component: DataCleaningPage,
});

// ---------- CSV parsing ----------
type ClientRow = {
  companyName: string;
  mrr: number | null;
};

const CLIENTS_STORAGE_KEY = "data-cleaning-clients-v2";
const LOOKUP_STORAGE_KEY = "data-cleaning-lookup-v2";

function parseCsv(text: string): ClientRow[] {
  const clean = text.replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') { inQ = false; }
        else cur += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ",") { out.push(cur); cur = ""; }
        else cur += c;
      }
    }
    out.push(cur);
    return out;
  };
  const headers = splitLine(lines[0]).map((h) => h.trim());
  const nameIdx = headers.indexOf("company_name");
  const mrrIdx = headers.indexOf("total_actual_mrr");
  const mrrCmrrIdx = headers.indexOf("total_cmrr");
  if (nameIdx === -1) throw new Error("CSV: column 'company_name' missing");
  const seen = new Set<string>();
  const rows: ClientRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    const name = (cells[nameIdx] ?? "").trim();
    if (!name) continue;
    const key = normalizeName(name);
    if (seen.has(key)) continue;
    seen.add(key);
    const mrrRaw = mrrIdx >= 0 ? cells[mrrIdx] : mrrCmrrIdx >= 0 ? cells[mrrCmrrIdx] : "";
    const mrrNum = mrrRaw != null && mrrRaw !== "" ? Number(mrrRaw) : NaN;
    rows.push({
      companyName: name,
      mrr: Number.isFinite(mrrNum) ? mrrNum : null,
    });
  }
  return rows;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

// ---------- Page ----------

function DataCleaningPage() {
  const [tab, setTab] = useState<"demos" | "clients">("demos");
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 p-8 space-y-6">
        <PageHeader
          title="Data cleaning"
          subtitle="Calidad de datos HubSpot: cobertura de city/región en demos y clientes"
        />
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="demos">Demos (HubSpot)</TabsTrigger>
            <TabsTrigger value="clients">Clientes (CSV)</TabsTrigger>
          </TabsList>
          <TabsContent value="demos" className="mt-6 space-y-8">
            <DemosTab />
            <EnrichmentPanel scope="demos" />
          </TabsContent>
          <TabsContent value="clients" className="mt-6 space-y-8">
            <ClientsTab />
            <EnrichmentPanel scope="wons" />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// ---------- Demos tab ----------

function DemosTab() {
  const { sync } = useSync();
  const stats = useMemo(() => {
    if (!sync) return null;
    const demos = sync.deals.filter((d) => d.dateEnteredDemoStage);
    const total = demos.length;
    const withCity = demos.filter((d) => d.city != null && d.city.trim() !== "").length;
    const withRegion = demos.filter((d) => d.regionCode !== "unknown").length;
    const withCompany = demos.filter((d) => d.companyId != null).length;
    return { total, withCity, withRegion, withCompany };
  }, [sync]);

  if (!sync) {
    return <Card className="p-6 text-sm text-muted-foreground">Esperando sync HubSpot…</Card>;
  }
  if (!stats) return null;

  const pct = (n: number) => (stats.total === 0 ? 0 : (n / stats.total) * 100);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total demos" value={stats.total.toLocaleString("fr-FR")} />
        <StatCard
          label="Con company asociada"
          value={`${pct(stats.withCompany).toFixed(1)}%`}
          hint={`${stats.withCompany.toLocaleString("fr-FR")} / ${stats.total.toLocaleString("fr-FR")}`}
        />
        <StatCard
          label="Con city"
          value={`${pct(stats.withCity).toFixed(1)}%`}
          hint={`${stats.withCity.toLocaleString("fr-FR")} / ${stats.total.toLocaleString("fr-FR")}`}
        />
        <StatCard
          label="Con región"
          value={`${pct(stats.withRegion).toFixed(1)}%`}
          hint={`${stats.withRegion.toLocaleString("fr-FR")} / ${stats.total.toLocaleString("fr-FR")}`}
        />
      </div>
      <Card className="p-4 text-xs text-muted-foreground">
        La región se calcula vía city (mapping FR) y se completa con el enrichment SIRENE
        (postal code → región). Si quieres mejorar el % de región, lanza un nuevo run en
        <span className="font-mono"> /enrichment</span>.
      </Card>
    </div>
  );
}

// ---------- Clients tab ----------

function ClientsTab() {
  const [clients, setClients] = useState<ClientRow[]>(() => readJson<ClientRow[]>(CLIENTS_STORAGE_KEY, []));
  const [lookup, setLookup] = useState<Record<string, CompanyLookupRow>>(
    () => readJson<Record<string, CompanyLookupRow>>(LOOKUP_STORAGE_KEY, {}),
  );
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const lookupFn = useServerFn(lookupHubspotCompaniesByNames);

  useEffect(() => { writeJson(CLIENTS_STORAGE_KEY, clients); }, [clients]);
  useEffect(() => { writeJson(LOOKUP_STORAGE_KEY, lookup); }, [lookup]);

  const onFile = useCallback(async (file: File) => {
    setError(null);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) throw new Error("CSV vacío o sin company_name válidos");
      setClients(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error parseando CSV");
    }
  }, []);

  const runLookup = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setError(null);
    cancelRef.current = false;
    const pending = clients.filter((c) => !lookup[normalizeName(c.companyName)]);
    setProgress({ done: 0, total: pending.length });
    const BATCH = 50;
    const next = { ...lookup };
    for (let i = 0; i < pending.length; i += BATCH) {
      if (cancelRef.current) break;
      const batch = pending.slice(i, i + BATCH);
      try {
        const res = await lookupFn({ data: { names: batch.map((b) => b.companyName) } });
        for (const r of res.results) next[r.key] = r;
        setLookup({ ...next });
        setProgress({ done: Math.min(i + batch.length, pending.length), total: pending.length });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error en lookup");
        break;
      }
    }
    setRunning(false);
  }, [clients, lookup, lookupFn, running]);

  const enriched = useMemo(
    () => clients.map((c) => ({ ...c, hs: lookup[normalizeName(c.companyName)] ?? null })),
    [clients, lookup],
  );

  const stats = useMemo(() => {
    const total = enriched.length;
    const matched = enriched.filter((r) => r.hs?.found).length;
    const withCity = enriched.filter((r) => r.hs?.city && r.hs.city.trim() !== "").length;
    const withRegion = enriched.filter((r) => r.hs && r.hs.regionCode !== "unknown").length;
    return { total, matched, withCity, withRegion };
  }, [enriched]);

  const pct = (n: number, d: number) => (d === 0 ? 0 : (n / d) * 100);

  const clearAll = () => {
    if (!confirm("Borrar CSV y resultados?")) return;
    setClients([]);
    setLookup({});
    setProgress({ done: 0, total: 0 });
  };

  const exportCsv = () => {
    const header = ["company_name", "mrr", "hs_id", "hs_name", "hs_city", "hs_zip", "region"].join(",");
    const rows = enriched.map((r) =>
      [
        r.companyName,
        r.mrr ?? "",
        r.hs?.hubspotId ?? "",
        r.hs?.name ?? "",
        r.hs?.city ?? "",
        r.hs?.zip ?? "",
        r.hs?.regionCode ?? "",
      ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","),
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clients-data-cleaning-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pendingCount = clients.filter((c) => !lookup[normalizeName(c.companyName)]).length;

  return (
    <div className="space-y-4">
      {/* Upload */}
      <Card
        className="p-6 border-dashed cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
      >
        <div className="flex items-center gap-3 text-sm">
          <Upload className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1">
            <div className="font-medium">Sube el CSV de clientes</div>
            <div className="text-xs text-muted-foreground">
              Drag & drop o click. Columnas requeridas:{" "}
              <span className="font-mono">company_name</span>,{" "}
              <span className="font-mono">total_actual_mrr</span> (o{" "}
              <span className="font-mono">total_cmrr</span>). Match por nombre (case-insensitive).
            </div>
          </div>
          {clients.length > 0 && (
            <div className="text-xs text-muted-foreground">
              {clients.length.toLocaleString("fr-FR")} filas cargadas
            </div>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      </Card>

      {error && (
        <Card className="p-3 text-xs text-destructive border-destructive/50">{error}</Card>
      )}

      {clients.length > 0 && (
        <>
          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button onClick={runLookup} disabled={running} size="sm">
              <Play className="h-3.5 w-3.5 mr-1.5" />
              {running
                ? `Buscando… ${progress.done}/${progress.total}`
                : `Buscar en HubSpot (${pendingCount} pendientes)`}
            </Button>
            {Object.keys(lookup).length > 0 && (
              <Button onClick={exportCsv} variant="outline" size="sm">
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Export CSV
              </Button>
            )}
            <div className="flex-1" />
            <Button onClick={clearAll} variant="ghost" size="sm">
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Borrar todo
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            <StatCard label="Clientes en CSV" value={stats.total.toLocaleString("fr-FR")} />
            <StatCard
              label="Matched en HubSpot"
              value={`${pct(stats.matched, stats.total).toFixed(1)}%`}
              hint={`${stats.matched.toLocaleString("fr-FR")} / ${stats.total.toLocaleString("fr-FR")}`}
            />
            <StatCard
              label="Con city"
              value={`${pct(stats.withCity, stats.total).toFixed(1)}%`}
              hint={`${stats.withCity.toLocaleString("fr-FR")} / ${stats.total.toLocaleString("fr-FR")}`}
            />
            <StatCard
              label="Con región"
              value={`${pct(stats.withRegion, stats.total).toFixed(1)}%`}
              hint={`${stats.withRegion.toLocaleString("fr-FR")} / ${stats.total.toLocaleString("fr-FR")}`}
            />
          </div>

        </>
      )}
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}
