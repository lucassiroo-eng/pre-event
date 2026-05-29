import { useMemo, useState } from "react";
import { useSync } from "@/lib/useSync";
import { useEnrichment, type QueueItem } from "@/lib/useEnrichment";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Download, Play, Square, Trash2 } from "lucide-react";

export function EnrichmentPanel({ scope }: { scope?: "all" | "wons" | "demos" } = {}) {
  const { sync } = useSync();
  const { store, run, running, progress, cancel, clearStore } = useEnrichment();
  const [filter, setFilter] = useState("");
  const [tabInternal, setTabInternal] = useState<"all" | "wons" | "demos">("wons");
  const tab = scope ?? tabInternal;
  const setTab = setTabInternal;
  const showTabs = !scope;

  const { queueAll, queueWons, queueDemos } = useMemo(() => {
    const all = new Map<string, QueueItem>();
    const wons = new Map<string, QueueItem>();
    const demos = new Map<string, QueueItem>();
    if (!sync) return { queueAll: [], queueWons: [], queueDemos: [] };
    for (const d of sync.deals) {
      if (d.regionCode !== "unknown") continue;
      if (!d.companyId || !d.companyName) continue;
      const item: QueueItem = {
        companyId: d.companyId,
        companyName: d.companyName,
        originalCity: d.city,
      };
      if (!all.has(d.companyId)) all.set(d.companyId, item);
      if (d.isWon && !wons.has(d.companyId)) wons.set(d.companyId, item);
      if (d.dateEnteredDemoStage && !demos.has(d.companyId)) demos.set(d.companyId, item);
    }
    const sortFn = (a: QueueItem, b: QueueItem) => a.companyName.localeCompare(b.companyName);
    return {
      queueAll: Array.from(all.values()).sort(sortFn),
      queueWons: Array.from(wons.values()).sort(sortFn),
      queueDemos: Array.from(demos.values()).sort(sortFn),
    };
  }, [sync]);

  const queue = tab === "wons" ? queueWons : tab === "demos" ? queueDemos : queueAll;
  const dealsUnknown = sync?.dealsUnknown ?? 0;
  const enrichedInQueue = queue.filter((q) => store[q.companyId]).length;
  const foundInQueue = queue.filter((q) => store[q.companyId]?.found).length;
  const recoveredInQueue = queue.filter(
    (q) => store[q.companyId]?.found && store[q.companyId].newRegionCode !== "unknown",
  ).length;
  const pendingCount = queue.length - enrichedInQueue;

  const recoveredByRegion = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of Object.values(store)) {
      if (r.found && r.newRegionCode !== "unknown") {
        m[r.newRegionCode] = (m[r.newRegionCode] ?? 0) + 1;
      }
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [store]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const rows = queue.map((qi) => ({ ...qi, record: store[qi.companyId] ?? null }));
    rows.sort((a, b) => {
      const ta = a.record?.enrichedAt ?? "";
      const tb = b.record?.enrichedAt ?? "";
      if (ta && tb) return tb.localeCompare(ta);
      if (ta) return -1;
      if (tb) return 1;
      return a.companyName.localeCompare(b.companyName);
    });
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.companyName.toLowerCase().includes(q) ||
        (r.originalCity ?? "").toLowerCase().includes(q) ||
        (r.record?.enrichedCity ?? "").toLowerCase().includes(q),
    );
  }, [queue, store, filter]);

  const exportCsv = () => {
    const header = [
      "companyId", "companyName", "originalCity", "enrichedCity",
      "postalCode", "siren", "newRegionCode", "found", "error",
    ].join(",");
    const rows = queue.map((qi) => {
      const r = store[qi.companyId];
      const cells = [
        qi.companyId, qi.companyName, qi.originalCity ?? "",
        r?.enrichedCity ?? "", r?.postalCode ?? "", r?.siren ?? "",
        r?.newRegionCode ?? "", r ? (r.found ? "true" : "false") : "", r?.error ?? "",
      ].map((c) => `"${String(c).replace(/"/g, '""')}"`);
      return cells.join(",");
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `enrichment-sirene-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">SIRENE Enrichment</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Recupera city/región de empresas FR marcadas como{" "}
          <span className="font-mono">Unknown</span> via{" "}
          <span className="font-mono">recherche-entreprises.api.gouv.fr</span>. Persistido en localStorage.
        </p>
      </div>

      {showTabs && (
        <div className="flex gap-1 border-b">
          {([
            { id: "wons", label: `Wons Unknown (${queueWons.length.toLocaleString()})` },
            { id: "demos", label: `Demos Unknown (${queueDemos.length.toLocaleString()})` },
            { id: "all", label: `Todos (${queueAll.length.toLocaleString()})` },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? "border-primary text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MiniStat label="Deals Unknown (total)" value={dealsUnknown.toLocaleString()} />
        <MiniStat label="Empresas en tab" value={queue.length.toLocaleString()} />
        <MiniStat label="Enriquecidas" value={enrichedInQueue.toLocaleString()} hint={`${foundInQueue} match SIRENE`} />
        <MiniStat label="Region recuperada" value={recoveredInQueue.toLocaleString()} hint={`${queue.length ? ((recoveredInQueue / queue.length) * 100).toFixed(0) : 0}%`} />
        <MiniStat label="Pendientes" value={pendingCount.toLocaleString()} />
      </div>

      <Card className="p-4 flex flex-wrap items-center gap-3">
        {!running ? (
          <Button onClick={() => run(queue)} disabled={pendingCount === 0 || !sync}>
            <Play className="h-4 w-4 mr-2" />
            {pendingCount === 0 ? "Sin pendientes" : `Procesar ${pendingCount.toLocaleString()} empresas`}
          </Button>
        ) : (
          <Button variant="destructive" onClick={cancel}>
            <Square className="h-4 w-4 mr-2" />
            Cancelar
          </Button>
        )}
        <Button variant="outline" onClick={exportCsv} disabled={queue.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            if (confirm("¿Borrar todos los resultados de enriquecimiento?")) clearStore();
          }}
          disabled={Object.keys(store).length === 0}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Limpiar cache
        </Button>
        {running && (
          <div className="flex items-center gap-3 ml-auto text-sm">
            <div className="w-48 h-2 bg-muted rounded overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
            <span className="tabular-nums text-muted-foreground">
              {progress.done.toLocaleString()} / {progress.total.toLocaleString()}
            </span>
          </div>
        )}
      </Card>

      {recoveredByRegion.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">Empresas recuperadas por región</h3>
          <div className="flex flex-wrap gap-2">
            {recoveredByRegion.map(([code, count]) => (
              <Badge key={code} variant="secondary" className="text-xs">{code}: {count}</Badge>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Cola de enriquecimiento ({filtered.length.toLocaleString()})</h3>
          <Input
            placeholder="Filtrar por nombre o ciudad…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-xs"
          />
        </div>
        <div className="overflow-auto max-h-[640px] border rounded">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 sticky top-0">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Empresa</th>
                <th className="px-3 py-2 font-medium">City original</th>
                <th className="px-3 py-2 font-medium">City SIRENE</th>
                <th className="px-3 py-2 font-medium">CP</th>
                <th className="px-3 py-2 font-medium">Region</th>
                <th className="px-3 py-2 font-medium">SIREN</th>
                <th className="px-3 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map((row) => (
                <tr key={row.companyId} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-1.5 font-medium">{row.companyName}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{row.originalCity ?? "—"}</td>
                  <td className="px-3 py-1.5">{row.record?.enrichedCity ?? "—"}</td>
                  <td className="px-3 py-1.5 tabular-nums">{row.record?.postalCode ?? "—"}</td>
                  <td className="px-3 py-1.5">
                    {row.record ? (
                      <Badge variant={row.record.newRegionCode === "unknown" ? "outline" : "default"} className="text-[10px]">
                        {row.record.newRegionCode}
                      </Badge>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{row.record?.siren ?? "—"}</td>
                  <td className="px-3 py-1.5">
                    {!row.record ? (
                      <span className="text-muted-foreground">Pendiente</span>
                    ) : row.record.error ? (
                      <span className="text-destructive">{row.record.error}</span>
                    ) : row.record.found ? (
                      <span className="text-emerald-600">OK</span>
                    ) : (
                      <span className="text-amber-600">No match</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 500 && (
            <div className="text-xs text-muted-foreground p-2 text-center">
              Mostrando 500 de {filtered.length.toLocaleString()}. Usa el filtro o exporta CSV.
            </div>
          )}
        </div>
      </Card>
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
