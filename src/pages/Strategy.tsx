import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import {
  fetchStrategyCompanies,
  fetchSasorTotal,
  fetchSasorBreakdown,
  fetchCcaaGapStats,
  enrichHsCcaaViaHubspot,
  enrichCcaaViaAI,
  importStrategyCsv,
  importSasorCsv,
  clearStrategyData,
  crossEnrichCcaa,
  STRATEGY_EMAILS,
  type StrategyCompany,
  type SasorBreakdown,
  type EnrichCcaaProgress,
} from "@/lib/strategyStore";
import { standardIndustry, normProvenance, STANDARD_INDUSTRIES } from "@/lib/strategyNormalize";
import { resolveCCAA, CCAA_LIST } from "@/lib/strategyCCAA";
import { applyCountryTheme } from "@/lib/countryConfig";
import {
  Upload, Table2, Search, ChevronDown, ChevronUp, X,
  Target, Hash, Trash2, ArrowRight, Shuffle, LayoutGrid,
  Sparkles, Square, Database,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ViewMode = "segment" | "table";
type SegmentDim = "ccaa" | "size_segment" | "industry" | "provenance";
type PivotMetric = "l2d" | "d2w" | "l2w" | "activos" | "cmrr";
type HeatDir = "global" | "row" | "col";

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

interface PivotCell {
  hubspot: number; demos: number; won: number; activos: number; cmrr: number;
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
  { key: "ccaa",         label: "Región" },
  { key: "size_segment", label: "Tamaño" },
  { key: "industry",     label: "Industria" },
  { key: "provenance",   label: "Provenance" },
];

const CROSS_METRICS: { key: PivotMetric; label: string }[] = [
  { key: "l2d",     label: "Lead → Demo" },
  { key: "d2w",     label: "Demo → Won" },
  { key: "l2w",     label: "Lead → Won" },
  { key: "activos", label: "Activos" },
  { key: "cmrr",    label: "CMRR" },
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

function computeQuantiles(values: number[]): { p33: number; p67: number } {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (sorted.length < 3) return { p33: 25, p67: 50 };
  const p33 = sorted[Math.floor(sorted.length * 0.33)] ?? 25;
  const p67 = sorted[Math.floor(sorted.length * 0.67)] ?? 50;
  return { p33, p67: Math.max(p67, p33 + 1) };
}

function rateHeat(v: number, q: { p33: number; p67: number }): string {
  if (v <= 0) return "text-muted-foreground/30";
  if (v >= q.p67) return "bg-emerald-100 text-emerald-800 font-semibold";
  if (v >= q.p33) return "bg-amber-50 text-amber-700 font-medium";
  return "text-slate-400";
}

function pivotHeat(v: number, allVals: number[]): string {
  const nonZero = allVals.filter((x) => x > 0);
  if (nonZero.length < 2 || v === 0) return "text-muted-foreground/30";
  const { p33, p67 } = computeQuantiles(nonZero);
  if (v >= p67) return "bg-emerald-100 text-emerald-800 font-semibold";
  if (v >= p33) return "bg-amber-50 text-amber-700 font-medium";
  return "text-slate-400";
}

function getDimFn(dim: SegmentDim) {
  return (r: NormRow): string => {
    if (dim === "ccaa")         return r._ccaa || "Others";
    if (dim === "size_segment") return r._segment || "Others";
    if (dim === "industry")     return r._industry || "Others";
    return r._provenance || "Others";
  };
}

function getCellValue(cell: PivotCell | undefined, metric: PivotMetric): number {
  if (!cell || cell.hubspot === 0) return 0;
  if (metric === "l2d")     return pct(cell.demos, cell.hubspot);
  if (metric === "d2w")     return pct(cell.won, cell.demos);
  if (metric === "l2w")     return pct(cell.won, cell.hubspot);
  if (metric === "activos") return cell.activos;
  return cell.cmrr;
}

function formatCellVal(v: number, metric: PivotMetric): string {
  if (v === 0) return "—";
  if (metric === "l2d" || metric === "d2w" || metric === "l2w") return `${v}%`;
  if (metric === "cmrr") return fmtNum(v);
  return v.toLocaleString();
}

function shortLabel(s: string): string {
  return s.replace(" (1-50)", "").replace(" (51-200)", "").replace(" (201-500)", "").replace(" (500+)", "");
}

function segmentBadge(s: string): string {
  if (s.startsWith("S")) return "bg-sky-50 text-sky-700 ring-sky-200";
  if (s.startsWith("M")) return "bg-amber-50 text-amber-700 ring-amber-200";
  if (s.startsWith("L")) return "bg-orange-50 text-orange-700 ring-orange-200";
  if (s.startsWith("X")) return "bg-rose-50 text-rose-700 ring-rose-200";
  return "bg-muted text-muted-foreground ring-border";
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
  step, label, value, sub, accentClass, empty,
  arrow, conversion,
}: {
  step: number; label: string; value: number; sub?: string;
  accentClass: string; empty?: boolean;
  arrow?: boolean; conversion?: number;
}) {
  const conversionColor =
    conversion === undefined ? ""
    : conversion >= 60 ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
    : conversion >= 35 ? "bg-amber-100 text-amber-700 border border-amber-200"
    : "bg-slate-100 text-slate-500 border border-slate-200";

  return (
    <div className={`flex items-center gap-2.5 flex-shrink-0 ${empty ? "opacity-50" : ""}`}>
      <div className={`relative rounded-xl border ${empty ? "border-dashed border-border/60" : "border-border"} bg-card shadow-sm overflow-hidden min-w-[130px]`}>
        <div className={`absolute inset-y-0 left-0 w-[3px] ${accentClass}`} />
        <div className="px-4 py-3.5 pl-5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-[9px] font-bold text-muted-foreground/40 tabular-nums">{step}</span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">{label}</span>
          </div>
          <div className={`text-[28px] font-bold tabular-nums leading-none ${empty ? "text-muted-foreground/40" : "text-foreground"}`}>
            {empty ? "—" : fmtNum(value)}
          </div>
          {sub && (
            <div className="text-[10px] text-muted-foreground mt-1.5 leading-none">{sub}</div>
          )}
        </div>
      </div>
      {arrow && (
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          {conversion !== undefined && !empty && (
            <span className={`text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-full ${conversionColor}`}>
              {conversion}%
            </span>
          )}
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/25" />
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
  const [sasorBreakdown, setSasorBreakdown] = useState<SasorBreakdown | null>(null);
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
  const [crossDim, setCrossDim] = useState<SegmentDim | null>(null);
  const [crossMetric, setCrossMetric] = useState<PivotMetric>("l2d");
  const [heatDir, setHeatDir] = useState<HeatDir>("col");
  const [ccaaGap, setCcaaGap] = useState<{ hs: number; sasor: number } | null>(null);
  const [enrichRun, setEnrichRun] = useState<"hs_api" | "hs_ai" | "tam_ai" | null>(null);
  const [enrichProgress, setEnrichProgress] = useState<EnrichCcaaProgress | null>(null);
  const enrichCancelRef = useRef({ current: false });
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const load = useCallback(async () => {
    setLoading(true);
    const [data, total, breakdown] = await Promise.all([
      fetchStrategyCompanies(),
      fetchSasorTotal(),
      fetchSasorBreakdown(),
    ]);
    setRaw(data);
    setSasorTotal(total);
    setSasorBreakdown(breakdown);
    setLoading(false);
    fetchCcaaGapStats().then(setCcaaGap);
  }, []);

  useEffect(() => { if (hasAccess) load(); }, [hasAccess, load]);

  // ── Normalize rows ──────────────────────────────────────────────────────────

  const companies = useMemo<NormRow[]>(() =>
    raw
      .filter((r) => isValidTipo(r.tipo_empresa))
      .map((r) => {
        const ccaaFromSql = r.ccaa?.trim();
        const ccaaResolved = (() => {
          if (ccaaFromSql && ccaaFromSql !== "Others") return ccaaFromSql;
          const res = resolveCCAA(r.ciudad_enriched || r.ciudad);
          return res.ccaa === "Unknown" ? "Others" : res.ccaa;
        })();
        const provNorm = r.provenance_norm?.trim() || normProvenance(r.provenance);
        const segNorm = r.size_segment?.trim() || sizeSegment(r.empresa_size, r.total_seats);
        const isWon = r.is_won != null
          ? Boolean(r.is_won)
          : r.conversion === "converted" || r.conversion === "onboarding";
        const isActive = r.is_active_client != null
          ? Boolean(r.is_active_client)
          : r.tipo_empresa === "Cliente Activo";
        const hasDemo = isWon || isActive || (r.has_demo != null
          ? Boolean(r.has_demo)
          : !!(r.deal_after_demo_date || r.after_demo_date));
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
      hubspot, demos, won, activos, cmrr,
      l2d: pct(demos, hubspot),
      d2w: pct(won, demos),
      w2a: pct(activos, won),
      hs2spain: sasorTotal > 0 ? pct(hubspot, sasorTotal) : null,
    };
  }, [filtered, sasorTotal]);

  // ── Segment table ───────────────────────────────────────────────────────────

  const segmentRows = useMemo<SegmentRow[]>(() => {
    const dimFn = getDimFn(segmentDim);
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
      label, ...g,
      l2d: pct(g.demos, g.hubspot),
      d2w: pct(g.won, g.demos),
      l2w: pct(g.won, g.hubspot),
    }));
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
      return segmentAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return rows;
  }, [filtered, segmentDim, segmentSort, segmentAsc]);

  // ── Pivot (cross-dimensional) ───────────────────────────────────────────────

  const pivotData = useMemo(() => {
    if (!crossDim || crossDim === segmentDim) return null;

    const primaryFn = getDimFn(segmentDim);
    const secondaryFn = getDimFn(crossDim);

    // Primary: use segmentRows order, exclude Others
    const primaryVals = segmentRows.filter((r) => r.label !== "Others").map((r) => r.label);

    // Secondary: count, then order
    const secCount = new Map<string, number>();
    filtered.forEach((r) => {
      const s = secondaryFn(r);
      if (s !== "Others" && s !== "Unknown") secCount.set(s, (secCount.get(s) ?? 0) + 1);
    });

    let secondaryVals: string[];
    if (crossDim === "size_segment") {
      secondaryVals = SEGMENT_ORDER.filter((s) => secCount.has(s) && s !== "Unknown" && s !== "Others");
    } else {
      secondaryVals = Array.from(secCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([k]) => k);
    }

    // Build matrix
    const matrix = new Map<string, Map<string, PivotCell>>();
    for (const r of filtered) {
      const p = primaryFn(r);
      const s = secondaryFn(r);
      if (!primaryVals.includes(p) || !secondaryVals.includes(s)) continue;
      if (!matrix.has(p)) matrix.set(p, new Map());
      const row = matrix.get(p)!;
      if (!row.has(s)) row.set(s, { hubspot: 0, demos: 0, won: 0, activos: 0, cmrr: 0 });
      const cell = row.get(s)!;
      cell.hubspot++;
      if (r._hasDemo) cell.demos++;
      if (r._isWon) cell.won++;
      if (r._isActive) cell.activos++;
      cell.cmrr += r.cmrr || 0;
    }

    // Compute row totals, column totals, grand total (aggregate raw cells for correct rate math)
    const rowTotals = new Map<string, PivotCell>();
    const colTotals = new Map<string, PivotCell>();
    const grandTotal: PivotCell = { hubspot: 0, demos: 0, won: 0, activos: 0, cmrr: 0 };

    for (const p of primaryVals) {
      const rt: PivotCell = { hubspot: 0, demos: 0, won: 0, activos: 0, cmrr: 0 };
      for (const s of secondaryVals) {
        const c = matrix.get(p)?.get(s);
        if (c) { rt.hubspot += c.hubspot; rt.demos += c.demos; rt.won += c.won; rt.activos += c.activos; rt.cmrr += c.cmrr; }
      }
      rowTotals.set(p, rt);
    }
    for (const s of secondaryVals) {
      const ct: PivotCell = { hubspot: 0, demos: 0, won: 0, activos: 0, cmrr: 0 };
      for (const p of primaryVals) {
        const c = matrix.get(p)?.get(s);
        if (c) { ct.hubspot += c.hubspot; ct.demos += c.demos; ct.won += c.won; ct.activos += c.activos; ct.cmrr += c.cmrr; }
      }
      colTotals.set(s, ct);
      grandTotal.hubspot += ct.hubspot; grandTotal.demos += ct.demos; grandTotal.won += ct.won; grandTotal.activos += ct.activos; grandTotal.cmrr += ct.cmrr;
    }

    return { primaryVals, secondaryVals, matrix, rowTotals, colTotals, grandTotal };
  }, [filtered, segmentDim, crossDim, segmentRows]);

  // Direction-aware heat: compare within row, within column, or globally
  const getCellHeat = useCallback((v: number, rowLabel: string, colLabel: string): string => {
    if (!pivotData || v === 0) return "text-muted-foreground/30";
    let pool: number[];
    if (heatDir === "row") {
      pool = pivotData.secondaryVals.map((s) => getCellValue(pivotData.matrix.get(rowLabel)?.get(s), crossMetric));
    } else if (heatDir === "col") {
      pool = pivotData.primaryVals.map((p) => getCellValue(pivotData.matrix.get(p)?.get(colLabel), crossMetric));
    } else {
      pool = pivotData.primaryVals.flatMap((p) =>
        pivotData.secondaryVals.map((s) => getCellValue(pivotData.matrix.get(p)?.get(s), crossMetric))
      );
    }
    return pivotHeat(v, pool);
  }, [pivotData, crossMetric, heatDir]);

  // ── Rate quantiles ──────────────────────────────────────────────────────────

  const quantiles = useMemo(() => ({
    l2d: computeQuantiles(segmentRows.map((r) => r.l2d)),
    d2w: computeQuantiles(segmentRows.map((r) => r.d2w)),
    l2w: computeQuantiles(segmentRows.map((r) => r.l2w)),
  }), [segmentRows]);

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
    const { inserted, errors } = await importStrategyCsv(rows, (done, total) => setImportProgress(`${done}/${total}`));
    setImportProgress(`${inserted} importadas${errors ? `, ${errors} errores` : ""}`);
    setImporting(null);
    load();
  };

  const handleImportSasor = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setImporting("sasor"); setImportProgress("Leyendo TAM...");
    const text = await file.text();
    const rows = parseCsvText(text);
    setImportProgress(`${rows.length} empresas...`);
    const { inserted, errors } = await importSasorCsv(rows, (done, total) => setImportProgress(`${done}/${total}`));
    setImportProgress(`${inserted} importadas${errors ? `, ${errors} errores` : ""}`);
    setImporting(null);
    load();
  };

  const handleCrossEnrich = async () => {
    setImporting("cross"); setImportProgress("Iniciando...");
    const { hsUpdated, sasorUpdated } = await crossEnrichCcaa((msg) => setImportProgress(msg));
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

  const maxHubspot = Math.max(...segmentRows.map((r) => r.hubspot), 1);
  const crossDimOptions = SEGMENT_DIMS.filter((d) => d.key !== segmentDim);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 lg:px-8 space-y-5">

      {/* ── Header ── */}
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
            <div className="flex rounded-lg bg-white/15 p-0.5 text-xs backdrop-blur-sm">
              {(["segment", "table"] as ViewMode[]).map((v) => (
                <button key={v} onClick={() => setView(v)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-all ${
                    view === v ? "bg-white text-foreground shadow-sm" : "text-white/80 hover:text-white"
                  }`}>
                  {v === "segment" ? <Hash className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
                  {v === "segment" ? "Segmentos" : "Tabla"}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-1.5 rounded-lg bg-white/15 backdrop-blur-sm px-3 py-1.5 text-xs font-medium cursor-pointer hover:bg-white/25 transition-colors">
              <Upload className="h-3.5 w-3.5" />
              {importing === "strategy" ? importProgress : "CSV HubSpot"}
              <input type="file" accept=".csv" onChange={handleImportStrategy} className="hidden" disabled={importing !== null} />
            </label>

            <label className="flex items-center gap-1.5 rounded-lg bg-white/10 backdrop-blur-sm px-3 py-1.5 text-xs font-medium cursor-pointer hover:bg-white/20 transition-colors">
              <Upload className="h-3.5 w-3.5" />
              {importing === "sasor" ? importProgress : "CSV TAM"}
              <input type="file" accept=".csv" onChange={handleImportSasor} className="hidden" disabled={importing !== null} />
            </label>

            {raw.length > 0 && (
              <button onClick={handleCrossEnrich} disabled={importing !== null}
                title="Cruzar ciudades entre HubSpot y SASOR para mejorar cobertura de Región"
                className="flex items-center gap-1.5 rounded-lg bg-white/10 backdrop-blur-sm px-3 py-1.5 text-xs font-medium hover:bg-white/20 transition-colors disabled:opacity-40">
                <Shuffle className="h-3.5 w-3.5" />
                {importing === "cross" ? importProgress : "Cross-enrich Región"}
              </button>
            )}

            {raw.length > 0 && (
              <button
                onClick={async () => {
                  if (!window.confirm("¿Borrar todos los datos de Strategy?")) return;
                  await clearStrategyData();
                  setRaw([]);
                }}
                className="flex items-center gap-1.5 rounded-lg bg-white/10 backdrop-blur-sm px-3 py-1.5 text-xs font-medium hover:bg-red-500/40 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Funnel strip ── */}
      <div className="rounded-xl border border-border bg-card px-5 py-4 overflow-x-auto">
        <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-3">
          Embudo comercial
        </div>
        <div className="flex items-start gap-2 flex-nowrap">
          {/* TAM — always visible, empty if not loaded */}
          <FunnelStep
            step={1} label="TAM España" value={funnel.spain}
            sub={funnel.spain > 0 ? "empresas +20 empleados" : "Carga CSV TAM"}
            accentClass="bg-slate-300"
            empty={funnel.spain === 0}
            arrow conversion={funnel.hs2spain ?? undefined}
          />
          <FunnelStep
            step={2} label="En HubSpot" value={funnel.hubspot}
            sub="ICP identificado"
            accentClass="bg-blue-400"
            arrow conversion={funnel.l2d}
          />
          <FunnelStep
            step={3} label="Con demo" value={funnel.demos}
            sub={`${funnel.l2d}% de leads`}
            accentClass="bg-violet-400"
            arrow conversion={funnel.d2w}
          />
          <FunnelStep
            step={4} label="Ganados" value={funnel.won}
            sub={`${funnel.d2w}% de demos`}
            accentClass="bg-amber-400"
            arrow conversion={funnel.w2a}
          />
          <FunnelStep
            step={5} label="Activos" value={funnel.activos}
            sub={`€${fmtNum(funnel.cmrr)} CMRR`}
            accentClass="bg-emerald-400"
          />
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text" placeholder="Buscar empresa..."
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="h-8 rounded-lg border border-border bg-background pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 w-48"
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
        <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
          {filtered.length.toLocaleString()} empresas
        </span>
      </div>

      {/* ── Enrich CCAA panel ── */}
      {ccaaGap && (ccaaGap.hs > 0 || ccaaGap.sasor > 0) && (
        <div className="rounded-xl border border-border bg-card px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground shrink-0">
            <Sparkles className="h-3.5 w-3.5" />
            Enrich CCAA
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[11px]">{ccaaGap.hs.toLocaleString()}</span> HS sin región
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[11px]">{ccaaGap.sasor.toLocaleString()}</span> TAM sin región
          </div>
          <div className="h-4 w-px bg-border" />
          {enrichRun === null ? (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={async () => {
                  enrichCancelRef.current = { current: false };
                  setEnrichRun("hs_api"); setEnrichProgress(null);
                  await enrichHsCcaaViaHubspot((p) => setEnrichProgress(p), enrichCancelRef.current);
                  setEnrichRun(null); setEnrichProgress(null);
                  fetchCcaaGapStats().then(setCcaaGap); load();
                }}
                disabled={ccaaGap.hs === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors disabled:opacity-40">
                <Database className="h-3 w-3" /> HS vía HubSpot API
              </button>
              <button
                onClick={async () => {
                  enrichCancelRef.current = { current: false };
                  setEnrichRun("hs_ai"); setEnrichProgress(null);
                  await enrichCcaaViaAI("strategy_companies", (p) => setEnrichProgress(p), enrichCancelRef.current);
                  setEnrichRun(null); setEnrichProgress(null);
                  fetchCcaaGapStats().then(setCcaaGap); load();
                }}
                disabled={ccaaGap.hs === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors disabled:opacity-40">
                <Sparkles className="h-3 w-3" /> HS vía AI
              </button>
              <button
                onClick={async () => {
                  enrichCancelRef.current = { current: false };
                  setEnrichRun("tam_ai"); setEnrichProgress(null);
                  await enrichCcaaViaAI("strategy_sasor", (p) => setEnrichProgress(p), enrichCancelRef.current);
                  setEnrichRun(null); setEnrichProgress(null);
                  fetchCcaaGapStats().then(setCcaaGap);
                }}
                disabled={ccaaGap.sasor === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors disabled:opacity-40">
                <Sparkles className="h-3 w-3" /> TAM vía AI
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 flex-1">
              <div className="flex-1 min-w-[200px]">
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span className="font-medium">{enrichProgress?.stage ?? enrichRun}</span>
                  <span className="tabular-nums">
                    {enrichProgress?.done ?? 0}/{enrichProgress?.total ?? "…"}
                    {enrichProgress && enrichProgress.updated > 0 && (
                      <span className="text-emerald-600 ml-2">+{enrichProgress.updated} actualizados</span>
                    )}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded overflow-hidden">
                  <div className="h-full bg-primary rounded transition-all duration-300"
                    style={{ width: `${enrichProgress && enrichProgress.total > 0 ? (enrichProgress.done / enrichProgress.total) * 100 : 0}%` }} />
                </div>
              </div>
              <button onClick={() => { enrichCancelRef.current.current = true; }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20 transition-colors">
                <Square className="h-3 w-3" /> Cancelar
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Content ── */}
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

        <div className="space-y-6">

          {/* ── Dimension tabs + main table ── */}
          <div className="space-y-0">
            <div className="flex items-center gap-1 border-b border-border">
              <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 pr-3">
                Agrupar por
              </span>
              {SEGMENT_DIMS.map((d) => (
                <button key={d.key} onClick={() => { setSegmentDim(d.key); setCrossDim(null); }}
                  className={`px-3 py-2 text-xs font-medium transition-all border-b-2 -mb-px ${
                    segmentDim === d.key
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}>
                  {d.label}
                </button>
              ))}
              <div className="ml-auto pb-1 flex items-center gap-2 pr-1">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="inline-block h-2 w-4 rounded-sm bg-emerald-100 ring-1 ring-emerald-200" />
                  Alto
                  <span className="inline-block h-2 w-4 rounded-sm bg-amber-50 ring-1 ring-amber-200" />
                  Medio
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-b-xl border border-t-0 border-border bg-card shadow-sm">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/30 border-b border-border">
                    {([
                      ["label",   SEGMENT_DIMS.find((d) => d.key === segmentDim)?.label ?? "", "text-left",  "min-w-[160px]"],
                      ["hubspot", "HubSpot",      "text-right", ""],
                      ["demos",   "Con demo",     "text-right", ""],
                      ["won",     "Ganados",      "text-right", ""],
                      ["activos", "Activos",      "text-right", ""],
                      ["l2d",     "Lead → Demo",  "text-right", "min-w-[100px]"],
                      ["d2w",     "Demo → Won",   "text-right", "min-w-[100px]"],
                      ["l2w",     "Lead → Won",   "text-right", "min-w-[100px]"],
                      ["cmrr",    "CMRR",         "text-right", "min-w-[110px]"],
                    ] as [keyof SegmentRow, string, string, string][]).map(([col, lbl, align, minW]) => (
                      <th key={col} onClick={() => handleSegSort(col)}
                        className={`px-3 py-2.5 ${align} ${minW} text-[10px] uppercase tracking-wider text-muted-foreground font-bold cursor-pointer hover:text-foreground select-none whitespace-nowrap transition-colors`}>
                        {lbl}<SegSortIcon col={col} />
                      </th>
                    ))}
                    {(segmentDim === "ccaa" || segmentDim === "size_segment") && sasorBreakdown && (<>
                      <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-wider font-bold text-violet-500/70 whitespace-nowrap border-l border-border/60 min-w-[80px]">TAM</th>
                      <th className="px-3 py-2.5 text-right text-[10px] uppercase tracking-wider font-bold text-violet-500/70 whitespace-nowrap min-w-[90px]">Penetración</th>
                    </>)}
                  </tr>
                </thead>
                <tbody>
                  {segmentRows.map((row, idx) => {
                    const isOthers = row.label === "Others";
                    const cmrrBar = Math.round((row.cmrr / Math.max(...segmentRows.map((r) => r.cmrr), 1)) * 100);
                    const volBar = Math.round((row.hubspot / maxHubspot) * 100);
                    const tamVal = segmentDim === "ccaa"
                      ? (sasorBreakdown?.byCcaa[row.label] ?? null)
                      : segmentDim === "size_segment"
                      ? (sasorBreakdown?.bySize[row.label] ?? null)
                      : null;
                    const penetracion = tamVal ? pct(row.hubspot, tamVal) : null;
                    return (
                      <tr key={row.label}
                        className={`border-t border-border/50 transition-colors hover:bg-muted/20 ${isOthers ? "opacity-50" : ""} ${idx % 2 === 0 ? "" : "bg-muted/[0.025]"}`}>
                        <td className="px-3 py-2.5">
                          <span className={`font-semibold ${isOthers ? "text-muted-foreground italic" : "text-foreground"}`}>
                            {row.label}
                          </span>
                          {isOthers && <span className="ml-1.5 text-[9px] text-muted-foreground/60">(sin CCAA asignada)</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-12 h-1 rounded-full bg-muted overflow-hidden hidden sm:block">
                              <div className="h-full rounded-full bg-blue-300" style={{ width: `${volBar}%` }} />
                            </div>
                            <span className="tabular-nums text-muted-foreground">{row.hubspot.toLocaleString()}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-right text-muted-foreground">{row.demos.toLocaleString()}</td>
                        <td className="px-3 py-2.5 tabular-nums text-right text-muted-foreground">{row.won.toLocaleString()}</td>
                        <td className="px-3 py-2.5 tabular-nums text-right">
                          <span className="font-semibold text-emerald-700">{row.activos.toLocaleString()}</span>
                        </td>
                        <td className={`px-3 py-2.5 tabular-nums text-right text-sm ${!isOthers ? rateHeat(row.l2d, quantiles.l2d) : "text-muted-foreground/40"}`}>{row.l2d}%</td>
                        <td className={`px-3 py-2.5 tabular-nums text-right text-sm ${!isOthers ? rateHeat(row.d2w, quantiles.d2w) : "text-muted-foreground/40"}`}>{row.d2w}%</td>
                        <td className={`px-3 py-2.5 tabular-nums text-right text-sm ${!isOthers ? rateHeat(row.l2w, quantiles.l2w) : "text-muted-foreground/40"}`}>{row.l2w}%</td>
                        <td className="px-3 py-2.5 tabular-nums text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-14 h-1.5 rounded-full bg-muted overflow-hidden hidden sm:block">
                              <div className="h-full rounded-full bg-primary/35" style={{ width: `${cmrrBar}%` }} />
                            </div>
                            <span className="font-semibold">{fmtNum(row.cmrr)}</span>
                          </div>
                        </td>
                        {(segmentDim === "ccaa" || segmentDim === "size_segment") && sasorBreakdown && (<>
                          <td className="px-3 py-2.5 tabular-nums text-right text-violet-700/60 border-l border-border/40">
                            {tamVal != null ? fmtNum(tamVal) : <span className="text-muted-foreground/30">—</span>}
                          </td>
                          <td className={`px-3 py-2.5 tabular-nums text-right font-semibold text-sm ${
                            penetracion == null ? "text-muted-foreground/30"
                            : penetracion >= 70 ? "text-emerald-700"
                            : penetracion >= 40 ? "text-amber-600"
                            : "text-muted-foreground"
                          }`}>
                            {penetracion != null ? `${penetracion}%` : "—"}
                          </td>
                        </>)}
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-border bg-muted/30 font-bold text-xs">
                    <td className="px-3 py-2.5 text-foreground">Total</td>
                    <td className="px-3 py-2.5 tabular-nums text-right text-muted-foreground">{funnel.hubspot.toLocaleString()}</td>
                    <td className="px-3 py-2.5 tabular-nums text-right text-muted-foreground">{funnel.demos.toLocaleString()}</td>
                    <td className="px-3 py-2.5 tabular-nums text-right text-muted-foreground">{funnel.won.toLocaleString()}</td>
                    <td className="px-3 py-2.5 tabular-nums text-right text-emerald-700">{funnel.activos.toLocaleString()}</td>
                    <td className="px-3 py-2.5 tabular-nums text-right">{funnel.l2d}%</td>
                    <td className="px-3 py-2.5 tabular-nums text-right">{funnel.d2w}%</td>
                    <td className="px-3 py-2.5 tabular-nums text-right">{pct(funnel.won, funnel.hubspot)}%</td>
                    <td className="px-3 py-2.5 tabular-nums text-right">{fmtNum(funnel.cmrr)}</td>
                    {(segmentDim === "ccaa" || segmentDim === "size_segment") && sasorBreakdown && (<>
                      <td className="px-3 py-2.5 tabular-nums text-right text-violet-700/70 border-l border-border/40">{fmtNum(sasorTotal)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-right">{sasorTotal > 0 ? `${pct(funnel.hubspot, sasorTotal)}%` : "—"}</td>
                    </>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Análisis cruzado ── */}
          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">

            {/* Card header */}
            <div className="px-5 py-3.5 border-b border-border bg-muted/20 flex flex-wrap items-center gap-x-5 gap-y-2">
              <div className="flex items-center gap-2 shrink-0">
                <LayoutGrid className="h-4 w-4 text-muted-foreground/60" />
                <span className="text-xs font-bold text-foreground">Análisis cruzado</span>
                {crossDim && (
                  <span className="text-xs text-muted-foreground">
                    {SEGMENT_DIMS.find((d) => d.key === segmentDim)?.label}
                    <span className="mx-1 text-muted-foreground/40">×</span>
                    {SEGMENT_DIMS.find((d) => d.key === crossDim)?.label}
                  </span>
                )}
              </div>

              {/* Dim selector */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 pr-1">Cruzar</span>
                {crossDimOptions.map((d) => (
                  <button key={d.key}
                    onClick={() => setCrossDim(crossDim === d.key ? null : d.key)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                      crossDim === d.key
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "border border-border/70 text-muted-foreground hover:text-foreground hover:border-border"
                    }`}>
                    {d.label}
                  </button>
                ))}
              </div>

              {crossDim && (
                <>
                  <div className="h-4 w-px bg-border" />
                  {/* Metric selector */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 pr-1">Métrica</span>
                    {CROSS_METRICS.map((m) => (
                      <button key={m.key}
                        onClick={() => setCrossMetric(m.key)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                          crossMetric === m.key
                            ? "bg-foreground text-background"
                            : "text-muted-foreground hover:text-foreground"
                        }`}>
                        {m.label}
                      </button>
                    ))}
                  </div>

                  <div className="h-4 w-px bg-border" />
                  {/* Heat direction */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 pr-1">Color</span>
                    {([
                      ["col",    "Por columna"],
                      ["row",    "Por fila"],
                      ["global", "Global"],
                    ] as [HeatDir, string][]).map(([dir, lbl]) => (
                      <button key={dir} onClick={() => setHeatDir(dir)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                          heatDir === dir
                            ? "bg-emerald-600 text-white"
                            : "text-muted-foreground hover:text-foreground border border-border/70 hover:border-border"
                        }`}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {!crossDim && (
                <span className="text-xs text-muted-foreground/50 italic">Selecciona una dimensión para cruzar</span>
              )}
            </div>

            {/* Pivot table */}
            {crossDim && pivotData && (() => {
              const primaryLabel = SEGMENT_DIMS.find((d) => d.key === segmentDim)?.label ?? "";
              const secondaryLabel = SEGMENT_DIMS.find((d) => d.key === crossDim)?.label ?? "";
              const isRate = crossMetric === "l2d" || crossMetric === "d2w" || crossMetric === "l2w";

              return (
                <div className="overflow-x-auto">
                  <table className="text-xs w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/10">
                        <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider font-bold text-muted-foreground whitespace-nowrap min-w-[160px] sticky left-0 bg-muted/10">
                          {primaryLabel} <span className="text-muted-foreground/30">/ {secondaryLabel}</span>
                        </th>
                        {pivotData.secondaryVals.map((col) => (
                          <th key={col} className="px-3 py-3 text-center text-[10px] uppercase tracking-wider font-bold text-muted-foreground min-w-[80px] whitespace-nowrap">
                            {shortLabel(col)}
                          </th>
                        ))}
                        <th className="px-3 py-3 text-center text-[10px] uppercase tracking-wider font-bold text-foreground/70 min-w-[80px] whitespace-nowrap border-l border-border/60">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pivotData.primaryVals.map((rowLabel, idx) => {
                        const rowMap = pivotData.matrix.get(rowLabel);
                        const rowTotal = pivotData.rowTotals.get(rowLabel);
                        const rowTotalVal = getCellValue(rowTotal, crossMetric);
                        return (
                          <tr key={rowLabel}
                            className={`border-t border-border/40 hover:bg-muted/10 transition-colors ${idx % 2 === 0 ? "" : "bg-muted/[0.025]"}`}>
                            <td className="px-4 py-3 font-semibold text-sm text-foreground whitespace-nowrap sticky left-0 bg-card">
                              {rowLabel}
                            </td>
                            {pivotData.secondaryVals.map((col) => {
                              const cell = rowMap?.get(col);
                              const v = getCellValue(cell, crossMetric);
                              return (
                                <td key={col}
                                  className={`px-3 py-3 text-center tabular-nums font-semibold text-sm rounded-sm ${getCellHeat(v, rowLabel, col)}`}>
                                  {formatCellVal(v, crossMetric)}
                                </td>
                              );
                            })}
                            <td className="px-3 py-3 text-center tabular-nums font-bold text-sm text-foreground border-l border-border/60">
                              {formatCellVal(rowTotalVal, crossMetric)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      {/* Column totals row */}
                      <tr className="border-t-2 border-border bg-muted/20 font-bold">
                        <td className="px-4 py-3 text-xs font-bold text-foreground/70 sticky left-0 bg-muted/20 uppercase tracking-wide">
                          Total
                        </td>
                        {pivotData.secondaryVals.map((col) => {
                          const ct = pivotData.colTotals.get(col);
                          const v = getCellValue(ct, crossMetric);
                          return (
                            <td key={col} className="px-3 py-3 text-center tabular-nums text-sm text-foreground">
                              {formatCellVal(v, crossMetric)}
                            </td>
                          );
                        })}
                        <td className="px-3 py-3 text-center tabular-nums text-sm font-bold text-foreground border-l border-border/60">
                          {formatCellVal(getCellValue(pivotData.grandTotal, crossMetric), crossMetric)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                  <div className="px-4 py-2 border-t border-border/30 text-[10px] text-muted-foreground/50 flex items-center justify-between">
                    <span>
                      Color: <span className="font-medium">{heatDir === "col" ? "por columna" : heatDir === "row" ? "por fila" : "global"}</span>
                      {" · "}
                      {isRate ? "tasas calculadas sobre totales agregados, no promedio de %%" : ""}
                    </span>
                    {pivotData.secondaryVals.length === 10 && (
                      <span>top 10 {secondaryLabel.toLowerCase()}</span>
                    )}
                  </div>
                </div>
              );
            })()}

            {!crossDim && (
              <div className="flex items-center justify-center h-24 text-sm text-muted-foreground/40">
                Selecciona una dimensión arriba para ver el análisis cruzado
              </div>
            )}
          </div>
        </div>

      ) : (

        /* ── Company table ── */
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/30 border-b border-border">
                  {([
                    ["company_name", "Empresa",   "text-left"],
                    ["_ccaa",        "Región",    "text-left"],
                    ["_industry",    "Industria", "text-left"],
                    ["_segment",     "Tamaño",    "text-left"],
                    ["_isActive",    "Estado",    "text-left"],
                    ["_hasDemo",     "Demo",      "text-center"],
                    ["_isWon",       "Won",       "text-center"],
                    ["cmrr",         "CMRR",      "text-right"],
                    ["total_seats",  "Seats",     "text-right"],
                    ["_provenance",  "Canal",     "text-left"],
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
                  <tr key={r.id} className={`border-t border-border/50 hover:bg-muted/20 transition-colors ${idx % 2 === 0 ? "" : "bg-muted/[0.03]"}`}>
                    <td className="px-3 py-2 font-semibold max-w-[200px] truncate text-foreground">{r.company_name}</td>
                    <td className="px-3 py-2 text-muted-foreground text-[10px] whitespace-nowrap">
                      {r._ccaa !== "Others" ? r._ccaa : <span className="text-border/60">—</span>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[140px] truncate">{r._industry}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${segmentBadge(r._segment)}`}>
                        {r._segment}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${
                        r._isActive ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-50 text-slate-500 ring-slate-200"
                      }`}>{r._isActive ? "Activo" : "Lead"}</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {r._hasDemo ? <span className="inline-block w-2 h-2 rounded-full bg-violet-400" /> : <span className="text-border/40 text-[10px]">·</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {r._isWon ? <span className="inline-block w-2 h-2 rounded-full bg-amber-400" /> : <span className="text-border/40 text-[10px]">·</span>}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-right font-semibold">
                      {r.cmrr ? <span className={r.cmrr > 100000 ? "text-emerald-600" : ""}>{fmtNum(r.cmrr)}</span> : <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-right text-muted-foreground">{r.total_seats || <span className="text-muted-foreground/40">—</span>}</td>
                    <td className="px-3 py-2 text-muted-foreground text-[10px]">{r._provenance || <span className="text-muted-foreground/40">—</span>}</td>
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
                  const p = totalPages <= 5 ? i : page < 3 ? i : page > totalPages - 4 ? totalPages - 5 + i : page - 2 + i;
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
