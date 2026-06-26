import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import {
  fetchStrategyCompanies,
  importStrategyCsv,
  pivotData,
  STRATEGY_EMAILS,
  type StrategyCompany,
  type PivotAgg,
} from "@/lib/strategyStore";
import { applyCountryTheme } from "@/lib/countryConfig";
import { Upload, BarChart3, Table2, Search, ChevronDown, ChevronUp, X } from "lucide-react";

type SortCol = keyof StrategyCompany;
type ViewMode = "table" | "pivot";

const FILTER_KEYS = [
  { key: "tipo_empresa" as const, label: "Tipo" },
  { key: "industria" as const, label: "Industria" },
  { key: "plan_name" as const, label: "Plan" },
  { key: "provenance" as const, label: "Provenance" },
  { key: "conversion" as const, label: "Conversión" },
  { key: "pipeline" as const, label: "Pipeline" },
];

const PIVOT_DIMS: { key: keyof StrategyCompany; label: string }[] = [
  { key: "industria", label: "Industria" },
  { key: "tipo_empresa", label: "Tipo empresa" },
  { key: "plan_name", label: "Plan" },
  { key: "provenance", label: "Provenance" },
  { key: "conversion", label: "Conversión" },
  { key: "pipeline", label: "Pipeline" },
  { key: "stage", label: "Stage" },
  { key: "ciudad", label: "Ciudad" },
  { key: "sector", label: "Sector" },
];

const AGG_OPTIONS: { key: PivotAgg; label: string }[] = [
  { key: "count", label: "Count" },
  { key: "sum_cmrr", label: "Sum CMRR" },
  { key: "sum_seats", label: "Total Seats" },
  { key: "avg_seats", label: "Avg Seats" },
];

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(Math.round(n));
}

function parseCsvText(text: string): Record<string, string>[] {
  const lines = text.split("\n");
  if (lines.length < 2) return [];

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headerLine = lines[0].replace(/^﻿/, "");
  const headers = parseRow(headerLine).map((h) => h.replace(/^"|"$/g, ""));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const vals = parseRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => { row[h] = (vals[j] ?? "").replace(/^"|"$/g, ""); });
    rows.push(row);
  }
  return rows;
}

export function StrategyPage() {
  const navigate = useNavigate();
  const { email } = useAuth();
  const country = window.localStorage.getItem("pre-event-country") ?? "";

  useEffect(() => {
    if (country !== "es") { navigate("/"); return; }
    applyCountryTheme("es");
  }, [country, navigate]);

  const hasAccess = !!email && STRATEGY_EMAILS.includes(email);

  const [companies, setCompanies] = useState<StrategyCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortCol, setSortCol] = useState<SortCol>("cmrr");
  const [sortAsc, setSortAsc] = useState(false);
  const [view, setView] = useState<ViewMode>("table");
  const [pivotRow, setPivotRow] = useState<keyof StrategyCompany>("industria");
  const [pivotCol, setPivotCol] = useState<keyof StrategyCompany>("tipo_empresa");
  const [pivotAgg, setPivotAgg] = useState<PivotAgg>("count");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchStrategyCompanies();
    setCompanies(data);
    setLoading(false);
  }, []);

  useEffect(() => { if (hasAccess) load(); }, [hasAccess, load]);

  const filtered = useMemo(() => {
    let rows = companies;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((r) =>
        r.company_name.toLowerCase().includes(q) ||
        r.industria.toLowerCase().includes(q) ||
        r.ciudad.toLowerCase().includes(q) ||
        r.pipeline.toLowerCase().includes(q)
      );
    }
    for (const [k, v] of Object.entries(filters)) {
      if (v) rows = rows.filter((r) => String(r[k as keyof StrategyCompany]) === v);
    }
    return rows;
  }, [companies, search, filters]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      if (typeof av === "number" && typeof bv === "number") return sortAsc ? av - bv : bv - av;
      return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return copy;
  }, [filtered, sortCol, sortAsc]);

  const paged = useMemo(() => sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [sorted, page]);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);

  const filterOptions = useMemo(() => {
    const opts: Record<string, string[]> = {};
    for (const { key } of FILTER_KEYS) {
      const set = new Set<string>();
      companies.forEach((r) => { const v = String(r[key]); if (v) set.add(v); });
      opts[key] = Array.from(set).sort();
    }
    return opts;
  }, [companies]);

  // KPIs
  const kpis = useMemo(() => {
    const total = filtered.length;
    const activos = filtered.filter((r) => r.tipo_empresa === "Cliente Activo").length;
    const totalCmrr = filtered.reduce((s, r) => s + (r.cmrr || 0), 0);
    const totalSeats = filtered.reduce((s, r) => s + (r.total_seats || 0), 0);
    const avgSeats = activos > 0 ? Math.round(totalSeats / activos) : 0;
    return { total, activos, totalCmrr, totalSeats, avgSeats };
  }, [filtered]);

  const pivot = useMemo(() => {
    if (view !== "pivot") return null;
    return pivotData(filtered, pivotRow, pivotCol, pivotAgg);
  }, [filtered, view, pivotRow, pivotCol, pivotAgg]);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportProgress("Leyendo CSV...");

    const text = await file.text();
    const rows = parseCsvText(text);
    setImportProgress(`${rows.length} filas parseadas, importando...`);

    const { inserted, errors } = await importStrategyCsv(rows, (done, total) => {
      setImportProgress(`${done}/${total} filas...`);
    });

    setImportProgress(`Listo: ${inserted} importadas, ${errors} errores`);
    setImporting(false);
    load();
  };

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(false); }
    setPage(0);
  };

  const SortIcon = ({ col }: { col: SortCol }) => {
    if (sortCol !== col) return null;
    return sortAsc ? <ChevronUp className="h-3 w-3 inline ml-0.5" /> : <ChevronDown className="h-3 w-3 inline ml-0.5" />;
  };

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold text-foreground">Acceso restringido</p>
          <p className="text-sm text-muted-foreground">Esta sección solo está disponible para el equipo de estrategia ES.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] px-6 py-6 lg:px-8 lg:py-8 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Strategy</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Base de datos de empresas — España
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-border p-0.5 text-xs">
            <button
              onClick={() => setView("table")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${view === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Table2 className="h-3.5 w-3.5" /> Tabla
            </button>
            <button
              onClick={() => setView("pivot")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${view === "pivot" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <BarChart3 className="h-3.5 w-3.5" /> Pivot
            </button>
          </div>
          {/* Import */}
          <label className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium cursor-pointer hover:bg-muted/50 transition-colors">
            <Upload className="h-3.5 w-3.5" />
            {importing ? importProgress : "Importar CSV"}
            <input type="file" accept=".csv" onChange={handleImport} className="hidden" disabled={importing} />
          </label>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total empresas", value: fmtNum(kpis.total) },
          { label: "Clientes activos", value: fmtNum(kpis.activos) },
          { label: "CMRR total", value: fmtNum(kpis.totalCmrr) + " €" },
          { label: "Total seats", value: fmtNum(kpis.totalSeats) },
          { label: "Avg seats (activos)", value: String(kpis.avgSeats) },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-border bg-card p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{kpi.label}</div>
            <div className="text-2xl font-bold tabular-nums leading-none mt-1.5">{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar empresa..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="h-8 rounded-lg border border-border bg-background pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 w-48"
          />
        </div>
        {FILTER_KEYS.map(({ key, label }) => (
          <select
            key={key}
            value={filters[key] ?? ""}
            onChange={(e) => { setFilters((f) => ({ ...f, [key]: e.target.value })); setPage(0); }}
            className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 max-w-[160px]"
          >
            <option value="">{label} (todos)</option>
            {(filterOptions[key] ?? []).map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        ))}
        {Object.values(filters).some(Boolean) && (
          <button
            onClick={() => { setFilters({}); setSearch(""); setPage(0); }}
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3 w-3" /> Limpiar
          </button>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">{filtered.length} resultados</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <p className="text-sm text-muted-foreground animate-pulse">Cargando datos...</p>
        </div>
      ) : companies.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-2">
          <p className="text-sm text-muted-foreground">No hay datos. Importa el CSV para empezar.</p>
        </div>
      ) : view === "table" ? (
        <>
          {/* Data table */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  {([
                    ["company_name", "Empresa"],
                    ["industria", "Industria"],
                    ["ciudad", "Ciudad"],
                    ["empresa_size", "Size"],
                    ["plan_name", "Plan"],
                    ["tipo_empresa", "Tipo"],
                    ["cmrr", "CMRR"],
                    ["total_seats", "Seats"],
                    ["provenance", "Provenance"],
                    ["conversion", "Conversión"],
                    ["pipeline", "Pipeline"],
                  ] as [SortCol, string][]).map(([col, label]) => (
                    <th
                      key={col}
                      onClick={() => handleSort(col)}
                      className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-bold cursor-pointer hover:text-foreground select-none whitespace-nowrap"
                    >
                      {label}<SortIcon col={col} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-medium max-w-[200px] truncate">{r.company_name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.industria}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.ciudad}</td>
                    <td className="px-3 py-2 tabular-nums text-right">{r.empresa_size || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[140px] truncate">{r.plan_name || "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                        r.tipo_empresa === "Cliente Activo"
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                          : "bg-muted text-muted-foreground ring-border"
                      }`}>
                        {r.tipo_empresa || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-right font-medium">{r.cmrr ? fmtNum(r.cmrr) : "—"}</td>
                    <td className="px-3 py-2 tabular-nums text-right">{r.total_seats || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground text-[10px]">{r.provenance || "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                        r.conversion === "converted"
                          ? "bg-blue-50 text-blue-700 ring-blue-200"
                          : r.conversion === "onboarding"
                          ? "bg-amber-50 text-amber-700 ring-amber-200"
                          : "bg-muted text-muted-foreground ring-border"
                      }`}>
                        {r.conversion || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground text-[10px] max-w-[120px] truncate">{r.pipeline || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Página {page + 1} de {totalPages}</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="rounded-md border border-border px-2.5 py-1 hover:bg-muted disabled:opacity-40 transition-colors"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="rounded-md border border-border px-2.5 py-1 hover:bg-muted disabled:opacity-40 transition-colors"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        /* Pivot table */
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5">
              <span className="text-muted-foreground font-medium">Filas:</span>
              <select
                value={pivotRow}
                onChange={(e) => setPivotRow(e.target.value as keyof StrategyCompany)}
                className="h-7 rounded-md border border-border bg-background px-2 text-xs"
              >
                {PIVOT_DIMS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-muted-foreground font-medium">Columnas:</span>
              <select
                value={pivotCol}
                onChange={(e) => setPivotCol(e.target.value as keyof StrategyCompany)}
                className="h-7 rounded-md border border-border bg-background px-2 text-xs"
              >
                {PIVOT_DIMS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-muted-foreground font-medium">Valor:</span>
              <select
                value={pivotAgg}
                onChange={(e) => setPivotAgg(e.target.value as PivotAgg)}
                className="h-7 rounded-md border border-border bg-background px-2 text-xs"
              >
                {AGG_OPTIONS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select>
            </label>
          </div>

          {pivot && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-bold sticky left-0 bg-muted/50 z-10">
                      {PIVOT_DIMS.find((d) => d.key === pivotRow)?.label}
                    </th>
                    {pivot.colLabels.map((c) => (
                      <th key={c} className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground font-bold whitespace-nowrap max-w-[100px] truncate">
                        {c}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-foreground font-bold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {pivot.rowLabels.map((r, ri) => {
                    const rowTotal = pivot.cells[ri].reduce((s, v) => s + v, 0);
                    return (
                      <tr key={r} className="border-t border-border hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium sticky left-0 bg-card z-10 max-w-[180px] truncate">{r}</td>
                        {pivot.cells[ri].map((v, ci) => (
                          <td key={ci} className="px-3 py-2 tabular-nums text-right text-muted-foreground">
                            {v > 0 ? fmtNum(v) : <span className="text-border">—</span>}
                          </td>
                        ))}
                        <td className="px-3 py-2 tabular-nums text-right font-bold">{fmtNum(rowTotal)}</td>
                      </tr>
                    );
                  })}
                  {/* Totals row */}
                  <tr className="border-t-2 border-border bg-muted/30">
                    <td className="px-3 py-2 font-bold sticky left-0 bg-muted/30 z-10">Total</td>
                    {pivot.colLabels.map((_, ci) => {
                      const colTotal = pivot.rowLabels.reduce((s, __, ri) => s + pivot.cells[ri][ci], 0);
                      return <td key={ci} className="px-3 py-2 tabular-nums text-right font-bold">{fmtNum(colTotal)}</td>;
                    })}
                    <td className="px-3 py-2 tabular-nums text-right font-bold">
                      {fmtNum(pivot.cells.reduce((s, row) => s + row.reduce((rs, v) => rs + v, 0), 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
