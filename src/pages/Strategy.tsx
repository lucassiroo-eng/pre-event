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
import {
  Upload, BarChart3, Table2, Search, ChevronDown, ChevronUp, X,
  Building2, Users, TrendingUp, Target, Hash,
} from "lucide-react";

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

function prettifyLabel(raw: string): string {
  if (!raw || raw === "—") return "—";
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bAnd\b/g, "&")
    .replace(/\bOr\b/g, "/");
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

  const activeFilterCount = Object.values(filters).filter(Boolean).length + (search ? 1 : 0);

  const kpis = useMemo(() => {
    const total = filtered.length;
    const activos = filtered.filter((r) => r.tipo_empresa === "Cliente Activo").length;
    const totalCmrr = filtered.reduce((s, r) => s + (r.cmrr || 0), 0);
    const totalSeats = filtered.reduce((s, r) => s + (r.total_seats || 0), 0);
    const avgSeats = activos > 0 ? Math.round(totalSeats / activos) : 0;
    const convRate = total > 0 ? ((activos / total) * 100).toFixed(1) : "0";
    return { total, activos, totalCmrr, totalSeats, avgSeats, convRate };
  }, [filtered]);

  const pivot = useMemo(() => {
    if (view !== "pivot") return null;
    const raw = pivotData(filtered, pivotRow, pivotCol, pivotAgg);
    const rowTotals = raw.rowLabels.map((_, ri) => raw.cells[ri].reduce((s, v) => s + v, 0));
    const indices = rowTotals.map((_, i) => i).sort((a, b) => rowTotals[b] - rowTotals[a]);
    return {
      rowLabels: indices.map((i) => raw.rowLabels[i]),
      colLabels: raw.colLabels,
      cells: indices.map((i) => raw.cells[i]),
    };
  }, [filtered, view, pivotRow, pivotCol, pivotAgg]);

  const pivotMax = useMemo(() => {
    if (!pivot) return 1;
    let max = 0;
    for (const row of pivot.cells) for (const v of row) if (v > max) max = v;
    return max || 1;
  }, [pivot]);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportProgress("Leyendo CSV...");
    const text = await file.text();
    const rows = parseCsvText(text);
    setImportProgress(`${rows.length} filas, importando...`);
    const { inserted, errors } = await importStrategyCsv(rows, (done, total) => {
      setImportProgress(`${done}/${total}`);
    });
    setImportProgress(`${inserted} importadas${errors ? `, ${errors} errores` : ""}`);
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
    return sortAsc
      ? <ChevronUp className="h-3 w-3 inline ml-0.5 text-primary" />
      : <ChevronDown className="h-3 w-3 inline ml-0.5 text-primary" />;
  };

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-muted grid place-items-center">
            <Target className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-lg font-semibold text-foreground">Acceso restringido</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            Esta sección solo está disponible para el equipo de estrategia España.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] px-6 py-6 lg:px-8 lg:py-8 space-y-5">
      {/* Hero header */}
      <div className="rounded-2xl px-6 py-6 sm:px-8 sm:py-8 text-white shadow-sm"
        style={{ background: "var(--gradient-factorial)" }}>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-white/20 grid place-items-center">
                <Target className="h-4 w-4" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Strategy</h1>
            </div>
            <p className="text-sm text-white/70">
              Base de datos de empresas — España
              <span className="ml-3 inline-flex items-center rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-medium">
                {fmtNum(companies.length)} empresas
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg bg-white/15 p-0.5 text-xs backdrop-blur-sm">
              <button
                onClick={() => setView("table")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-all ${
                  view === "table" ? "bg-white text-foreground shadow-sm" : "text-white/80 hover:text-white"
                }`}
              >
                <Table2 className="h-3.5 w-3.5" /> Tabla
              </button>
              <button
                onClick={() => setView("pivot")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-all ${
                  view === "pivot" ? "bg-white text-foreground shadow-sm" : "text-white/80 hover:text-white"
                }`}
              >
                <BarChart3 className="h-3.5 w-3.5" /> Pivot
              </button>
            </div>
            <label className="flex items-center gap-1.5 rounded-lg bg-white/15 backdrop-blur-sm px-3 py-1.5 text-xs font-medium cursor-pointer hover:bg-white/25 transition-colors">
              <Upload className="h-3.5 w-3.5" />
              {importing ? importProgress : "Importar CSV"}
              <input type="file" accept=".csv" onChange={handleImport} className="hidden" disabled={importing} />
            </label>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Total empresas", value: fmtNum(kpis.total), icon: Building2, color: "text-primary" },
          { label: "Clientes activos", value: fmtNum(kpis.activos), icon: Users, color: "text-emerald-600" },
          { label: "CMRR total", value: fmtNum(kpis.totalCmrr) + " €", icon: TrendingUp, color: "text-blue-600" },
          { label: "Total seats", value: fmtNum(kpis.totalSeats), icon: Hash, color: "text-violet-600" },
          { label: "Avg seats", value: String(kpis.avgSeats), icon: Users, color: "text-amber-600" },
          { label: "Conv. rate", value: kpis.convRate + "%", icon: Target, color: "text-rose-600" },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="rounded-xl border border-border bg-card p-4 space-y-2 transition-all hover:shadow-sm hover:border-primary/30">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{kpi.label}</span>
                <Icon className={`h-3.5 w-3.5 ${kpi.color} opacity-60`} />
              </div>
              <div className="text-2xl font-bold tabular-nums leading-none">{kpi.value}</div>
            </div>
          );
        })}
      </div>

      {/* Filters bar */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar empresa, industria, ciudad..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="h-8 rounded-lg border border-border bg-background pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 w-56"
            />
          </div>
          <div className="h-5 w-px bg-border" />
          {FILTER_KEYS.map(({ key, label }) => {
            const active = !!filters[key];
            return (
              <select
                key={key}
                value={filters[key] ?? ""}
                onChange={(e) => { setFilters((f) => ({ ...f, [key]: e.target.value })); setPage(0); }}
                className={`h-8 rounded-lg border px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 max-w-[150px] transition-colors ${
                  active
                    ? "border-primary/40 bg-primary/5 text-foreground font-medium"
                    : "border-border bg-background text-muted-foreground"
                }`}
              >
                <option value="">{label}</option>
                {(filterOptions[key] ?? []).map((v) => (
                  <option key={v} value={v}>{prettifyLabel(v)}</option>
                ))}
              </select>
            );
          })}
          {activeFilterCount > 0 && (
            <button
              onClick={() => { setFilters({}); setSearch(""); setPage(0); }}
              className="flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-[11px] font-medium hover:bg-primary/20 transition-colors"
            >
              <X className="h-3 w-3" /> Limpiar ({activeFilterCount})
            </button>
          )}
          <span className="text-[10px] text-muted-foreground ml-auto tabular-nums font-medium">
            {filtered.length.toLocaleString()} resultados
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Cargando datos...</p>
          </div>
        </div>
      ) : companies.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-3">
          <Upload className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No hay datos. Importa el CSV para empezar.</p>
        </div>
      ) : view === "table" ? (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  {([
                    ["company_name", "Empresa", "text-left"],
                    ["industria", "Industria", "text-left"],
                    ["ciudad", "Ciudad", "text-left"],
                    ["empresa_size", "Size", "text-right"],
                    ["plan_name", "Plan", "text-left"],
                    ["tipo_empresa", "Tipo", "text-left"],
                    ["cmrr", "CMRR", "text-right"],
                    ["total_seats", "Seats", "text-right"],
                    ["provenance", "Source", "text-left"],
                    ["conversion", "Conv.", "text-left"],
                  ] as [SortCol, string, string][]).map(([col, label, align]) => (
                    <th
                      key={col}
                      onClick={() => handleSort(col)}
                      className={`px-3 py-2.5 ${align} text-[10px] uppercase tracking-wider text-muted-foreground font-bold cursor-pointer hover:text-foreground select-none whitespace-nowrap transition-colors`}
                    >
                      {label}<SortIcon col={col} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((r, idx) => (
                  <tr key={r.id} className={`border-t border-border/60 hover:bg-muted/20 transition-colors ${idx % 2 === 0 ? "" : "bg-muted/[0.04]"}`}>
                    <td className="px-3 py-2 font-semibold max-w-[220px] truncate text-foreground">{r.company_name}</td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[160px] truncate">{prettifyLabel(r.industria)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{prettifyLabel(r.ciudad)}</td>
                    <td className="px-3 py-2 tabular-nums text-right text-muted-foreground">{r.empresa_size ? r.empresa_size.toLocaleString() : "—"}</td>
                    <td className="px-3 py-2 max-w-[130px] truncate">
                      {r.plan_name ? (
                        <span className="inline-flex rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-foreground">{r.plan_name}</span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${
                        r.tipo_empresa === "Cliente Activo"
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                          : "bg-slate-50 text-slate-500 ring-slate-200"
                      }`}>
                        {r.tipo_empresa === "Cliente Activo" ? "Activo" : "Lead"}
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-right font-semibold">
                      {r.cmrr ? <span className={r.cmrr > 100000 ? "text-emerald-600" : ""}>{fmtNum(r.cmrr)}</span> : "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-right text-muted-foreground">{r.total_seats ? r.total_seats.toLocaleString() : "—"}</td>
                    <td className="px-3 py-2 text-[10px] text-muted-foreground">{r.provenance || "—"}</td>
                    <td className="px-3 py-2">
                      {r.conversion === "converted" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">
                          Converted
                        </span>
                      ) : r.conversion === "onboarding" ? (
                        <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
                          Onboarding
                        </span>
                      ) : (
                        <span className="text-[10px] text-border">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground tabular-nums">
                {(page * PAGE_SIZE + 1).toLocaleString()}–{Math.min((page + 1) * PAGE_SIZE, sorted.length).toLocaleString()} de {sorted.length.toLocaleString()}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(0)}
                  disabled={page === 0}
                  className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-30 transition-colors"
                >
                  «
                </button>
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-30 transition-colors"
                >
                  Anterior
                </button>
                <div className="flex items-center gap-0.5 px-2">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let p: number;
                    if (totalPages <= 5) p = i;
                    else if (page < 3) p = i;
                    else if (page > totalPages - 4) p = totalPages - 5 + i;
                    else p = page - 2 + i;
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`h-7 w-7 rounded-md text-xs tabular-nums transition-colors ${
                          p === page ? "bg-primary text-primary-foreground font-bold" : "hover:bg-muted text-muted-foreground"
                        }`}
                      >
                        {p + 1}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-30 transition-colors"
                >
                  Siguiente
                </button>
                <button
                  onClick={() => setPage(totalPages - 1)}
                  disabled={page >= totalPages - 1}
                  className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-30 transition-colors"
                >
                  »
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          {/* Pivot controls */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <label className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Filas</span>
                <select
                  value={pivotRow}
                  onChange={(e) => setPivotRow(e.target.value as keyof StrategyCompany)}
                  className="h-8 rounded-lg border border-border bg-background px-3 text-xs font-medium"
                >
                  {PIVOT_DIMS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                </select>
              </label>
              <span className="text-muted-foreground/40">×</span>
              <label className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Columnas</span>
                <select
                  value={pivotCol}
                  onChange={(e) => setPivotCol(e.target.value as keyof StrategyCompany)}
                  className="h-8 rounded-lg border border-border bg-background px-3 text-xs font-medium"
                >
                  {PIVOT_DIMS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                </select>
              </label>
              <span className="text-muted-foreground/40">=</span>
              <label className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Valor</span>
                <select
                  value={pivotAgg}
                  onChange={(e) => setPivotAgg(e.target.value as PivotAgg)}
                  className="h-8 rounded-lg border border-primary/30 bg-primary/5 px-3 text-xs font-semibold text-primary"
                >
                  {AGG_OPTIONS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                </select>
              </label>
            </div>
          </div>

          {pivot && (
            <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-bold sticky left-0 bg-muted/40 z-10 min-w-[180px]">
                      {PIVOT_DIMS.find((d) => d.key === pivotRow)?.label}
                    </th>
                    {pivot.colLabels.map((c) => (
                      <th key={c} className="px-3 py-2.5 text-right text-[10px] uppercase tracking-wider text-muted-foreground font-bold whitespace-nowrap">
                        {prettifyLabel(c)}
                      </th>
                    ))}
                    <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider font-bold text-foreground bg-muted/60">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pivot.rowLabels.map((r, ri) => {
                    const rowTotal = pivot.cells[ri].reduce((s, v) => s + v, 0);
                    return (
                      <tr key={r} className="border-t border-border/60 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2 font-medium sticky left-0 bg-card z-10 max-w-[200px] truncate border-r border-border/40">
                          {prettifyLabel(r)}
                        </td>
                        {pivot.cells[ri].map((v, ci) => {
                          const intensity = v > 0 ? Math.max(0.04, (v / pivotMax) * 0.18) : 0;
                          return (
                            <td
                              key={ci}
                              className="px-3 py-2 tabular-nums text-right"
                              style={v > 0 ? { backgroundColor: `oklch(0.55 0.18 25 / ${intensity})` } : undefined}
                            >
                              {v > 0 ? (
                                <span className="font-medium text-foreground">{fmtNum(v)}</span>
                              ) : (
                                <span className="text-border">·</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-4 py-2 tabular-nums text-right font-bold bg-muted/30 border-l border-border/40">
                          {fmtNum(rowTotal)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-border bg-muted/40">
                    <td className="px-4 py-2.5 font-bold sticky left-0 bg-muted/40 z-10 border-r border-border/40">Total</td>
                    {pivot.colLabels.map((_, ci) => {
                      const colTotal = pivot.cells.reduce((s, row) => s + row[ci], 0);
                      return <td key={ci} className="px-3 py-2.5 tabular-nums text-right font-bold">{fmtNum(colTotal)}</td>;
                    })}
                    <td className="px-4 py-2.5 tabular-nums text-right font-bold bg-muted/60 border-l border-border/40">
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
