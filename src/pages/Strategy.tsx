import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import {
  fetchStrategyCompanies,
  fetchSasorTotal,
  importStrategyCsv,
  importSasorCsv,
  clearStrategyData,
  crossEnrichCcaa,
  STRATEGY_EMAILS,
  type StrategyCompany,
} from "@/lib/strategyStore";
import { standardIndustry, normProvenance, STANDARD_INDUSTRIES } from "@/lib/strategyNormalize";
import { resolveCCAA, CCAA_LIST } from "@/lib/strategyCCAA";
import { applyCountryTheme } from "@/lib/countryConfig";
import {
  Upload, Table2, Search, ChevronDown, ChevronUp, X,
  Building2, Users, TrendingUp, Target, Hash, Trash2, ArrowRight, Shuffle,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ViewMode = "segment" | "table";
type SegmentDim = "ccaa" | "size_segment" | "industry" | "provenance";

interface NormRow extends StrategyCompany {
  _industry: string;
  _provenance: string;
  _segment: string;
  _ccaa: string;
  _hasDemo: boolean;
  _isWon: boolean;
  _isActive: boolean;
}

interface SegmentRow {
  label: string;
  hubspot: number;
  demos: number;
  won: number;
  activos: number;
  cmrr: number;
  l2d: number;
  d2w: number;
  l2w: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SEGMENT_ORDER = ["S (1-50)", "M (51-200)", "L (201-500)", "XL (500+)", "Unknown", "Others"];

const FILTER_KEYS: { key: keyof NormRow; label: string }[] = [
  { key: "_ccaa", label: "Región" },
  { key: "_segment", label: "Tamaño" },
  { key: "tipo_empresa", label: "Tipo" },
  { key: "_industry", label: "Industria" },
  { key: "_provenance", label: "Provenance" },
];

const SEGMENT_DIMS: { key: SegmentDim; label: string }[] = [
  { key: "ccaa", label: "Región" },
  { key: "size_segment", label: "Tamaño" },
  { key: "industry", label: "Industria" },
  { key: "provenance", label: "Provenance" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function sizeSegment(empresaSize: number, seats: number): string {
  const n = empresaSize > 0 ? empresaSize : seats;
  if (!n || n <= 0) return "Unknown";
  if (n <= 50) return "S (1-50)";
  if (n <= 200) return "M (51-200)";
  if (n <= 500) return "L (201-500)";
  return "XL (500+)";
}

function isValidTipo(s: string): boolean {
  if (!s) return true;
  if (s.length > 30) return false;
  if (/\d|yearly|monthly|business|tracking|v\d/i.test(s)) return false;
  return true;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(Math.round(n));
}

function pct(num: number, den: number): number {
  return den > 0 ? Math.round((num / den) * 100) : 0;
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
  const headers = parseRow(headerLine).map((h) => h.replace(/^"|"$/g, "").trim());
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

// ── MultiSelect ───────────────────────────────────────────────────────────────

function MultiSelect({
  label, options, selected, onChange,
}: {
  label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void;
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
          active ? "border-primary/40 bg-primary/5 text-foreground font-medium"
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
            <label key={v} className="flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-muted/50 cursor-pointer">
              <input type="checkbox" checked={selected.includes(v)} onChange={() => toggle(v)}
                className="h-3.5 w-3.5 rounded accent-primary" />
              <span className="truncate">{v}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Funnel Step ───────────────────────────────────────────────────────────────

function FunnelStep({
  label, value, sub, color, arrow, conversion,
}: {
  label: string; value: number; sub?: string; color: string;
  arrow?: boolean; conversion?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className={`rounded-xl px-4 py-3 min-w-[110px] text-center ${color}`}>
        <div className="text-[10px] font-bold uppercase tracking-wider opacity-70 mb-0.5">{label}</div>
        <div className="text-2xl font-bold tabular-nums leading-none">{fmtNum(value)}</div>
        {sub && <div className="text-[10px] opacity-60 mt-0.5">{sub}</div>}
      </div>
      {arrow && (
        <div className="flex flex-col items-center gap-0.5 text-muted-foreground">
          {conversion !== undefined && (
            <span className="text-[10px] font-bold text-primary tabular-nums">{conversion}%</span>
          )}
          <ArrowRight className="h-4 w-4 opacity-40" />
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

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
  const [sasorTotal, setSasorTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<"strategy" | "sasor" | "cross" | null>(null);
  const [importProgress, setImportProgress] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [sortCol, setSortCol] = useState<keyof NormRow>("cmrr");
  const [sortAsc, setSortAsc] = useState(false);
  const [view, setView] = useState<ViewMode>("segment");
  const [segmentDim, setSegmentDim] = useState<SegmentDim>("ccaa");
  const [segmentSort, setSegmentSort] = useState<keyof SegmentRow>("cmrr");
  const [segmentAsc, setSegmentAsc] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const load = useCallback(async () => {
    setLoading(true);
    const [data, total] = await Promise.all([
      fetchStrategyCompanies(),
      fetchSasorTotal(),
    ]);
    setRaw(data);
    setSasorTotal(total);
    setLoading(false);
  }, []);

  useEffect(() => { if (hasAccess) load(); }, [hasAccess, load]);

  // ── Normalize rows ──────────────────────────────────────────────────────────

  const companies = useMemo<NormRow[]>(() =>
    raw
      .filter((r) => isValidTipo(r.tipo_empresa))
      .map((r) => {
        // Prefer SQL-computed fields, fall back to client-side resolution
        const ccaaFromSql = r.ccaa?.trim();
        const ccaaResolved = (() => {
          if (ccaaFromSql && ccaaFromSql !== "Others") return ccaaFromSql;
          const res = resolveCCAA(r.ciudad_enriched || r.ciudad);
          return res.ccaa === "Unknown" ? "Others" : res.ccaa;
        })();

        const provNorm = r.provenance_norm?.trim() || normProvenance(r.provenance);
        const segNorm = r.size_segment?.trim() || sizeSegment(r.empresa_size, r.total_seats);

        // Funnel flags: prefer SQL booleans, fall back to legacy fields
        const hasDemo = r.has_demo != null
          ? Boolean(r.has_demo)
          : !!(r.deal_after_demo_date || r.after_demo_date);
        const isWon = r.is_won != null
          ? Boolean(r.is_won)
          : r.conversion === "converted" || r.conversion === "onboarding";
        const isActive = r.is_active_client != null
          ? Boolean(r.is_active_client)
          : r.tipo_empresa === "Cliente Activo";

        return {
          ...r,
          _industry: standardIndustry(r.industria),
          _provenance: provNorm,
          _segment: segNorm,
          _ccaa: ccaaResolved,
          _hasDemo: hasDemo,
          _isWon: isWon,
          _isActive: isActive,
        };
      }),
  [raw]);

  // ── Filtered rows ───────────────────────────────────────────────────────────

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

  // ── Funnel counts ───────────────────────────────────────────────────────────

  const funnel = useMemo(() => {
    const hubspot = filtered.length;
    const demos = filtered.filter((r) => r._hasDemo).length;
    const won = filtered.filter((r) => r._isWon).length;
    const activos = filtered.filter((r) => r._isActive).length;
    const cmrr = filtered.reduce((s, r) => s + (r.cmrr || 0), 0);
    return {
      spain: sasorTotal,
      hubspot,
      demos,
      won,
      activos,
      cmrr,
      l2d: pct(demos, hubspot),
      d2w: pct(won, demos),
      w2a: pct(activos, won),
      hs2spain: sasorTotal > 0 ? pct(hubspot, sasorTotal) : null,
    };
  }, [filtered, sasorTotal]);

  // ── Segment table ───────────────────────────────────────────────────────────

  const segmentRows = useMemo<SegmentRow[]>(() => {
    const dimFn = (r: NormRow): string => {
      if (segmentDim === "ccaa") return r._ccaa;
      if (segmentDim === "size_segment") return r._segment;
      if (segmentDim === "industry") return r._industry;
      return r._provenance || "Others";
    };

    const map = new Map<string, { hubspot: number; demos: number; won: number; activos: number; cmrr: number }>();
    for (const r of filtered) {
      const key = dimFn(r) || "Others";
      if (!map.has(key)) map.set(key, { hubspot: 0, demos: 0, won: 0, activos: 0, cmrr: 0 });
      const g = map.get(key)!;
      g.hubspot++;
      if (r._hasDemo) g.demos++;
      if (r._isWon) g.won++;
      if (r._isActive) g.activos++;
      g.cmrr += r.cmrr || 0;
    }

    const rows: SegmentRow[] = Array.from(map.entries()).map(([label, g]) => ({
      label,
      ...g,
      l2d: pct(g.demos, g.hubspot),
      d2w: pct(g.won, g.demos),
      l2w: pct(g.won, g.hubspot),
    }));

    // Sort
    rows.sort((a, b) => {
      if (segmentDim === "size_segment") {
        const ai = SEGMENT_ORDER.indexOf(a.label);
        const bi = SEGMENT_ORDER.indexOf(b.label);
        if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      }
      const av = a[segmentSort];
      const bv = b[segmentSort];
      if (typeof av === "number" && typeof bv === "number")
        return segmentAsc ? av - bv : bv - av;
      return segmentAsc
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });

    return rows;
  }, [filtered, segmentDim, segmentSort, segmentAsc]);

  // ── Filter options ──────────────────────────────────────────────────────────

  const filterOptions = useMemo(() => {
    const opts: Record<string, string[]> = {};
    for (const { key } of FILTER_KEYS) {
      const set = new Set<string>();
      companies.forEach((r) => { const v = String(r[key]); if (v && v !== "—") set.add(v); });
      const arr = Array.from(set).sort();
      if (key === "_industry") arr.sort((a, b) => (STANDARD_INDUSTRIES.indexOf(a) + 1 || 99) - (STANDARD_INDUSTRIES.indexOf(b) + 1 || 99));
      if (key === "_ccaa") arr.sort((a, b) => (CCAA_LIST.indexOf(a) + 1 || 99) - (CCAA_LIST.indexOf(b) + 1 || 99));
      if (key === "_segment") arr.sort((a, b) => (SEGMENT_ORDER.indexOf(a) + 1 || 99) - (SEGMENT_ORDER.indexOf(b) + 1 || 99));
      opts[key] = arr;
    }
    return opts;
  }, [companies]);

  const activeFilterCount = Object.values(filters).reduce((s, v) => s + v.length, 0) + (search ? 1 : 0);

  // ── Table sort ──────────────────────────────────────────────────────────────

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = a[sortCol]; const bv = b[sortCol];
      if (typeof av === "number" && typeof bv === "number") return sortAsc ? av - bv : bv - av;
      return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return copy;
  }, [filtered, sortCol, sortAsc]);

  const paged = useMemo(() => sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [sorted, page]);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleImportStrategy = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setImporting("strategy"); setImportProgress("Leyendo CSV...");
    const text = await file.text();
    const rows = parseCsvText(text);
    setImportProgress(`${rows.length} filas, importando...`);
    const { inserted, errors } = await importStrategyCsv(rows, (done, total) => {
      setImportProgress(`${done}/${total}`);
    });
    setImportProgress(`${inserted} importadas${errors ? `, ${errors} errores` : ""}`);
    setImporting(null);
    load();
  };

  const handleImportSasor = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setImporting("sasor"); setImportProgress("Leyendo SASOR...");
    const text = await file.text();
    const rows = parseCsvText(text);
    setImportProgress(`${rows.length} empresas...`);
    const { inserted, errors } = await importSasorCsv(rows, (done, total) => {
      setImportProgress(`${done}/${total}`);
    });
    setImportProgress(`${inserted} importadas${errors ? `, ${errors} errores` : ""}`);
    setImporting(null);
    load();
  };

  const handleCrossEnrich = async () => {
    setImporting("cross");
    setImportProgress("Iniciando...");
    const { hsUpdated, sasorUpdated } = await crossEnrichCcaa((msg) =>
      setImportProgress(msg),
    );
    setImportProgress(`${hsUpdated} HS + ${sasorUpdated} SASOR actualizados`);
    setImporting(null);
    load();
  };

  const handleSort = (col: keyof NormRow) => {
    if (sortCol === col) setSortAsc(!sortAsc); else { setSortCol(col); setSortAsc(false); }
    setPage(0);
  };

  const SortIcon = ({ col }: { col: keyof NormRow }) =>
    sortCol !== col ? null : sortAsc
      ? <ChevronUp className="h-3 w-3 inline ml-0.5 text-primary" />
      : <ChevronDown className="h-3 w-3 inline ml-0.5 text-primary" />;

  const SegSortIcon = ({ col }: { col: keyof SegmentRow }) =>
    segmentSort !== col ? null : segmentAsc
      ? <ChevronUp className="h-3 w-3 inline ml-0.5 text-primary" />
      : <ChevronDown className="h-3 w-3 inline ml-0.5 text-primary" />;

  const handleSegSort = (col: keyof SegmentRow) => {
    if (segmentSort === col) setSegmentAsc(!segmentAsc);
    else { setSegmentSort(col); setSegmentAsc(false); }
  };

  const segmentColor = (s: string) => {
    if (s.startsWith("S")) return "bg-sky-50 text-sky-700 ring-sky-200";
    if (s.startsWith("M")) return "bg-amber-50 text-amber-700 ring-amber-200";
    if (s.startsWith("L")) return "bg-orange-50 text-orange-700 ring-orange-200";
    if (s.startsWith("X")) return "bg-rose-50 text-rose-700 ring-rose-200";
    return "bg-muted text-muted-foreground ring-border";
  };

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-muted grid place-items-center">
            <Target className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-lg font-semibold">Acceso restringido</p>
          <p className="text-sm text-muted-foreground max-w-xs">Solo equipo de estrategia España.</p>
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-[1500px] px-6 py-6 lg:px-8 lg:py-8 space-y-5">

      {/* Header */}
      <div className="rounded-2xl px-6 py-5 sm:px-8 text-white shadow-sm"
        style={{ background: "var(--gradient-factorial)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-white/20 grid place-items-center">
                <Target className="h-4 w-4" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Strategy</h1>
            </div>
            <p className="text-sm text-white/70">
              España · Funnel comercial
              <span className="ml-3 inline-flex items-center rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-medium">
                {fmtNum(companies.length)} empresas HS
              </span>
              {sasorTotal > 0 && (
                <span className="ml-1.5 inline-flex items-center rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-medium">
                  {fmtNum(sasorTotal)} TAM
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View toggle */}
            <div className="flex rounded-lg bg-white/15 p-0.5 text-xs backdrop-blur-sm">
              {(["segment", "table"] as ViewMode[]).map((v) => (
                <button key={v} onClick={() => setView(v)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-all capitalize ${
                    view === v ? "bg-white text-foreground shadow-sm" : "text-white/80 hover:text-white"
                  }`}>
                  {v === "segment" ? <Hash className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
                  {v === "segment" ? "Segmentos" : "Tabla"}
                </button>
              ))}
            </div>

            {/* Import strategy CSV */}
            <label className="flex items-center gap-1.5 rounded-lg bg-white/15 backdrop-blur-sm px-3 py-1.5 text-xs font-medium cursor-pointer hover:bg-white/25 transition-colors">
              <Upload className="h-3.5 w-3.5" />
              {importing === "strategy" ? importProgress : "CSV HubSpot"}
              <input type="file" accept=".csv" onChange={handleImportStrategy} className="hidden"
                disabled={importing !== null} />
            </label>

            {/* Import SASOR CSV */}
            <label className="flex items-center gap-1.5 rounded-lg bg-white/10 backdrop-blur-sm px-3 py-1.5 text-xs font-medium cursor-pointer hover:bg-white/20 transition-colors">
              <Upload className="h-3.5 w-3.5" />
              {importing === "sasor" ? importProgress : "CSV SASOR"}
              <input type="file" accept=".csv" onChange={handleImportSasor} className="hidden"
                disabled={importing !== null} />
            </label>

            {/* Cross-enrich CCAA */}
            {raw.length > 0 && (
              <button
                onClick={handleCrossEnrich}
                disabled={importing !== null}
                title="Cruzar ciudades entre HubSpot y SASOR para mejorar cobertura de Región"
                className="flex items-center gap-1.5 rounded-lg bg-white/10 backdrop-blur-sm px-3 py-1.5 text-xs font-medium hover:bg-white/20 transition-colors disabled:opacity-40"
              >
                <Shuffle className="h-3.5 w-3.5" />
                {importing === "cross" ? importProgress : "Cross-enrich Región"}
              </button>
            )}

            {/* Clear */}
            {raw.length > 0 && (
              <button
                onClick={async () => {
                  if (!window.confirm("¿Borrar todos los datos de Strategy?")) return;
                  await clearStrategyData();
                  setRaw([]);
                }}
                className="flex items-center gap-1.5 rounded-lg bg-white/10 backdrop-blur-sm px-3 py-1.5 text-xs font-medium hover:bg-red-500/40 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Funnel strip */}
      {(companies.length > 0 || sasorTotal > 0) && (
        <div className="rounded-xl border border-border bg-card px-5 py-4 overflow-x-auto">
          <div className="flex items-center gap-2 flex-nowrap">
            {sasorTotal > 0 && (
              <FunnelStep label="España TAM" value={funnel.spain}
                sub="SASOR 20+" color="bg-slate-100 text-slate-700"
                arrow conversion={funnel.hs2spain ?? undefined} />
            )}
            <FunnelStep label="HubSpot" value={funnel.hubspot}
              sub="empresas" color="bg-blue-50 text-blue-700"
              arrow conversion={funnel.l2d} />
            <FunnelStep label="Con demo" value={funnel.demos}
              sub={`L2D ${funnel.l2d}%`} color="bg-violet-50 text-violet-700"
              arrow conversion={funnel.d2w} />
            <FunnelStep label="Won" value={funnel.won}
              sub={`D2W ${funnel.d2w}%`} color="bg-amber-50 text-amber-700"
              arrow conversion={funnel.w2a} />
            <FunnelStep label="Activos" value={funnel.activos}
              sub={`€${fmtNum(funnel.cmrr)} CMRR`} color="bg-emerald-50 text-emerald-700" />
          </div>
        </div>
      )}

      {/* Filters bar */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text" placeholder="Buscar empresa..."
              value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="h-8 rounded-lg border border-border bg-background pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 w-52"
            />
          </div>
          <div className="h-5 w-px bg-border" />
          {FILTER_KEYS.map(({ key, label }) => (
            <MultiSelect key={key} label={label}
              options={filterOptions[key] ?? []}
              selected={filters[key] ?? []}
              onChange={(v) => { setFilters((f) => ({ ...f, [key]: v })); setPage(0); }}
            />
          ))}
          {activeFilterCount > 0 && (
            <button onClick={() => { setFilters({}); setSearch(""); setPage(0); }}
              className="flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-[11px] font-medium hover:bg-primary/20 transition-colors">
              <X className="h-3 w-3" /> Limpiar ({activeFilterCount})
            </button>
          )}
          <span className="text-[10px] text-muted-foreground ml-auto tabular-nums font-medium">
            {filtered.length.toLocaleString()} resultados
          </span>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Cargando...</p>
          </div>
        </div>
      ) : companies.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-3">
          <Upload className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Importa el CSV de HubSpot para empezar.</p>
        </div>
      ) : view === "segment" ? (

        /* ── Segment table ── */
        <div className="space-y-3">
          {/* Dimension selector */}
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Dimensión</span>
            <div className="flex rounded-lg border border-border bg-background p-0.5 gap-0.5 text-xs">
              {SEGMENT_DIMS.map((d) => (
                <button key={d.key} onClick={() => setSegmentDim(d.key)}
                  className={`px-3 py-1 rounded-md transition-all ${
                    segmentDim === d.key
                      ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  {([
                    ["label", SEGMENT_DIMS.find(d => d.key === segmentDim)?.label ?? ""],
                    ["hubspot", "HubSpot"],
                    ["demos", "Con demo"],
                    ["won", "Won"],
                    ["activos", "Activos"],
                    ["l2d", "L2D%"],
                    ["d2w", "D2W%"],
                    ["l2w", "L2W%"],
                    ["cmrr", "CMRR"],
                  ] as [keyof SegmentRow, string][]).map(([col, lbl]) => (
                    <th key={col} onClick={() => handleSegSort(col)}
                      className="px-3 py-2.5 text-right first:text-left text-[10px] uppercase tracking-wider text-muted-foreground font-bold cursor-pointer hover:text-foreground select-none whitespace-nowrap transition-colors">
                      {lbl}<SegSortIcon col={col} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {segmentRows.map((row, idx) => {
                  const maxCmrr = Math.max(...segmentRows.map(r => r.cmrr), 1);
                  const cmrrBar = Math.round((row.cmrr / maxCmrr) * 100);
                  return (
                    <tr key={row.label} className={`border-t border-border/60 hover:bg-muted/20 transition-colors ${idx % 2 === 0 ? "" : "bg-muted/[0.03]"}`}>
                      <td className="px-3 py-2 font-semibold text-foreground max-w-[200px] truncate">{row.label}</td>
                      <td className="px-3 py-2 tabular-nums text-right text-muted-foreground">{row.hubspot.toLocaleString()}</td>
                      <td className="px-3 py-2 tabular-nums text-right text-muted-foreground">{row.demos.toLocaleString()}</td>
                      <td className="px-3 py-2 tabular-nums text-right text-muted-foreground">{row.won.toLocaleString()}</td>
                      <td className="px-3 py-2 tabular-nums text-right">
                        <span className="font-semibold text-emerald-700">{row.activos.toLocaleString()}</span>
                      </td>
                      {/* Rate cells with color coding */}
                      {([row.l2d, row.d2w, row.l2w] as number[]).map((v, i) => (
                        <td key={i} className="px-3 py-2 tabular-nums text-right">
                          <span className={`font-semibold ${
                            v >= 50 ? "text-emerald-600" : v >= 25 ? "text-amber-600" : "text-muted-foreground"
                          }`}>{v}%</span>
                        </td>
                      ))}
                      <td className="px-3 py-2 tabular-nums text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden hidden sm:block">
                            <div className="h-full rounded-full bg-primary/40" style={{ width: `${cmrrBar}%` }} />
                          </div>
                          <span className="font-semibold">{fmtNum(row.cmrr)}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {/* Totals row */}
                <tr className="border-t-2 border-border bg-muted/40 font-bold">
                  <td className="px-3 py-2.5 text-foreground">Total</td>
                  <td className="px-3 py-2.5 tabular-nums text-right">{funnel.hubspot.toLocaleString()}</td>
                  <td className="px-3 py-2.5 tabular-nums text-right">{funnel.demos.toLocaleString()}</td>
                  <td className="px-3 py-2.5 tabular-nums text-right">{funnel.won.toLocaleString()}</td>
                  <td className="px-3 py-2.5 tabular-nums text-right text-emerald-700">{funnel.activos.toLocaleString()}</td>
                  <td className="px-3 py-2.5 tabular-nums text-right">{funnel.l2d}%</td>
                  <td className="px-3 py-2.5 tabular-nums text-right">{funnel.d2w}%</td>
                  <td className="px-3 py-2.5 tabular-nums text-right">{pct(funnel.won, funnel.hubspot)}%</td>
                  <td className="px-3 py-2.5 tabular-nums text-right">{fmtNum(funnel.cmrr)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      ) : (

        /* ── Company table ── */
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  {([
                    ["company_name", "Empresa", "text-left"],
                    ["_ccaa", "Región", "text-left"],
                    ["_industry", "Industria", "text-left"],
                    ["_segment", "Tamaño", "text-left"],
                    ["tipo_empresa", "Tipo", "text-left"],
                    ["_hasDemo", "Demo", "text-center"],
                    ["_isWon", "Won", "text-center"],
                    ["cmrr", "CMRR", "text-right"],
                    ["total_seats", "Seats", "text-right"],
                    ["_provenance", "Source", "text-left"],
                  ] as [keyof NormRow, string, string][]).map(([col, label, align]) => (
                    <th key={String(col)} onClick={() => handleSort(col)}
                      className={`px-3 py-2.5 ${align} text-[10px] uppercase tracking-wider text-muted-foreground font-bold cursor-pointer hover:text-foreground select-none whitespace-nowrap transition-colors`}>
                      {label}<SortIcon col={col} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((r, idx) => (
                  <tr key={r.id} className={`border-t border-border/60 hover:bg-muted/20 transition-colors ${idx % 2 === 0 ? "" : "bg-muted/[0.04]"}`}>
                    <td className="px-3 py-2 font-semibold max-w-[200px] truncate text-foreground">{r.company_name}</td>
                    <td className="px-3 py-2 text-muted-foreground text-[10px] whitespace-nowrap">
                      {r._ccaa !== "Others" ? r._ccaa : <span className="text-border">—</span>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[140px] truncate">{r._industry}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${segmentColor(r._segment)}`}>
                        {r._segment}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${
                        r._isActive ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-50 text-slate-500 ring-slate-200"
                      }`}>{r._isActive ? "Activo" : "Lead"}</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {r._hasDemo ? <span className="inline-block w-2 h-2 rounded-full bg-violet-400" /> : <span className="text-border text-[10px]">·</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {r._isWon ? <span className="inline-block w-2 h-2 rounded-full bg-amber-400" /> : <span className="text-border text-[10px]">·</span>}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-right font-semibold">
                      {r.cmrr ? <span className={r.cmrr > 100000 ? "text-emerald-600" : ""}>{fmtNum(r.cmrr)}</span> : "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-right text-muted-foreground">{r.total_seats || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground text-[10px]">{r._provenance || "—"}</td>
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
                  className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-30">«</button>
                <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
                  className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-30">Anterior</button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let p = totalPages <= 5 ? i : page < 3 ? i : page > totalPages - 4 ? totalPages - 5 + i : page - 2 + i;
                  return (
                    <button key={p} onClick={() => setPage(p)}
                      className={`h-7 w-7 rounded-md text-xs tabular-nums ${p === page ? "bg-primary text-primary-foreground font-bold" : "hover:bg-muted text-muted-foreground"}`}>
                      {p + 1}
                    </button>
                  );
                })}
                <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
                  className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-30">Siguiente</button>
                <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}
                  className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-30">»</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
