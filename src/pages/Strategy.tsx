import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import {
  fetchStrategyCompanies,
  importStrategyCsv,
  STRATEGY_EMAILS,
  type StrategyCompany,
  type PivotAgg,
} from "@/lib/strategyStore";
import { standardIndustry, normProvenance, groupPipeline, STANDARD_INDUSTRIES } from "@/lib/strategyNormalize";
import { resolveCCAA, CCAA_LIST } from "@/lib/strategyCCAA";
import { applyCountryTheme } from "@/lib/countryConfig";
import {
  Upload, BarChart3, Table2, Search, ChevronDown, ChevronUp, X,
  Building2, Users, TrendingUp, Target, Hash,
} from "lucide-react";

type ViewMode = "table" | "pivot";

// Normalized row for display — raw data + computed fields
interface NormRow extends StrategyCompany {
  _industry: string;
  _provenance: string;
  _pipeline: string;
  _segment: string;
  _ccaa: string;
  _ccaaCode: string;
}

function sizeSegment(n: number): string {
  if (!n || n <= 0) return "Others";
  if (n <= 50) return "S (1-50)";
  if (n <= 200) return "M (51-200)";
  if (n <= 500) return "L (201-500)";
  return "XL (500+)";
}

const FILTER_KEYS: { key: keyof NormRow; label: string }[] = [
  { key: "_ccaa", label: "Región" },
  { key: "_segment", label: "Tamaño" },
  { key: "tipo_empresa", label: "Tipo" },
  { key: "_industry", label: "Industria" },
  { key: "_provenance", label: "Provenance" },
  { key: "_pipeline", label: "Pipeline" },
];

const PIVOT_DIMS: { key: keyof NormRow; label: string }[] = [
  { key: "_ccaa", label: "Región" },
  { key: "_industry", label: "Industria" },
  { key: "_segment", label: "Tamaño" },
  { key: "tipo_empresa", label: "Tipo empresa" },
  { key: "_provenance", label: "Provenance" },
  { key: "_pipeline", label: "Pipeline" },
];

const AGG_OPTIONS: { key: PivotAgg; label: string; unit?: string }[] = [
  { key: "count", label: "Count" },
  { key: "sum_cmrr", label: "Sum CMRR" },
  { key: "sum_seats", label: "Total Seats" },
  { key: "avg_seats", label: "Avg Seats" },
  { key: "demo_rate", label: "% con Demo", unit: "%" },
  { key: "conv_rate", label: "% Clientes", unit: "%" },
];

function fmtNum(n: number, unit?: string): string {
  if (unit === "%") return n + "%";
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

// Pivot helper (inline to work with NormRow)
function pivotNorm(
  rows: NormRow[],
  rowKey: keyof NormRow,
  colKey: keyof NormRow,
  agg: PivotAgg,
) {
  const rowSet = new Map<string, number>();
  const colSet = new Map<string, number>();

  for (const r of rows) {
    const rv = String(r[rowKey] || "—");
    const cv = String(r[colKey] || "—");
    if (!rowSet.has(rv)) rowSet.set(rv, rowSet.size);
    if (!colSet.has(cv)) colSet.set(cv, colSet.size);
  }

  const rowLabels = Array.from(rowSet.keys());
  const colLabels = Array.from(colSet.keys());
  const cells: number[][] = rowLabels.map(() => colLabels.map(() => 0));
  const counts: number[][] = rowLabels.map(() => colLabels.map(() => 0));

  for (const r of rows) {
    const ri = rowSet.get(String(r[rowKey] || "—"))!;
    const ci = colSet.get(String(r[colKey] || "—"))!;
    counts[ri][ci]++;
    if (agg === "count") cells[ri][ci]++;
    else if (agg === "sum_cmrr") cells[ri][ci] += r.cmrr || 0;
    else if (agg === "sum_seats") cells[ri][ci] += r.total_seats || 0;
    else if (agg === "avg_seats") cells[ri][ci] += r.total_seats || 0;
    else if (agg === "demo_rate") { if (r.deal_after_demo_date) cells[ri][ci]++; }
    else if (agg === "conv_rate") { if (r.conversion === "converted" || r.conversion === "onboarding") cells[ri][ci]++; }
  }

  if (agg === "avg_seats") {
    for (let ri = 0; ri < rowLabels.length; ri++)
      for (let ci = 0; ci < colLabels.length; ci++)
        cells[ri][ci] = counts[ri][ci] > 0 ? Math.round(cells[ri][ci] / counts[ri][ci]) : 0;
  }

  if (agg === "demo_rate" || agg === "conv_rate") {
    for (let ri = 0; ri < rowLabels.length; ri++)
      for (let ci = 0; ci < colLabels.length; ci++)
        cells[ri][ci] = counts[ri][ci] > 0 ? Math.round((cells[ri][ci] / counts[ri][ci]) * 100) : 0;
  }

  // Sort by row total desc
  const rowTotals = rowLabels.map((_, ri) => cells[ri].reduce((s, v) => s + v, 0));
  const indices = rowTotals.map((_, i) => i).sort((a, b) => rowTotals[b] - rowTotals[a]);

  return {
    rowLabels: indices.map((i) => rowLabels[i]),
    colLabels,
    cells: indices.map((i) => cells[i]),
  };
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  const active = selected.length > 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`h-8 flex items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors select-none ${
          active
            ? "border-primary/40 bg-primary/5 text-foreground font-medium"
            : "border-border bg-background text-muted-foreground hover:text-foreground"
        }`}
      >
        {label}
        {active && (
          <span className="inline-flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
            {selected.length}
          </span>
        )}
        <ChevronDown className="h-3 w-3 opacity-40" />
      </button>
      {open && (
        <div className="absolute top-9 left-0 z-50 min-w-[180px] max-w-[240px] rounded-xl border border-border bg-card shadow-lg py-1.5 max-h-64 overflow-y-auto">
          {options.map((v) => (
            <label
              key={v}
              className="flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-muted/50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.includes(v)}
                onChange={() => toggle(v)}
                className="h-3.5 w-3.5 rounded accent-primary"
              />
              <span className="truncate">{v}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
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

  const [raw, setRaw] = useState<StrategyCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [sortCol, setSortCol] = useState<keyof NormRow>("cmrr");
  const [sortAsc, setSortAsc] = useState(false);
  const [view, setView] = useState<ViewMode>("table");
  const [pivotRow, setPivotRow] = useState<keyof NormRow>("_ccaa");
  const [pivotCol, setPivotCol] = useState<keyof NormRow>("tipo_empresa");
  const [pivotAgg, setPivotAgg] = useState<PivotAgg>("count");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchStrategyCompanies();
    setRaw(data);
    setLoading(false);
  }, []);

  useEffect(() => { if (hasAccess) load(); }, [hasAccess, load]);

  // Normalize all rows once
  const companies = useMemo<NormRow[]>(() =>
    raw.map((r) => {
      const ccaaResult = resolveCCAA(r.ciudad);
      return {
        ...r,
        _industry: standardIndustry(r.industria),
        _provenance: normProvenance(r.provenance),
        _pipeline: groupPipeline(r.pipeline),
        _segment: sizeSegment(r.empresa_size),
        _ccaa: ccaaResult.ccaa === "Unknown" ? "Others" : ccaaResult.ccaa,
        _ccaaCode: ccaaResult.code,
      };
    }),
  [raw]);

  const filtered = useMemo(() => {
    let rows = companies;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => r.company_name.toLowerCase().includes(q));
    }
    for (const [k, vals] of Object.entries(filters)) {
      if (vals.length) rows = rows.filter((r) => vals.includes(String(r[k as keyof NormRow])));
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
      companies.forEach((r) => { const v = String(r[key]); if (v && v !== "—") set.add(v); });
      const arr = Array.from(set).sort();
      if (key === "_industry") {
        arr.sort((a, b) => {
          const ai = STANDARD_INDUSTRIES.indexOf(a);
          const bi = STANDARD_INDUSTRIES.indexOf(b);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });
      }
      if (key === "_ccaa") {
        arr.sort((a, b) => {
          const ai = CCAA_LIST.indexOf(a);
          const bi = CCAA_LIST.indexOf(b);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });
      }
      if (key === "_segment") {
        arr.sort((a, b) => {
          const order = ["S (1-50)", "M (51-200)", "L (201-500)", "XL (500+)"];
          return order.indexOf(a) - order.indexOf(b);
        });
      }
      opts[key] = arr;
    }
    return opts;
  }, [companies]);

  const activeFilterCount = Object.values(filters).reduce((s, v) => s + v.length, 0) + (search ? 1 : 0);

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
    return pivotNorm(filtered, pivotRow, pivotCol, pivotAgg);
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

  const handleSort = (col: keyof NormRow) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(false); }
    setPage(0);
  };

  const SortIcon = ({ col }: { col: keyof NormRow }) => {
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

  const segmentColor = (s: string) => {
    if (s.startsWith("S")) return "bg-sky-50 text-sky-700 ring-sky-200";
    if (s.startsWith("M")) return "bg-amber-50 text-amber-700 ring-amber-200";
    if (s.startsWith("L")) return "bg-orange-50 text-orange-700 ring-orange-200";
    if (s.startsWith("X")) return "bg-rose-50 text-rose-700 ring-rose-200";
    return "bg-muted text-muted-foreground ring-border";
  };

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
              placeholder="Buscar empresa..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="h-8 rounded-lg border border-border bg-background pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 w-52"
            />
          </div>
          <div className="h-5 w-px bg-border" />
          {FILTER_KEYS.map(({ key, label }) => (
            <MultiSelect
              key={key}
              label={label}
              options={filterOptions[key] ?? []}
              selected={filters[key] ?? []}
              onChange={(v) => { setFilters((f) => ({ ...f, [key]: v })); setPage(0); }}
            />
          ))}
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
                    ["_ccaa", "CCAA", "text-left"],
                    ["_industry", "Industria", "text-left"],
                    ["_segment", "Tamaño", "text-left"],
                    ["tipo_empresa", "Tipo", "text-left"],
                    ["cmrr", "CMRR", "text-right"],
                    ["total_seats", "Seats", "text-right"],
                    ["_provenance", "Source", "text-left"],
                    ["_pipeline", "Pipeline", "text-left"],
                    ["conversion", "Conv.", "text-left"],
                  ] as [keyof NormRow, string, string][]).map(([col, label, align]) => (
                    <th
                      key={String(col)}
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
                    <td className="px-3 py-2 text-muted-foreground text-[10px] whitespace-nowrap">{r._ccaa !== "Unknown" ? r._ccaa : <span className="text-border">—</span>}</td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[160px] truncate">{r._industry}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${segmentColor(r._segment)}`}>
                        {r._segment}
                      </span>
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
                    <td className="px-3 py-2 text-muted-foreground text-[10px]">{r._provenance || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground text-[10px]">{r._pipeline || "—"}</td>
                    <td className="px-3 py-2">
                      {r.conversion === "converted" ? (
                        <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">
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
                <button onClick={() => setPage(0)} disabled={page === 0}
                  className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-30 transition-colors">«</button>
                <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
                  className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-30 transition-colors">Anterior</button>
                <div className="flex items-center gap-0.5 px-2">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let p: number;
                    if (totalPages <= 5) p = i;
                    else if (page < 3) p = i;
                    else if (page > totalPages - 4) p = totalPages - 5 + i;
                    else p = page - 2 + i;
                    return (
                      <button key={p} onClick={() => setPage(p)}
                        className={`h-7 w-7 rounded-md text-xs tabular-nums transition-colors ${
                          p === page ? "bg-primary text-primary-foreground font-bold" : "hover:bg-muted text-muted-foreground"
                        }`}>{p + 1}</button>
                    );
                  })}
                </div>
                <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
                  className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-30 transition-colors">Siguiente</button>
                <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}
                  className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-30 transition-colors">»</button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <label className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Filas</span>
                <select value={pivotRow} onChange={(e) => setPivotRow(e.target.value as keyof NormRow)}
                  className="h-8 rounded-lg border border-border bg-background px-3 text-xs font-medium">
                  {PIVOT_DIMS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                </select>
              </label>
              <span className="text-muted-foreground/40">×</span>
              <label className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Columnas</span>
                <select value={pivotCol} onChange={(e) => setPivotCol(e.target.value as keyof NormRow)}
                  className="h-8 rounded-lg border border-border bg-background px-3 text-xs font-medium">
                  {PIVOT_DIMS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                </select>
              </label>
              <span className="text-muted-foreground/40">=</span>
              <label className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Valor</span>
                <select value={pivotAgg} onChange={(e) => setPivotAgg(e.target.value as PivotAgg)}
                  className="h-8 rounded-lg border border-primary/30 bg-primary/5 px-3 text-xs font-semibold text-primary">
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
                        {c}
                      </th>
                    ))}
                    <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider font-bold text-foreground bg-muted/60">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pivot.rowLabels.map((r, ri) => {
                    const isRate = pivotAgg === "demo_rate" || pivotAgg === "conv_rate";
                    const rowVals = pivot.cells[ri].filter(v => v > 0);
                    const rowSummary = isRate
                      ? (rowVals.length > 0 ? Math.round(rowVals.reduce((s,v) => s+v, 0) / rowVals.length) : 0)
                      : pivot.cells[ri].reduce((s, v) => s + v, 0);
                    const aggUnit = AGG_OPTIONS.find(a => a.key === pivotAgg)?.unit;
                    return (
                      <tr key={r} className="border-t border-border/60 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2 font-medium sticky left-0 bg-card z-10 max-w-[200px] truncate border-r border-border/40">
                          {r}
                        </td>
                        {pivot.cells[ri].map((v, ci) => {
                          const intensity = v > 0 ? Math.max(0.04, (v / pivotMax) * (isRate ? 0.22 : 0.18)) : 0;
                          const bg = v > 0
                            ? isRate
                              ? `oklch(0.55 0.18 145 / ${intensity})`   // green for rates
                              : `oklch(0.55 0.18 25 / ${intensity})`    // red/orange for counts
                            : undefined;
                          return (
                            <td key={ci} className="px-3 py-2 tabular-nums text-right"
                              style={bg ? { backgroundColor: bg } : undefined}>
                              {v > 0 ? <span className="font-medium text-foreground">{fmtNum(v, aggUnit)}</span> : <span className="text-border">·</span>}
                            </td>
                          );
                        })}
                        <td className="px-4 py-2 tabular-nums text-right font-bold bg-muted/30 border-l border-border/40">
                          {fmtNum(rowSummary, aggUnit)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-border bg-muted/40">
                    <td className="px-4 py-2.5 font-bold sticky left-0 bg-muted/40 z-10 border-r border-border/40">
                      {(pivotAgg === "demo_rate" || pivotAgg === "conv_rate") ? "Avg %" : "Total"}
                    </td>
                    {pivot.colLabels.map((_, ci) => {
                      const isRate = pivotAgg === "demo_rate" || pivotAgg === "conv_rate";
                      const aggUnit = AGG_OPTIONS.find(a => a.key === pivotAgg)?.unit;
                      const vals = pivot.cells.map(row => row[ci]).filter(v => v > 0);
                      const colSummary = isRate
                        ? (vals.length > 0 ? Math.round(vals.reduce((s,v) => s+v, 0) / vals.length) : 0)
                        : pivot.cells.reduce((s, row) => s + row[ci], 0);
                      return <td key={ci} className="px-3 py-2.5 tabular-nums text-right font-bold">{fmtNum(colSummary, aggUnit)}</td>;
                    })}
                    <td className="px-4 py-2.5 tabular-nums text-right font-bold bg-muted/60 border-l border-border/40">
                      {(() => {
                        const isRate = pivotAgg === "demo_rate" || pivotAgg === "conv_rate";
                        const aggUnit = AGG_OPTIONS.find(a => a.key === pivotAgg)?.unit;
                        if (isRate) {
                          const allVals = pivot.cells.flat().filter(v => v > 0);
                          const avg = allVals.length > 0 ? Math.round(allVals.reduce((s,v) => s+v, 0) / allVals.length) : 0;
                          return fmtNum(avg, aggUnit);
                        }
                        return fmtNum(pivot.cells.reduce((s, row) => s + row.reduce((rs, v) => rs + v, 0), 0));
                      })()}
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
