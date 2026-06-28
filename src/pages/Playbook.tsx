import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { type RegionPlaybook } from "@/lib/playbookData";
import { SECTORS } from "@/lib/sectorMap";
import { usePlaybookLiveData } from "@/hooks/usePlaybookLiveData";
import { computePlaybook, type PlaybookLiveData, type BestPractice } from "@/lib/playbookCompute";
import {
  ChevronRight, TrendingUp, TrendingDown, Users, Building2, Handshake,
  Target, AlertCircle, HelpCircle, BarChart3, Zap, ArrowUpRight, Presentation,
  ChevronLeft, Maximize2, Minimize2, Upload, RefreshCw, CheckCircle2, AlertTriangle,
  Star, Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(Math.round(n));
}

function fmtEur(n: number): string {
  return fmtNum(n) + "€";
}

function delta(value: number, baseline: number): { diff: number; label: string; positive: boolean } {
  const diff = value - baseline;
  const sign = diff >= 0 ? "+" : "";
  return {
    diff,
    label: `${sign}${diff.toFixed(1)}`,
    positive: diff >= 0,
  };
}

function archetypeLabel(a: RegionPlaybook["archetype"]): string {
  if (a === "partner-led") return "Partner-Led";
  if (a === "outbound-responsive") return "Outbound-Responsive";
  return "Multi-Channel Core";
}

function archetypeTagline(a: RegionPlaybook["archetype"]): string {
  if (a === "partner-led") return "Activa y escala partners locales — el canal directo es secundario aquí.";
  if (a === "outbound-responsive") return "SDR outbound primero; estas regiones convierten bien cuando se las busca.";
  return "Ningún canal domina: orquesta secuencias inbound + outbound + partner para maximizar cobertura.";
}

function archetypeColor(a: RegionPlaybook["archetype"]): string {
  if (a === "partner-led") return "bg-violet-100 text-violet-800 border-violet-200";
  if (a === "outbound-responsive") return "bg-sky-100 text-sky-800 border-sky-200";
  return "bg-emerald-100 text-emerald-800 border-emerald-200";
}

function kpiColor(value: number, baseline: number, higherIsBetter: boolean): string {
  const ratio = value / baseline;
  const good = higherIsBetter ? ratio >= 1.05 : ratio <= 0.95;
  const bad = higherIsBetter ? ratio <= 0.9 : ratio >= 1.1;
  if (good) return "text-emerald-700";
  if (bad) return "text-red-600";
  return "text-foreground";
}

function barWidth(value: number, max: number): string {
  return `${Math.min(100, Math.round((value / max) * 100))}%`;
}

// ── Region list item ─────────────────────────────────────────────────────────

function RegionListItem({
  region, active, onClick,
}: { region: RegionPlaybook; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 flex items-center gap-3 transition-colors border-l-[3px]",
        active
          ? "bg-primary/5 border-l-primary"
          : "border-l-transparent hover:bg-muted/50",
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{region.ccaa}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium", archetypeColor(region.archetype))}>
            {archetypeLabel(region.archetype)}
          </span>
          <span className="text-[10px] text-muted-foreground tabular-nums">{fmtEur(region.mrr)} MRR</span>
        </div>
      </div>
      <ChevronRight className={cn("h-4 w-4 shrink-0 transition-colors", active ? "text-primary" : "text-muted-foreground/40")} />
    </button>
  );
}

// ── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, formatted, baseline, baselineLabel, higherIsBetter = true }: {
  label: string; value: number; formatted: string;
  baseline: number; baselineLabel?: string; higherIsBetter?: boolean;
}) {
  const d = delta(value, baseline);
  const color = baseline > 0 ? kpiColor(value, baseline, higherIsBetter) : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm p-4">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-1">{label}</div>
      <div className={cn("text-2xl font-bold tabular-nums leading-none", color)}>{formatted}</div>
      {baseline > 0 && (
        <div className="flex items-center gap-1.5 mt-2">
          {d.positive === higherIsBetter ? (
            <TrendingUp className="h-3 w-3 text-emerald-600" />
          ) : (
            <TrendingDown className="h-3 w-3 text-red-500" />
          )}
          <span className={cn("text-xs font-medium tabular-nums", d.positive === higherIsBetter ? "text-emerald-600" : "text-red-500")}>
            {d.label}{typeof baseline === "number" && baseline < 100 ? "pp" : ""}
          </span>
          <span className="text-[10px] text-muted-foreground">vs {baselineLabel ?? "nacional"}</span>
        </div>
      )}
    </div>
  );
}

// ── Size table ───────────────────────────────────────────────────────────────

function SizeTable({ sizes, tamBySize }: { sizes: RegionPlaybook["sizes"]; tamBySize?: Record<string, number> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="py-2 pr-3 font-semibold text-muted-foreground">Segmento</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">TAM</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">Leads</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">Pen.</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">Clientes</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">MRR</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">ARPU</th>
            <th className="py-2 pl-3 font-semibold text-muted-foreground text-right">L2W</th>
          </tr>
        </thead>
        <tbody>
          {sizes.map((s) => {
            const isXs = s.label === "XS (1-19)";
            const tam = !isXs ? (tamBySize?.[s.label] ?? 0) : 0;
            const pen = !isXs && tam > 0 ? Math.round(s.active / tam * 1000) / 10 : null;
            const l2w = s.pipeline > 0 ? Math.round(s.active / s.pipeline * 1000) / 10 : null;
            return (
              <tr key={s.label} className="border-b border-border/50 hover:bg-muted/30">
                <td className="py-2 pr-3">
                  <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold ring-1 ring-inset", segmentBadge(s.label))}>
                    {s.label}
                  </span>
                </td>
                <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{!isXs && tam > 0 ? tam.toLocaleString() : "—"}</td>
                <td className="py-2 px-3 text-right tabular-nums">{s.pipeline.toLocaleString()}</td>
                <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{pen !== null ? `${pen}%` : "—"}</td>
                <td className="py-2 px-3 text-right tabular-nums font-medium">{s.active.toLocaleString()}</td>
                <td className="py-2 px-3 text-right tabular-nums font-medium">{fmtEur(s.mrr)}</td>
                <td className="py-2 px-3 text-right tabular-nums">{fmtEur(s.arpu)}</td>
                <td className={cn("py-2 pl-3 text-right tabular-nums font-medium",
                  l2w === null ? "text-muted-foreground/40" : l2w >= 20 ? "text-emerald-700" : l2w >= 12 ? "text-amber-700" : "text-red-600"
                )}>
                  {l2w !== null ? `${l2w}%` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function segmentBadge(s: string): string {
  if (s.startsWith("S")) return "bg-sky-50 text-sky-700 ring-sky-200";
  if (s.startsWith("M")) return "bg-amber-50 text-amber-700 ring-amber-200";
  if (s.startsWith("L")) return "bg-orange-50 text-orange-700 ring-orange-200";
  if (s.startsWith("X")) return "bg-rose-50 text-rose-700 ring-rose-200";
  return "bg-muted text-muted-foreground ring-border";
}

// ── Provenance table ─────────────────────────────────────────────────────────

function ProvenanceTable({ provenances }: { provenances: RegionPlaybook["provenances"] }) {
  const maxMrr = Math.max(...provenances.map((p) => p.mrr), 1);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="py-2 pr-3 font-semibold text-muted-foreground">Canal</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">Leads</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">Clientes</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">MRR</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">ARPU</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">L2W</th>
            <th className="py-2 pl-3 font-semibold text-muted-foreground">% MRR</th>
          </tr>
        </thead>
        <tbody>
          {provenances.map((p) => {
            const l2w = p.pipeline > 0 ? Math.round(p.active / p.pipeline * 1000) / 10 : null;
            return (
              <tr key={p.label} className="border-b border-border/50 hover:bg-muted/30">
                <td className="py-2 pr-3 font-medium">{p.label}</td>
                <td className="py-2 px-3 text-right tabular-nums">{p.pipeline.toLocaleString()}</td>
                <td className="py-2 px-3 text-right tabular-nums">{p.active.toLocaleString()}</td>
                <td className="py-2 px-3 text-right tabular-nums font-medium">{fmtEur(p.mrr)}</td>
                <td className="py-2 px-3 text-right tabular-nums">{fmtEur(p.arpu)}</td>
                <td className={cn("py-2 px-3 text-right tabular-nums font-medium",
                  l2w === null ? "text-muted-foreground/40" : l2w >= 20 ? "text-emerald-700" : l2w >= 12 ? "text-amber-700" : "text-red-600"
                )}>
                  {l2w !== null ? `${l2w}%` : "—"}
                </td>
                <td className="py-2 pl-3 w-24">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary/60" style={{ width: barWidth(p.mrr, maxMrr) }} />
                    </div>
                    <span className="text-[10px] tabular-nums text-muted-foreground w-7 text-right">{p.mrrShare}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Industry table ───────────────────────────────────────────────────────────

function IndustryTable({ industries, nationalArpu, tamBySector }: {
  industries: RegionPlaybook["industries"];
  nationalArpu: number;
  tamBySector?: Record<string, number>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="py-2 pr-3 font-semibold text-muted-foreground">Industria</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">TAM</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">Leads</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">Pen.</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">Clientes</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">MRR</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">ARPU</th>
            <th className="py-2 pl-3 font-semibold text-muted-foreground text-right">L2W</th>
          </tr>
        </thead>
        <tbody>
          {industries.map((ind) => {
            const tam = tamBySector?.[ind.label] ?? 0;
            const pen = tam > 0 ? Math.round(ind.active / tam * 1000) / 10 : null;
            const l2w = (ind.pipeline ?? 0) > 0 ? Math.round(ind.active / ind.pipeline! * 1000) / 10 : null;
            return (
              <tr key={ind.label} className="border-b border-border/50 hover:bg-muted/30">
                <td className="py-2 pr-3 font-medium">{ind.label}</td>
                <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{tam > 0 ? tam.toLocaleString() : "—"}</td>
                <td className="py-2 px-3 text-right tabular-nums">{ind.pipeline?.toLocaleString() ?? "—"}</td>
                <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{pen !== null ? `${pen}%` : "—"}</td>
                <td className="py-2 px-3 text-right tabular-nums font-medium">{ind.active.toLocaleString()}</td>
                <td className="py-2 px-3 text-right tabular-nums font-medium">{fmtEur(ind.mrr)}</td>
                <td className={cn("py-2 px-3 text-right tabular-nums",
                  ind.arpu >= nationalArpu * 1.5 ? "text-emerald-700" : ind.arpu <= nationalArpu * 0.7 ? "text-red-600" : ""
                )}>
                  {fmtEur(ind.arpu)}
                </td>
                <td className={cn("py-2 pl-3 text-right tabular-nums font-medium",
                  l2w === null ? "text-muted-foreground/40" : l2w >= 20 ? "text-emerald-700" : l2w >= 12 ? "text-amber-700" : "text-red-600"
                )}>
                  {l2w !== null ? `${l2w}%` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Partner table ────────────────────────────────────────────────────────────

function PartnerTable({ partners }: { partners: RegionPlaybook["partners"] }) {
  const maxMrr = Math.max(...partners.map((p) => p.mrr));
  const totalMrr = partners.reduce((s, p) => s + p.mrr, 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="py-2 pr-3 font-semibold text-muted-foreground">Partner</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">Clientes</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">MRR</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">ARPU</th>
            <th className="py-2 pl-3 font-semibold text-muted-foreground">Peso</th>
          </tr>
        </thead>
        <tbody>
          {partners.map((p) => {
            const share = totalMrr > 0 ? Math.round((p.mrr / totalMrr) * 100) : 0;
            return (
              <tr key={p.name} className="border-b border-border/50 hover:bg-muted/30">
                <td className="py-2 pr-3 font-medium">{p.name}</td>
                <td className="py-2 px-3 text-right tabular-nums">{p.clients}</td>
                <td className="py-2 px-3 text-right tabular-nums font-medium">{fmtEur(p.mrr)}</td>
                <td className="py-2 px-3 text-right tabular-nums">{fmtEur(Math.round(p.mrr / p.clients))}</td>
                <td className="py-2 pl-3 w-32">
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-violet-400/60" style={{ width: barWidth(p.mrr, maxMrr) }} />
                    </div>
                    <span className="text-[10px] tabular-nums text-muted-foreground w-7 text-right">{share}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Strategy card ────────────────────────────────────────────────────────────

function StrategyCard({ icon: Icon, title, headline, detail }: {
  icon: typeof Target; title: string; headline: string; detail: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="h-3.5 w-3.5 text-primary" />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">{title}</span>
      </div>
      <div className="text-sm font-semibold text-foreground mb-1">{headline}</div>
      <div className="text-xs text-muted-foreground leading-relaxed">{detail}</div>
    </div>
  );
}

// ── Insight pill ─────────────────────────────────────────────────────────────

function InsightPill({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5 py-2">
      <Zap className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" />
      <span className="text-xs text-foreground leading-relaxed">{text}</span>
    </div>
  );
}

// ── Open question ────────────────────────────────────────────────────────────

function OpenQuestion({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5 py-2">
      <HelpCircle className="h-3.5 w-3.5 mt-0.5 text-blue-500 shrink-0" />
      <span className="text-xs text-foreground leading-relaxed">{text}</span>
    </div>
  );
}

// ── Channel cross-table ──────────────────────────────────────────────────────

type CrossMetric = "l2w" | "arpu" | "penetracion";

function ChannelCrossTable({
  cross,
  dimLabels,
  dimName: _dimName,
}: {
  cross: Record<string, Record<string, { active: number; pipeline: number; mrr: number }>>;
  dimLabels: string[];
  dimName: string;
}) {
  const [metric, setMetric] = useState<CrossMetric>("l2w");

  // Columns = channels sorted by total MRR desc
  const channels = Object.keys(cross).sort((a, b) => {
    const mrrA = Object.values(cross[a]).reduce((s, v) => s + v.mrr, 0);
    const mrrB = Object.values(cross[b]).reduce((s, v) => s + v.mrr, 0);
    return mrrB - mrrA;
  });
  // Rows = dims filtered to those with any data
  const activeDims = dimLabels.filter((d) => channels.some((ch) => cross[ch]?.[d]?.pipeline > 0));
  if (!channels.length || !activeDims.length) return null;

  // Per-row stats for color scaling
  const dimStats = Object.fromEntries(activeDims.map((d) => {
    const cells = channels.map((ch) => cross[ch]?.[d]).filter(Boolean) as { active: number; pipeline: number; mrr: number }[];
    const l2ws  = cells.map((c) => c.pipeline > 0 ? c.active / c.pipeline : 0);
    const arpus = cells.filter((c) => c.active > 0).map((c) => c.mrr / c.active);
    const pipelines = cells.map((c) => c.pipeline);
    return [d, {
      minL2w: Math.min(...l2ws), maxL2w: Math.max(...l2ws),
      minArpu: Math.min(...arpus.length ? arpus : [0]), maxArpu: Math.max(...arpus.length ? arpus : [0]),
      minPipeline: Math.min(...pipelines), maxPipeline: Math.max(...pipelines),
    }];
  }));

  function scaleColor(val: number, min: number, max: number): string {
    if (max === min) return "bg-muted/30 text-foreground/60";
    const t = (val - min) / (max - min);
    if (t >= 0.7) return "bg-emerald-50 text-emerald-800";
    if (t >= 0.35) return "bg-amber-50 text-amber-800";
    return "bg-red-50 text-red-700";
  }

  const METRIC_LABELS: Record<CrossMetric, string> = { l2w: "L2W", arpu: "ARPU", penetracion: "Penetración" };

  return (
    <div className="space-y-2">
      {/* Toggle */}
      <div className="flex items-center gap-1 rounded-full border border-border bg-muted/40 p-0.5 w-fit">
        {(["l2w", "arpu", "penetracion"] as CrossMetric[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMetric(m)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-colors",
              metric === m ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {METRIC_LABELS[m]}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px] table-fixed">
          <thead>
            <tr className="border-b border-border">
              <th className="py-1.5 pr-3 text-left font-semibold text-muted-foreground w-36"></th>
              {channels.map((ch) => (
                <th key={ch} className="py-1.5 px-1 text-center font-semibold text-muted-foreground">
                  <span className="block truncate">{ch}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeDims.map((d) => {
              const stats = dimStats[d];
              return (
                <tr key={d} className="border-b border-border/30 hover:bg-muted/20">
                  <td className="py-1.5 pr-3 font-medium text-foreground truncate max-w-[160px]" title={d}>
                    {d}
                  </td>
                  {channels.map((ch) => {
                    const cell = cross[ch]?.[d];
                    if (!cell || cell.pipeline === 0) {
                      return <td key={ch} className="py-1.5 px-2 text-center text-muted-foreground/30">—</td>;
                    }
                    const l2w  = Math.round(cell.active / cell.pipeline * 1000) / 10;
                    const arpu = cell.active > 0 ? Math.round(cell.mrr / cell.active) : 0;

                    if (metric === "l2w") {
                      return (
                        <td key={ch} className="py-1.5 px-1">
                          <span className={cn("px-1.5 py-0.5 rounded text-[10px] tabular-nums font-medium block text-center",
                            scaleColor(l2w, stats.minL2w * 100, stats.maxL2w * 100)
                          )}>
                            {l2w}%
                          </span>
                        </td>
                      );
                    }
                    if (metric === "arpu") {
                      return (
                        <td key={ch} className="py-1.5 px-1">
                          <span className={cn("px-1.5 py-0.5 rounded text-[10px] tabular-nums block text-center",
                            cell.active > 0 ? scaleColor(arpu, stats.minArpu, stats.maxArpu) : "text-muted-foreground/30"
                          )}>
                            {cell.active > 0 ? fmtEur(arpu) : "—"}
                          </span>
                        </td>
                      );
                    }
                    // penetracion → show pipeline (leads) as proxy
                    return (
                      <td key={ch} className="py-1.5 px-1">
                        <span className={cn("px-1.5 py-0.5 rounded text-[10px] tabular-nums block text-center",
                          scaleColor(cell.pipeline, stats.minPipeline, stats.maxPipeline)
                        )}>
                          {cell.pipeline.toLocaleString()}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Best Practices View ──────────────────────────────────────────────────────

function BestPracticesView({
  bestPractices,
  setSelectedCode,
  setView,
}: {
  bestPractices: BestPractice[];
  setSelectedCode: (code: string) => void;
  setView: (v: "region") => void;
}) {
  const [filterDimension, setFilterDimension] = useState<"all" | "size" | "industry">("all");

  const filtered = useMemo(() => {
    return bestPractices.filter((bp) => {
      if (filterDimension !== "all" && bp.dimension !== filterDimension) return false;
      return true;
    });
  }, [bestPractices, filterDimension]);

  const crossCount = bestPractices.filter((bp) => bp.isCrossRegion).length;
  const involvedRegions = new Set(bestPractices.flatMap((bp) => bp.codes)).size;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="rounded-xl border border-border bg-card shadow-sm p-4">
        <div className="flex items-center gap-2 mb-1">
          <Star className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-foreground">Mejores Prácticas</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          {bestPractices.length} mejores prácticas encontradas · {crossCount} cross-región · {involvedRegions} regiones involucradas
        </p>
      </div>

      {/* Filter bar — just Tamaño / Industria */}
      <div className="flex items-center gap-1 rounded-full border border-border bg-muted/40 p-0.5 w-fit">
        {(["all", "size", "industry"] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setFilterDimension(d)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-colors",
              filterDimension === d ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {d === "all" ? "Todos" : d === "size" ? "Tamaño" : "Industria"}
          </button>
        ))}
      </div>

      {/* Cards grouped by region */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No se encontraron mejores prácticas con estos filtros.
        </div>
      ) : (() => {
        // Group by region: each region gets all its BPs listed together
        const regionOrder: string[] = [];
        const byRegion = new Map<string, { code: string; bps: BestPractice[] }>();
        for (const bp of filtered) {
          for (let i = 0; i < bp.regions.length; i++) {
            const name = bp.regions[i];
            const code = bp.codes[i] ?? "";
            if (!byRegion.has(name)) {
              byRegion.set(name, { code, bps: [] });
              regionOrder.push(name);
            }
            byRegion.get(name)!.bps.push(bp);
          }
        }
        // Sort regions by number of BPs desc
        regionOrder.sort((a, b) => (byRegion.get(b)?.bps.length ?? 0) - (byRegion.get(a)?.bps.length ?? 0));
        return (
          <div className="space-y-4">
            {regionOrder.map((regionName) => {
              const { code, bps } = byRegion.get(regionName)!;
              return (
                <div key={regionName} className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                  {/* Region header */}
                  <button
                    type="button"
                    onClick={() => { setSelectedCode(code); setView("region"); }}
                    className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                  >
                    <span className="text-sm font-semibold text-foreground">{regionName}</span>
                    <span className="text-[10px] text-muted-foreground font-medium">{bps.length} práctica{bps.length > 1 ? "s" : ""} · ver región →</span>
                  </button>
                  {/* BP list */}
                  <div className="divide-y divide-border/60">
                    {bps.map((bp) => (
                      <div key={bp.id} className="px-4 py-3 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-semibold text-foreground leading-snug">{bp.headline}</span>
                          {bp.isCrossRegion && (
                            <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 font-semibold whitespace-nowrap">
                              Cross-región
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground/70">
                            L2W <span className="font-semibold text-foreground">{bp.l2w}%</span>
                            <span className="text-muted-foreground/50"> (media {bp.regionL2wAvg}%)</span>
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground/70">
                            ARPU <span className="font-semibold text-foreground">{fmtEur(bp.arpu)}</span>
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground/70">
                            Pipeline <span className="font-semibold text-foreground">{bp.pipeline}</span>
                          </span>
                          {bp.tamAvailable > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground/70">
                              TAM disp. <span className="font-semibold text-foreground">{bp.tamAvailable.toLocaleString()}</span>
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">{bp.insight}</p>
                        <div className="flex items-start gap-1.5">
                          <ArrowUpRight className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                          <p className="text-[11px] text-foreground/80 leading-relaxed">{bp.recommendation}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}

// ── Region detail panel ──────────────────────────────────────────────────────

function RegionDetail({ region, national, bestPractices }: {
  region: RegionPlaybook;
  national: { arpu: number; penetration: number; mrr: number; tam: number; hubspot: number; active: number };
  bestPractices: BestPractice[];
}) {
  const [activeTab, setActiveTab] = useState<"overview" | "channels" | "segments" | "industries" | "partners" | "estrategia">("overview");
  const whitespace = region.tam - region.active;
  const whitespaceRatio = 100 - region.penetration;

  const tabs = [
    { key: "overview" as const, label: "Visión general" },
    { key: "channels" as const, label: "Canales" },
    { key: "segments" as const, label: "Tamaños" },
    { key: "industries" as const, label: "Industrias" },
    { key: "partners" as const, label: "Partners" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{region.ccaa}</h2>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={cn("text-xs px-2 py-0.5 rounded-md border font-semibold", archetypeColor(region.archetype))}>
              {archetypeLabel(region.archetype)}
            </span>
            <span className="text-xs text-muted-foreground">
              {region.active.toLocaleString()} clientes activos · {fmtEur(region.mrr)} MRR
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">TAM</div>
          <div className="text-lg font-bold tabular-nums">{region.tam.toLocaleString()}</div>
          <div className="text-[10px] text-muted-foreground">{whitespace.toLocaleString()} sin cubrir ({whitespaceRatio.toFixed(1)}%)</div>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Clientes" value={region.active} formatted={region.active.toLocaleString()} baseline={0} baselineLabel="" higherIsBetter />
        <KpiCard label="ARPU" value={region.arpu} formatted={fmtEur(region.arpu)} baseline={national.arpu} baselineLabel={`nacional: ${fmtEur(national.arpu)}`} higherIsBetter />
        <KpiCard label="L2W" value={Math.round(region.active/region.hubspot*1000)/10} formatted={`${Math.round(region.active/region.hubspot*1000)/10}%`} baseline={Math.round(national.active/national.hubspot*1000)/10} baselineLabel={`nacional: ${Math.round(national.active/national.hubspot*1000)/10}%`} higherIsBetter />
        <KpiCard label="Penetración" value={region.penetration} formatted={`${region.penetration}%`} baseline={national.penetration} baselineLabel={`nacional: ${national.penetration}%`} higherIsBetter />
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Strategy narrative */}
          <div className="rounded-xl border border-border bg-card shadow-sm p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Análisis estratégico
            </h3>
            {/* Canal */}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Canal principal</span>
              </div>
              <p className="text-sm text-foreground leading-relaxed pl-5">{region.strategy.leadChannelDetail}</p>
            </div>
            {/* Partners */}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Handshake className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Partners — {region.strategy.partnerPlay}</span>
              </div>
              <p className="text-sm text-foreground leading-relaxed pl-5">{region.strategy.partnerDetail}</p>
            </div>
            {/* Tamaño + ARPU inline */}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Segmentación — foco {region.strategy.sizeFocus}</span>
              </div>
              <p className="text-sm text-foreground leading-relaxed pl-5">
                {region.strategy.sizeDetail}
                {region.strategy.arpuDetail && (
                  <> ARPU regional: <span className="font-semibold">{region.strategy.arpuAssessment}</span>. {region.strategy.arpuDetail}</>
                )}
              </p>
            </div>
            {/* Industria */}
            {region.strategy.industryFocus && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sectores clave</span>
                </div>
                <p className="text-sm text-foreground leading-relaxed pl-5">{region.strategy.industryDetail}</p>
              </div>
            )}
            {/* Conversión */}
            <div className="pt-1 border-t border-border/60">
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="font-semibold text-foreground">Conversión:</span> {region.strategy.conversionAssessment}
              </p>
            </div>
          </div>

          {/* Best practices for this region */}
          {bestPractices.filter((bp) => bp.codes.includes(region.code)).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-500" />
                Mejores Prácticas
              </h3>
              <div className="space-y-2">
                {bestPractices.filter((bp) => bp.codes.includes(region.code)).map((bp) => (
                  <div key={bp.id} className="rounded-lg border border-border bg-card p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold text-foreground leading-snug">{bp.headline}</span>
                      {bp.isCrossRegion && (
                        <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 font-semibold">
                          Cross-región
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground/70">
                        L2W <span className="font-semibold text-foreground">{bp.l2w}%</span>
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground/70">
                        ARPU <span className="font-semibold text-foreground">{fmtEur(bp.arpu)}</span>
                      </span>
                      {bp.tamAvailable > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground/70">
                          TAM disp. <span className="font-semibold text-foreground">{bp.tamAvailable.toLocaleString()}</span>
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">{bp.insight}</p>
                    <p className="text-[11px] text-foreground/80 leading-relaxed">{bp.recommendation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "channels" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card shadow-sm p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Desglose por canal de adquisición</h3>
            <ProvenanceTable provenances={region.provenances} />
          </div>
          <div className="rounded-xl border border-border bg-card shadow-sm p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Diagnóstico de canal</h3>
            <div className="text-xs text-muted-foreground leading-relaxed">{region.strategy.leadChannelDetail}</div>
          </div>
          {region.channelSizeCross && Object.keys(region.channelSizeCross).length > 0 && (
            <div className="rounded-xl border border-border bg-card shadow-sm p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Canal × Tamaño</h3>
              <ChannelCrossTable
                cross={region.channelSizeCross}
                dimLabels={["XS (1-19)", "S (20-50)", "M (51-200)", "L (201-500)", "XL (500+)"]}
                dimName="Tamaño"
              />
            </div>
          )}
          {region.channelIndustryCross && Object.keys(region.channelIndustryCross).length > 0 && (
            <div className="rounded-xl border border-border bg-card shadow-sm p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Canal × Industria</h3>
              <ChannelCrossTable
                cross={region.channelIndustryCross}
                dimLabels={["Tecnología & Software","Industria & Manufactura","Construcción & Inmobiliaria","Agroalimentario","Hostelería & Turismo","Salud","Distribución & Retail","Transporte & Logística","Servicios Profesionales","Educación & Formación","Energía & Medioambiente","Otros Servicios"]}
                dimName="Industria"
              />
            </div>
          )}
        </div>
      )}

      {activeTab === "segments" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card shadow-sm p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Desglose por tamaño de empresa</h3>
            <SizeTable sizes={region.sizes} tamBySize={region.tamBySizeForRegion} />
          </div>
          <div className="rounded-xl border border-border bg-card shadow-sm p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Estrategia de tamaño</h3>
            <div className="text-xs text-muted-foreground leading-relaxed">{region.strategy.sizeDetail}</div>
          </div>
        </div>
      )}

      {activeTab === "industries" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card shadow-sm p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Top industrias por MRR</h3>
            <IndustryTable industries={region.industries} nationalArpu={national.arpu} tamBySector={region.tamBySectorForRegion} />
          </div>
          {region.industryInsights && region.industryInsights.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                Insights por industria
              </h3>
              <div className="space-y-2">
                {region.industryInsights.map((ins, i) => (
                  <div key={i} className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-foreground/80">
                    {ins}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "partners" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card shadow-sm p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Top partners</h3>
            <PartnerTable partners={region.partners} />
          </div>
          <div className="rounded-xl border border-border bg-card shadow-sm p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Estrategia de partners</h3>
            <div className="text-xs text-muted-foreground leading-relaxed">{region.strategy.partnerDetail}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Summary table ────────────────────────────────────────────────────────────

function SummaryView({ data }: { data: PlaybookLiveData }) {
  const { regions: REGIONS, national: NATIONAL } = data;
  const [summaryTab, setSummaryTab] = useState<"ccaa" | "industria" | "tamaño">("ccaa");
  const sorted = useMemo(() => [...REGIONS].sort((a, b) => b.mrr - a.mrr), [REGIONS]);

  const nationalIndustries = useMemo(() => {
    const map = new Map<string, { active: number; pipeline: number; mrr: number }>(
      SECTORS.map((s) => [s, { active: 0, pipeline: 0, mrr: 0 }]),
    );
    for (const r of REGIONS) {
      for (const ind of r.industries) {
        const g = map.get(ind.label) ?? { active: 0, pipeline: 0, mrr: 0 };
        g.active  += ind.active;
        g.pipeline += ind.pipeline ?? 0;
        g.mrr     += ind.mrr;
        map.set(ind.label, g);
      }
    }
    return [...map.entries()]
      .map(([label, g]) => ({
        label, active: g.active, pipeline: g.pipeline, mrr: g.mrr,
        arpu: g.active > 0 ? Math.round(g.mrr / g.active) : 0,
        l2w: g.pipeline > 0 ? Math.round(g.active / g.pipeline * 1000) / 10 : null,
      }))
      .sort((a, b) => b.mrr - a.mrr);
  }, [REGIONS]);

  const nationalSizes = useMemo(() => {
    const ORDER = ["XS (1-19)", "S (20-50)", "M (51-200)", "L (201-500)", "XL (500+)"];
    const map = new Map<string, { active: number; pipeline: number; mrr: number }>();
    for (const r of REGIONS) {
      for (const s of r.sizes) {
        const g = map.get(s.label) ?? { active: 0, pipeline: 0, mrr: 0 };
        g.active   += s.active;
        g.pipeline += s.pipeline;
        g.mrr      += s.mrr;
        map.set(s.label, g);
      }
    }
    return [...map.entries()]
      .map(([label, g]) => ({
        label,
        active:   g.active,
        pipeline: g.pipeline,
        mrr:      g.mrr,
        arpu:     g.active > 0 ? Math.round(g.mrr / g.active) : 0,
        l2w:      g.pipeline > 0 ? Math.round(g.active / g.pipeline * 1000) / 10 : null,
      }))
      .filter((r) => r.active > 0)
      .sort((a, b) => (ORDER.indexOf(a.label) ?? 99) - (ORDER.indexOf(b.label) ?? 99));
  }, [REGIONS]);

  const SUMMARY_TABS = [
    { key: "ccaa" as const, label: "CCAA" },
    { key: "industria" as const, label: "Industria" },
    { key: "tamaño" as const, label: "Tamaño" },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card shadow-sm p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-1">Resumen nacional</h3>
            <p className="text-xs text-muted-foreground">
              {NATIONAL.active.toLocaleString()} clientes activos, {fmtEur(NATIONAL.mrr)} MRR, {NATIONAL.penetration}% penetración sobre {NATIONAL.tam.toLocaleString()} TAM
            </p>
          </div>
          <div className="flex items-center gap-0.5 rounded-full border border-border bg-muted/40 p-0.5 shrink-0">
            {SUMMARY_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setSummaryTab(t.key)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                  summaryTab === t.key
                    ? "bg-card shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          {summaryTab === "ccaa" && (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-2 font-semibold text-muted-foreground">CCAA</th>
                  <th className="py-2 px-2 font-semibold text-muted-foreground">Arquetipo</th>
                  <th className="py-2 px-2 font-semibold text-muted-foreground text-right">TAM</th>
                  <th className="py-2 px-2 font-semibold text-muted-foreground text-right">Pen.</th>
                  <th className="py-2 px-2 font-semibold text-muted-foreground text-right">Clientes</th>
                  <th className="py-2 px-2 font-semibold text-muted-foreground text-right">MRR</th>
                  <th className="py-2 px-2 font-semibold text-muted-foreground text-right">ARPU</th>
                  <th className="py-2 pl-2 font-semibold text-muted-foreground text-right">L2W</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const l2w = r.hubspot > 0 ? Math.round(r.active / r.hubspot * 1000) / 10 : null;
                  return (
                    <tr key={r.code} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-2 pr-2 font-medium">{r.ccaa}</td>
                      <td className="py-2 px-2">
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium whitespace-nowrap", archetypeColor(r.archetype))}>
                          {archetypeLabel(r.archetype)}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{r.tam.toLocaleString()}</td>
                      <td className={cn("py-2 px-2 text-right tabular-nums",
                        r.penetration >= NATIONAL.penetration ? "text-emerald-700" : "text-muted-foreground"
                      )}>
                        {r.penetration}%
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">{r.active.toLocaleString()}</td>
                      <td className="py-2 px-2 text-right tabular-nums font-medium">{fmtEur(r.mrr)}</td>
                      <td className={cn("py-2 px-2 text-right tabular-nums font-medium",
                        r.arpu >= NATIONAL.arpu * 1.1 ? "text-emerald-700" : r.arpu <= NATIONAL.arpu * 0.85 ? "text-red-600" : ""
                      )}>
                        {fmtEur(r.arpu)}
                      </td>
                      <td className={cn("py-2 pl-2 text-right tabular-nums font-medium",
                        l2w === null ? "text-muted-foreground/40" : l2w >= 22 ? "text-emerald-700" : l2w >= 15 ? "text-amber-700" : "text-red-600"
                      )}>
                        {l2w !== null ? `${l2w}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/20">
                  <td className="py-2 pr-2 font-bold text-foreground">Total</td>
                  <td className="py-2 px-2" />
                  <td className="py-2 px-2 text-right tabular-nums font-bold text-foreground">{NATIONAL.tam.toLocaleString()}</td>
                  <td className="py-2 px-2 text-right tabular-nums font-bold text-foreground">{NATIONAL.penetration}%</td>
                  <td className="py-2 px-2 text-right tabular-nums font-bold text-foreground">{NATIONAL.active.toLocaleString()}</td>
                  <td className="py-2 px-2 text-right tabular-nums font-bold text-foreground">{fmtEur(NATIONAL.mrr)}</td>
                  <td className="py-2 px-2 text-right tabular-nums font-bold text-foreground">{fmtEur(NATIONAL.arpu)}</td>
                  <td className="py-2 pl-2 text-right tabular-nums font-bold text-foreground">
                    {NATIONAL.hubspot > 0 ? `${Math.round(NATIONAL.active / NATIONAL.hubspot * 1000) / 10}%` : "—"}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}

          {summaryTab === "industria" && (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-3 font-semibold text-muted-foreground">Industria</th>
                  <th className="py-2 px-3 font-semibold text-muted-foreground text-right">TAM</th>
                  <th className="py-2 px-3 font-semibold text-muted-foreground text-right">Leads</th>
                  <th className="py-2 px-3 font-semibold text-muted-foreground text-right">Pen.</th>
                  <th className="py-2 px-3 font-semibold text-muted-foreground text-right">Clientes</th>
                  <th className="py-2 px-3 font-semibold text-muted-foreground text-right">MRR</th>
                  <th className="py-2 px-3 font-semibold text-muted-foreground text-right">ARPU</th>
                  <th className="py-2 pl-3 font-semibold text-muted-foreground text-right">L2W</th>
                </tr>
              </thead>
              <tbody>
                {nationalIndustries.map((ind) => {
                  const tam = data.tamBySector[ind.label] ?? 0;
                  const pen = tam > 0 ? Math.round(ind.active / tam * 1000) / 10 : null;
                  return (
                    <tr key={ind.label} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-2 pr-3 font-medium">{ind.label}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{tam > 0 ? tam.toLocaleString() : "—"}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{ind.pipeline.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{pen !== null ? `${pen}%` : "—"}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{ind.active.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-medium">{fmtEur(ind.mrr)}</td>
                      <td className={cn("py-2 px-3 text-right tabular-nums font-medium",
                        ind.arpu >= NATIONAL.arpu * 1.1 ? "text-emerald-700" : ind.arpu <= NATIONAL.arpu * 0.85 ? "text-red-600" : ""
                      )}>
                        {fmtEur(ind.arpu)}
                      </td>
                      <td className={cn("py-2 pl-3 text-right tabular-nums font-medium",
                        ind.l2w === null ? "text-muted-foreground/40" : ind.l2w >= 20 ? "text-emerald-700" : ind.l2w >= 12 ? "text-amber-700" : "text-red-600"
                      )}>
                        {ind.l2w !== null ? `${ind.l2w}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {(() => {
                  const totalTam = nationalIndustries.reduce((s, ind) => s + (data.tamBySector[ind.label] ?? 0), 0);
                  const totalLeads = nationalIndustries.reduce((s, ind) => s + ind.pipeline, 0);
                  const totalActive = nationalIndustries.reduce((s, ind) => s + ind.active, 0);
                  const totalMrr = nationalIndustries.reduce((s, ind) => s + ind.mrr, 0);
                  const totalArpu = totalActive > 0 ? Math.round(totalMrr / totalActive) : 0;
                  const totalL2w = totalLeads > 0 ? Math.round(totalActive / totalLeads * 1000) / 10 : null;
                  return (
                    <tr className="border-t-2 border-border bg-muted/20">
                      <td className="py-2 pr-3 font-bold text-foreground">Total</td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold text-foreground">{totalTam > 0 ? totalTam.toLocaleString() : "—"}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold text-foreground">{totalLeads.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold text-foreground">{NATIONAL.penetration}%</td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold text-foreground">{totalActive.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold text-foreground">{fmtEur(totalMrr)}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold text-foreground">{fmtEur(totalArpu)}</td>
                      <td className="py-2 pl-3 text-right tabular-nums font-bold text-foreground">{totalL2w !== null ? `${totalL2w}%` : "—"}</td>
                    </tr>
                  );
                })()}
              </tfoot>
            </table>
          )}

          {summaryTab === "tamaño" && (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-3 font-semibold text-muted-foreground">Tamaño</th>
                  <th className="py-2 px-3 font-semibold text-muted-foreground text-right">TAM</th>
                  <th className="py-2 px-3 font-semibold text-muted-foreground text-right">Leads</th>
                  <th className="py-2 px-3 font-semibold text-muted-foreground text-right">Pen.</th>
                  <th className="py-2 px-3 font-semibold text-muted-foreground text-right">Clientes</th>
                  <th className="py-2 px-3 font-semibold text-muted-foreground text-right">MRR</th>
                  <th className="py-2 px-3 font-semibold text-muted-foreground text-right">ARPU</th>
                  <th className="py-2 pl-3 font-semibold text-muted-foreground text-right">L2W</th>
                </tr>
              </thead>
              <tbody>
                {nationalSizes.map((s) => {
                  const isXs = s.label === "XS (1-19)";
                  const tam = !isXs ? (data.tamBySize[s.label] ?? 0) : 0;
                  const pen = !isXs && tam > 0 ? Math.round(s.active / tam * 1000) / 10 : null;
                  return (
                    <tr key={s.label} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-2 pr-3 font-medium">{s.label}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{!isXs && tam > 0 ? tam.toLocaleString() : "—"}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{s.pipeline.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{pen !== null ? `${pen}%` : "—"}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{s.active.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-medium">{fmtEur(s.mrr)}</td>
                      <td className={cn("py-2 px-3 text-right tabular-nums font-medium",
                        s.arpu >= NATIONAL.arpu * 1.1 ? "text-emerald-700" : s.arpu <= NATIONAL.arpu * 0.85 ? "text-red-600" : ""
                      )}>
                        {fmtEur(s.arpu)}
                      </td>
                      <td className={cn("py-2 pl-3 text-right tabular-nums font-medium",
                        s.l2w === null ? "text-muted-foreground/40" : s.l2w >= 20 ? "text-emerald-700" : s.l2w >= 12 ? "text-amber-700" : "text-red-600"
                      )}>
                        {s.l2w !== null ? `${s.l2w}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {(() => {
                  const totalTam = nationalSizes.filter(s => s.label !== "XS (1-19)").reduce((s, sz) => s + (data.tamBySize[sz.label] ?? 0), 0);
                  const totalLeads = nationalSizes.reduce((s, sz) => s + sz.pipeline, 0);
                  const totalActive = nationalSizes.reduce((s, sz) => s + sz.active, 0);
                  const totalMrr = nationalSizes.reduce((s, sz) => s + sz.mrr, 0);
                  const totalArpu = totalActive > 0 ? Math.round(totalMrr / totalActive) : 0;
                  const totalL2w = totalLeads > 0 ? Math.round(totalActive / totalLeads * 1000) / 10 : null;
                  return (
                    <tr className="border-t-2 border-border bg-muted/20">
                      <td className="py-2 pr-3 font-bold text-foreground">Total</td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold text-foreground">{totalTam > 0 ? totalTam.toLocaleString() : "—"}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold text-foreground">{totalLeads.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold text-foreground">{NATIONAL.penetration}%</td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold text-foreground">{totalActive.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold text-foreground">{fmtEur(totalMrr)}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-bold text-foreground">{fmtEur(totalArpu)}</td>
                      <td className="py-2 pl-3 text-right tabular-nums font-bold text-foreground">{totalL2w !== null ? `${totalL2w}%` : "—"}</td>
                    </tr>
                  );
                })()}
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {/* Archetype summary — only shown in CCAA view */}
      {summaryTab === "ccaa" && <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {(["partner-led", "outbound-responsive", "multi-channel"] as const).map((arch) => {
          const regions = REGIONS.filter((r) => r.archetype === arch);
          const totalMrr = regions.reduce((s, r) => s + r.mrr, 0);
          const totalActive = regions.reduce((s, r) => s + r.active, 0);
          return (
            <div key={arch} className={cn("rounded-xl border shadow-sm p-4", archetypeColor(arch))}>
              <div className="text-xs font-bold uppercase tracking-wider mb-1">{archetypeLabel(arch)}</div>
              <div className="text-lg font-bold tabular-nums">{fmtEur(totalMrr)} MRR</div>
              <div className="text-xs mt-1">
                {regions.length} regiones · {totalActive.toLocaleString()} clientes
              </div>
              <div className="text-[11px] mt-2.5 leading-relaxed font-medium opacity-90 italic">
                {archetypeTagline(arch)}
              </div>
              <div className="text-[10px] mt-2 leading-relaxed opacity-60">
                {regions.map((r) => r.ccaa).join(", ")}
              </div>
            </div>
          );
        })}
      </div>}
    </div>
  );
}

// ── Slides helpers ───────────────────────────────────────────────────────────

function SlideKpiPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm px-4 py-2 flex flex-col items-center">
      <span className="text-base font-bold text-gray-900 tabular-nums">{value}</span>
      <span className="text-[10px] uppercase tracking-widest text-gray-400 mt-0.5">{label}</span>
    </div>
  );
}

function SlideKpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-3 flex flex-col">
      <span className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">{label}</span>
      <span className="text-2xl font-bold text-gray-900 tabular-nums leading-none">{value}</span>
    </div>
  );
}

function InsightBox({ text, actionable = false }: { text: string; actionable?: boolean }) {
  return (
    <div className={cn(
      "px-4 py-3 rounded-r-lg mt-auto",
      actionable
        ? "border-l-4 border-red-600 bg-red-50"
        : "border-l-4 border-gray-300 bg-gray-50",
    )}>
      <span className={cn(
        "text-[10px] font-bold uppercase tracking-widest mr-2",
        actionable ? "text-red-600" : "text-gray-500",
      )}>
        {actionable ? "ACCIONABLE" : "KEY INSIGHT"}
      </span>
      <span className="text-xs text-gray-700">{text}</span>
    </div>
  );
}

function SlideNav({ slide, total, onPrev, onNext, isFullscreen, onToggleFullscreen }: {
  slide: number; total: number; onPrev: () => void; onNext: () => void;
  isFullscreen: boolean; onToggleFullscreen: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-8 py-4 border-t border-gray-100 shrink-0 bg-white">
      <button
        type="button"
        onClick={onPrev}
        disabled={slide === 0}
        className="px-4 py-1.5 text-xs font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Anterior
      </button>
      <div className="flex flex-col items-center gap-1.5">
        <span className="text-xs text-gray-500 tabular-nums">{slide + 1} / {total}</span>
        <div className="flex gap-1">
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1 rounded-full transition-all",
                i === slide ? "w-4 bg-red-600" : "w-1.5 bg-gray-300",
              )}
            />
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={onNext}
        disabled={slide === total - 1}
        className="px-4 py-1.5 text-xs font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
      >
        Siguiente
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onToggleFullscreen}
        title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
        className="p-1.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors"
      >
        {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function penColorClass(p: number): string {
  if (p < 5) return "text-red-600 font-semibold";
  if (p <= 10) return "text-amber-600 font-semibold";
  return "text-emerald-700 font-semibold";
}

// ── SlidesView ────────────────────────────────────────────────────────────────

function SlidesView({ data }: { data: PlaybookLiveData }) {
  const { regions: REGIONS, national: NATIONAL } = data;
  const [slide, setSlide] = useState(0);
  const TOTAL = 14;

  // ── Aggregated channel data ──────────────────────────────────────────────────
  const nationalChannels = useMemo(() => {
    const KNOWN = ["Channel Partners", "Outbound", "Inbound", "Santander", "Paid", "Telefónica"];
    const map = new Map<string, { active: number; mrr: number; d2wNum: number; d2wDen: number }>();
    for (const r of REGIONS) {
      for (const p of r.provenances) {
        const key = KNOWN.includes(p.label) ? p.label : "Otros";
        const g = map.get(key) ?? { active: 0, mrr: 0, d2wNum: 0, d2wDen: 0 };
        g.active += p.active;
        g.mrr += p.mrr;
        if (p.d2w !== null) { g.d2wNum += p.d2w * p.pipeline; g.d2wDen += p.pipeline; }
        map.set(key, g);
      }
    }
    const totalMrr = [...map.values()].reduce((s, g) => s + g.mrr, 0);
    return [...map.entries()]
      .map(([label, g]) => ({
        label,
        active: g.active,
        mrr: g.mrr,
        mrrShare: totalMrr > 0 ? Math.round((g.mrr / totalMrr) * 100) : 0,
        arpu: g.active > 0 ? Math.round(g.mrr / g.active) : 0,
        d2w: g.d2wDen > 0 ? Math.round((g.d2wNum / g.d2wDen) * 10) / 10 : null,
      }))
      .sort((a, b) => b.mrr - a.mrr);
  }, [REGIONS]);

  // ── Aggregated industry data ─────────────────────────────────────────────────
  const nationalIndustries = useMemo(() => {
    const map = new Map<string, { active: number; mrr: number }>(
      SECTORS.map((s) => [s, { active: 0, mrr: 0 }]),
    );
    for (const r of REGIONS) {
      for (const ind of r.industries) {
        const g = map.get(ind.label) ?? { active: 0, mrr: 0 };
        g.active += ind.active;
        g.mrr += ind.mrr;
        map.set(ind.label, g);
      }
    }
    const sorted = [...map.entries()]
      .map(([label, g]) => ({ label, active: g.active, mrr: g.mrr, arpu: g.active > 0 ? Math.round(g.mrr / g.active) : 0 }))
      .sort((a, b) => b.mrr - a.mrr);
    const top5 = sorted.slice(0, 5);
    const otrosMrr = sorted.slice(5).reduce((s, x) => s + x.mrr, 0);
    const otrosActive = sorted.slice(5).reduce((s, x) => s + x.active, 0);
    if (otrosMrr > 0) top5.push({ label: "Otros", active: otrosActive, mrr: otrosMrr, arpu: otrosActive > 0 ? Math.round(otrosMrr / otrosActive) : 0 });
    const totalMrr = top5.reduce((s, x) => s + x.mrr, 0);
    return top5.map((x) => ({ ...x, pct: totalMrr > 0 ? Math.round((x.mrr / totalMrr) * 100) : 0 }));
  }, [REGIONS]);

  // ── Aggregated size data ─────────────────────────────────────────────────────
  const nationalSizes = useMemo(() => {
    const ORDER = ["XS (1-19)", "S (20-50)", "M (51-200)", "L (201-500)", "XL (500+)"];
    const map = new Map<string, { active: number; mrr: number; d2wNum: number; d2wDen: number }>();
    for (const r of REGIONS) {
      for (const s of r.sizes) {
        const g = map.get(s.label) ?? { active: 0, mrr: 0, d2wNum: 0, d2wDen: 0 };
        g.active += s.active;
        g.mrr += s.mrr;
        if (s.d2w !== null) { g.d2wNum += s.d2w * s.pipeline; g.d2wDen += s.pipeline; }
        map.set(s.label, g);
      }
    }
    const totalMrr = [...map.values()].reduce((s, g) => s + g.mrr, 0);
    return [...map.entries()]
      .map(([label, g]) => ({
        label,
        active: g.active,
        mrr: g.mrr,
        arpu: g.active > 0 ? Math.round(g.mrr / g.active) : 0,
        d2w: g.d2wDen > 0 ? Math.round((g.d2wNum / g.d2wDen) * 10) / 10 : null,
        mrrShare: totalMrr > 0 ? Math.round((g.mrr / totalMrr) * 100) : 0,
      }))
      .sort((a, b) => ORDER.indexOf(a.label) - ORDER.indexOf(b.label));
  }, [REGIONS]);

  // ── Top-10 by untapped TAM ───────────────────────────────────────────────────
  const untappedTop10 = useMemo(() =>
    [...REGIONS]
      .map((r) => ({ ...r, untapped: Math.round(r.tam * (1 - r.penetration / 100)) }))
      .sort((a, b) => b.untapped - a.untapped)
      .slice(0, 10),
    [],
  );

  // ── Regions by MRR ───────────────────────────────────────────────────────────
  const regionsByMrr = useMemo(() => [...REGIONS].sort((a, b) => b.mrr - a.mrr), []);

  // ── Archetype aggregates ─────────────────────────────────────────────────────
  const archetypeAgg = useMemo(() => {
    const archetypes = ["partner-led", "outbound-responsive", "multi-channel"] as const;
    return archetypes.map((arch) => {
      const regions = REGIONS.filter((r) => r.archetype === arch);
      const totalActive = regions.reduce((s, r) => s + r.active, 0);
      const totalMrr = regions.reduce((s, r) => s + r.mrr, 0);
      const avgArpu = totalActive > 0 ? Math.round(totalMrr / totalActive) : 0;
      const avgD2w = regions.length > 0 ? Math.round((regions.reduce((s, r) => s + r.d2w, 0) / regions.length) * 10) / 10 : 0;
      return { arch, regions, mrr: totalMrr, active: totalActive, count: regions.length, avgArpu, avgD2w };
    });
  }, [REGIONS]);

  // ── Partner-led provenance aggregate ─────────────────────────────────────────
  const partnerLedData = useMemo(() => {
    const regions = REGIONS.filter((r) => r.archetype === "partner-led").sort((a, b) => b.mrr - a.mrr);
    const channelMap = new Map<string, { active: number; mrr: number; pipelineD2w: number; pipeline: number }>();
    for (const r of regions) {
      for (const p of r.provenances) {
        const g = channelMap.get(p.label) ?? { active: 0, mrr: 0, pipelineD2w: 0, pipeline: 0 };
        g.active += p.active;
        g.mrr += p.mrr;
        if (p.d2w !== null) { g.pipelineD2w += p.d2w * p.pipeline; g.pipeline += p.pipeline; }
        channelMap.set(p.label, g);
      }
    }
    const totalMrr = [...channelMap.values()].reduce((s, g) => s + g.mrr, 0);
    const channels = [...channelMap.entries()]
      .map(([label, g]) => ({
        label,
        active: g.active,
        mrr: g.mrr,
        pctMrr: totalMrr > 0 ? Math.round((g.mrr / totalMrr) * 100) : 0,
        arpu: g.active > 0 ? Math.round(g.mrr / g.active) : 0,
        d2w: g.pipeline > 0 ? Math.round((g.pipelineD2w / g.pipeline) * 10) / 10 : null,
      }))
      .sort((a, b) => b.mrr - a.mrr);
    const totalActive = channels.reduce((s, c) => s + c.active, 0);
    const weightedArpu = totalActive > 0 ? Math.round(totalMrr / totalActive) : 0;
    const totalPipeline = channels.reduce((s, c) => s + (c.d2w !== null ? c.active : 0), 0);
    const weightedD2w = totalPipeline > 0
      ? Math.round((channels.reduce((s, c) => s + (c.d2w !== null ? c.d2w * c.active : 0), 0) / totalPipeline) * 10) / 10
      : null;
    // Get dominant partner per region
    const dominantPartner = (r: RegionPlaybook) => {
      const partnerProv = r.provenances.find((p) => p.label === "Channel Partners");
      return partnerProv ? r.partners[0]?.name ?? "—" : "—";
    };
    return { regions, channels, totalActive, totalMrr, weightedArpu, weightedD2w, dominantPartner };
  }, [REGIONS]);

  // ── Outbound-responsive provenance aggregate ─────────────────────────────────
  const outboundData = useMemo(() => {
    const regions = REGIONS.filter((r) => r.archetype === "outbound-responsive").sort((a, b) => b.mrr - a.mrr);
    const channelMap = new Map<string, { active: number; mrr: number; pipelineD2w: number; pipeline: number }>();
    for (const r of regions) {
      for (const p of r.provenances) {
        const g = channelMap.get(p.label) ?? { active: 0, mrr: 0, pipelineD2w: 0, pipeline: 0 };
        g.active += p.active;
        g.mrr += p.mrr;
        if (p.d2w !== null) { g.pipelineD2w += p.d2w * p.pipeline; g.pipeline += p.pipeline; }
        channelMap.set(p.label, g);
      }
    }
    const totalMrr = [...channelMap.values()].reduce((s, g) => s + g.mrr, 0);
    const channels = [...channelMap.entries()]
      .map(([label, g]) => ({
        label,
        active: g.active,
        mrr: g.mrr,
        pctMrr: totalMrr > 0 ? Math.round((g.mrr / totalMrr) * 100) : 0,
        arpu: g.active > 0 ? Math.round(g.mrr / g.active) : 0,
        d2w: g.pipeline > 0 ? Math.round((g.pipelineD2w / g.pipeline) * 10) / 10 : null,
      }))
      .sort((a, b) => b.mrr - a.mrr);
    const totalActive = channels.reduce((s, c) => s + c.active, 0);
    const weightedArpu = totalActive > 0 ? Math.round(totalMrr / totalActive) : 0;
    const totalPipeline = channels.reduce((s, c) => s + (c.d2w !== null ? c.active : 0), 0);
    const weightedD2w = totalPipeline > 0
      ? Math.round((channels.reduce((s, c) => s + (c.d2w !== null ? c.d2w * c.active : 0), 0) / totalPipeline) * 10) / 10
      : null;
    const outboundD2w = (r: RegionPlaybook) => r.provenances.find((p) => p.label === "Outbound")?.d2w ?? null;
    return { regions, channels, totalActive, totalMrr, weightedArpu, weightedD2w, outboundD2w };
  }, [REGIONS]);

  // ── Multi-channel data ────────────────────────────────────────────────────────
  const multiChannelData = useMemo(() => {
    const regions = REGIONS.filter((r) => r.archetype === "multi-channel").sort((a, b) => b.mrr - a.mrr);
    const totalMrr = regions.reduce((s, r) => s + r.mrr, 0);
    const totalActive = regions.reduce((s, r) => s + r.active, 0);
    const avgArpu = totalActive > 0 ? Math.round(totalMrr / totalActive) : 0;
    const topChannel = (r: RegionPlaybook) => [...r.provenances].sort((a, b) => b.mrrShare - a.mrrShare)[0];
    return { regions, totalMrr, totalActive, avgArpu, topChannel };
  }, [REGIONS]);

  // ── Top-5 opportunities ───────────────────────────────────────────────────────
  const top5Opp = useMemo(() =>
    [...REGIONS]
      .map((r) => ({
        ...r,
        score: Math.round((1 - r.penetration / 100) * r.tam * (r.d2w / 100)),
        untapped: Math.round(r.tam * (1 - r.penetration / 100)),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5),
    [],
  );

  // ── Why each top-5 wins ───────────────────────────────────────────────────────
  const oppWhy: Record<string, string> = {
    "MD": "17.3K empresas en TAM, pero solo 1.5K activas (8.5% penetración) — 9 de cada 10 empresas elegibles nunca han hablado con Factorial. El modelo multi-canal ya funciona: D2W del 80.4% confirma que cuando llegamos, cerramos. El problema es llegar.",
    "CT": "Mayor base activa de España (1.95K clientes, €1.3M MRR) pero con un 10% de penetración sobre 19K de TAM. Outbound tiene D2W del 87% — el canal más eficiente del país. Partners aportan ARPU 55% superior al outbound directo. Escala de los dos a la vez.",
    "AN": "TAM de 11.7K con solo 5.5% penetrado — la segunda región por mercado sin tocar. D2W sólido (75.8%) demuestra que el equipo sabe cerrar. El cuello de botella está arriba del funnel: pocas empresas entran en pipeline, no pocas convierten.",
    "PV": "Mercado corporativo denso: ARPU medio de €967 vs €729 nacional (+33%). Partners locales generan el 38% del MRR con muy poca penetración (4.4%). Cada punto de penetración aquí vale más en euros que en casi cualquier otra región.",
    "VC": "8.8K TAM con solo 5.4% penetrado. Outbound D2W del 70.4% — por debajo de media nacional, pero el volumen sin cubrir (8.3K empresas) compensa. Segunda economía del Mediterráneo con base industrial diversificada y crecimiento demográfico.",
  };
  const oppAction: Record<string, string> = {
    "MD": "Doblar frecuencia de outbound en Madrid ciudad (centro financiero + tech hub). Activar 2 partners enterprise nuevos en Q3 — foco en Wolters Kluwer y Cobee. Objetivo: +300 demos en 90 días.",
    "CT": "Añadir 2 SDRs dedicados al segmento M/L (51-500 emp.) donde el ARPU partner es €1,128. Consolidar pipeline via Canal Partners para deals >200 empleados. No tocar el inbound — aporta 20% del MRR con coste mínimo.",
    "AN": "Lanzar campaña outbound focalizada en Sevilla y Málaga (60% del TAM andaluz). Doblar volumen de secuencias en Q3. El D2W no es el problema — no invertir en mejora de conversión, solo en volumen.",
    "PV": "Formalizar acuerdo con 1-2 partners locales clave en Bilbao (sector industrial + finanzas). Priorizar deals M/L desde inicio — el ARPU de segmento L en PV es el más alto del cluster outbound-responsive. ROI del partner = €967/cliente vs €729 outbound directo.",
    "VC": "Asignar SDR dedicado Valencia + Alicante. Arrancar con outbound a sectores cerámico, agroalimentario y logística — los 3 mayores del TAM valenciano. Medir CAC vs LTV en primeros 90 días antes de escalar.",
  };

  // ── Multi-channel deep-dive regions ──────────────────────────────────────────
  const MC_NAMES = ["Cataluña", "Comunidad de Madrid", "Andalucía", "Islas Baleares", "Principado de Asturias"];
  const mcRegions = MC_NAMES.map((name) => REGIONS.find((r) => r.ccaa === name)).filter((r): r is RegionPlaybook => !!r);

  const mcActionable: Record<string, string> = {
    "Cataluña": "Outbound D2W=87% — el canal más eficiente. Escalar SDR + mantener partners para M/L (ARPU 1,128€). No reducir inbound: aporta volumen base crítico.",
    "Comunidad de Madrid": "Partners dominan MRR (38%). Cada deal partner vale 2.7x un deal inbound. Invertir en onboarding de nuevos partners locales (Cobee, Wolters Kluwer) como prioridad.",
    "Andalucía": "Penetración baja (5.5%) con D2W sólido (75.8%). Problema de volumen, no de conversión. Doblar el top-of-funnel outbound aquí.",
    "Islas Baleares": "ARPU 1,085€ — el más alto del cluster (vs 729€ nacional). Foco en M/L. Proteger y escalar el canal partner actual.",
    "Principado de Asturias": "Mercado pequeño (TAM 3,240) con alta penetración relativa. Optimizar retención y upsell antes de buscar new logos.",
  };

  // ── Slide rendering helpers ───────────────────────────────────────────────────

  function ArchProvenanceTable({ channels, totalActive, totalMrr, weightedArpu, weightedD2w }: {
    channels: { label: string; active: number; mrr: number; pctMrr: number; arpu: number; d2w: number | null }[];
    totalActive: number; totalMrr: number; weightedArpu: number; weightedD2w: number | null;
  }) {
    return (
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-current/20 text-left">
            <th className="py-1.5 pr-2 font-semibold text-current/60">Canal</th>
            <th className="py-1.5 px-2 font-semibold text-current/60 text-right">Activos</th>
            <th className="py-1.5 px-2 font-semibold text-current/60 text-right">MRR</th>
            <th className="py-1.5 px-2 font-semibold text-current/60 text-right">% MRR</th>
            <th className="py-1.5 px-2 font-semibold text-current/60 text-right">ARPU</th>
            <th className="py-1.5 pl-2 font-semibold text-current/60 text-right">D2W</th>
          </tr>
        </thead>
        <tbody>
          {channels.map((c) => (
            <tr key={c.label} className="border-b border-current/10">
              <td className="py-1.5 pr-2 font-medium">{c.label}</td>
              <td className="py-1.5 px-2 text-right tabular-nums">{c.active.toLocaleString()}</td>
              <td className="py-1.5 px-2 text-right tabular-nums font-medium">{fmtEur(c.mrr)}</td>
              <td className="py-1.5 px-2 text-right tabular-nums">{c.pctMrr}%</td>
              <td className="py-1.5 px-2 text-right tabular-nums">{fmtEur(c.arpu)}</td>
              <td className="py-1.5 pl-2 text-right tabular-nums">{c.d2w !== null ? `${c.d2w}%` : "—"}</td>
            </tr>
          ))}
          <tr className="font-bold bg-white/50">
            <td className="py-1.5 pr-2">Totales</td>
            <td className="py-1.5 px-2 text-right tabular-nums">{totalActive.toLocaleString()}</td>
            <td className="py-1.5 px-2 text-right tabular-nums">{fmtEur(totalMrr)}</td>
            <td className="py-1.5 px-2 text-right tabular-nums">100%</td>
            <td className="py-1.5 px-2 text-right tabular-nums">{fmtEur(weightedArpu)}</td>
            <td className="py-1.5 pl-2 text-right tabular-nums">{weightedD2w !== null ? `${weightedD2w}%` : "—"}</td>
          </tr>
        </tbody>
      </table>
    );
  }

  // ── Derived values for InsightBox texts ──────────────────────────────────────

  // Slide 1
  const uncoveredPct = Math.round(100 - NATIONAL.penetration);

  // Slide 2: partner channels combined vs inbound ARPU
  const _partnerChs = nationalChannels.filter((c) => ["Channel Partners", "Santander", "Telefónica"].includes(c.label));
  const _partnerActive = _partnerChs.reduce((s, c) => s + c.active, 0);
  const _partnerMrr = _partnerChs.reduce((s, c) => s + c.mrr, 0);
  const slide2PartnerArpu = _partnerActive > 0 ? Math.round(_partnerMrr / _partnerActive) : 0;
  const slide2PartnerMrrPct = _partnerChs.reduce((s, c) => s + c.mrrShare, 0);
  const slide2InboundArpu = nationalChannels.find((c) => c.label === "Inbound")?.arpu ?? 0;
  const slide2PartnerVsInbound = slide2InboundArpu > 0 ? Math.round((slide2PartnerArpu / slide2InboundArpu) * 10) / 10 : 0;

  // Slide 3: classify untapped top-10 by problem type
  const slide3VolProblems = untappedTop10.filter((r) => r.penetration < 6).map((r) => r.ccaa);
  const slide3ConvProblems = untappedTop10.filter((r) => r.penetration >= 6 && r.d2w < 75).map((r) => r.ccaa);

  // Slide 4: top 2 regions by absolute TAM
  const slide4Top2 = [...REGIONS].sort((a, b) => b.tam - a.tam).slice(0, 2);

  // Slide 6: partner ARPU vs direct ARPU within partner-led archetype
  const _plPartnerChs = partnerLedData.channels.filter((c) => ["Channel Partners", "Santander", "Telefónica"].includes(c.label));
  const _plPartnerActive = _plPartnerChs.reduce((s, c) => s + c.active, 0);
  const _plPartnerMrr   = _plPartnerChs.reduce((s, c) => s + c.mrr, 0);
  const _plDirectChs = partnerLedData.channels.filter((c) => ["Inbound", "Outbound"].includes(c.label));
  const _plDirectActive = _plDirectChs.reduce((s, c) => s + c.active, 0);
  const _plDirectMrr   = _plDirectChs.reduce((s, c) => s + c.mrr, 0);
  const slide6PartnerArpu = _plPartnerActive > 0 ? Math.round(_plPartnerMrr / _plPartnerActive) : 0;
  const slide6DirectArpu  = _plDirectActive  > 0 ? Math.round(_plDirectMrr  / _plDirectActive)  : 0;
  const slide6Ratio = slide6DirectArpu > 0 ? Math.round((slide6PartnerArpu / slide6DirectArpu) * 10) / 10 : 0;
  const slide6LowPen = [...partnerLedData.regions].sort((a, b) => a.penetration - b.penetration).slice(0, 2);

  // Slide 7: outbound archetype D2W and top regions
  const slide7ObD2w = outboundData.weightedD2w ?? NATIONAL.d2w;
  const slide7TopRegions = outboundData.regions.slice(0, 2);

  // Slide 8: multi-channel MRR share of national
  const slide8McShare = NATIONAL.mrr > 0 ? Math.round((multiChannelData.totalMrr / NATIONAL.mrr) * 100) : 0;

  // Last slide: top-5 opp untapped share of total untapped TAM
  const _totalUntapped = REGIONS.reduce((s, r) => s + Math.round(r.tam * (1 - r.penetration / 100)), 0);
  const _top5Untapped  = top5Opp.reduce((s, r) => s + r.untapped, 0);
  const slideLastTop5Share = _totalUntapped > 0 ? Math.round((_top5Untapped / _totalUntapped) * 100) : 0;

  // ── Slides ────────────────────────────────────────────────────────────────────
  const slides: React.ReactNode[] = [

    // ── Slide 1 — Portada aspiracional ────────────────────────────────────────
    <div key="s1" className="flex flex-col h-full p-8 gap-6 bg-white">
      <div className="flex-1 flex flex-col justify-center gap-6">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-gray-400 mb-2">Factorial HR · España</div>
          <h1 className="text-4xl font-bold text-gray-900 leading-tight">Estrategia de Crecimiento España</h1>
          <p className="text-lg text-gray-500 mt-2">El mercado está validado. El grueso del crecimiento está por delante.</p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <SlideKpiCard label="Clientes Activos" value={NATIONAL.active.toLocaleString()} />
          <SlideKpiCard label="TAM Disponible" value={(NATIONAL.tam - NATIONAL.active).toLocaleString()} />
          <SlideKpiCard label="Penetración Actual" value={`${NATIONAL.penetration}%`} />
        </div>
        <p className="text-sm text-gray-600">Solo 1 de cada 14 empresas del TAM es cliente Factorial hoy.</p>
      </div>
      <InsightBox text={`Con el ${uncoveredPct}% del mercado sin cubrir, la pregunta no es si hay oportunidad — es en qué orden atacarla.`} />
    </div>,

    // ── Slide 2 — Radiografía del Pipeline ────────────────────────────────────
    <div key="s2" className="flex flex-col h-full p-8 gap-4 bg-white">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-0.5">Radiografía del Pipeline: Origen del Negocio</h2>
        <p className="text-xs text-gray-400">Cada desglose suma 100%</p>
      </div>
      <div className="grid grid-cols-3 gap-4 flex-1 min-h-0">
        {/* Col 1: Por Canal */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1.5 font-semibold">Por Canal</p>
          {/* Stacked MRR bar */}
          <div className="h-5 rounded-full flex overflow-hidden w-full mb-2">
            {nationalChannels.map((c, ci) => {
              const channelColors = ["bg-violet-400", "bg-blue-400", "bg-sky-400", "bg-cyan-400", "bg-teal-400", "bg-slate-300"];
              return (
                <div
                  key={c.label}
                  className={channelColors[ci % channelColors.length]}
                  style={{ width: `${c.mrrShare}%` }}
                  title={`${c.label}: ${c.mrrShare}%`}
                />
              );
            })}
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="py-1 pr-2 font-semibold text-gray-400">Canal</th>
                <th className="py-1 px-1 font-semibold text-gray-400 text-right">Act.</th>
                <th className="py-1 px-1 font-semibold text-gray-400 text-right">MRR</th>
                <th className="py-1 pl-1 font-semibold text-gray-400">%</th>
              </tr>
            </thead>
            <tbody>
              {nationalChannels.map((c, ci) => {
                const channelColors = ["bg-violet-400", "bg-blue-400", "bg-sky-400", "bg-cyan-400", "bg-teal-400", "bg-slate-300"];
                return (
                  <tr key={c.label} className="border-b border-gray-100">
                    <td className="py-1 pr-2 truncate max-w-[80px]">{c.label}</td>
                    <td className="py-1 px-1 text-right tabular-nums text-gray-500">{c.active.toLocaleString()}</td>
                    <td className="py-1 px-1 text-right tabular-nums font-medium">{fmtEur(c.mrr)}</td>
                    <td className="py-1 pl-1 w-24">
                      <div className="flex items-center gap-1">
                        <div className={cn("h-1.5 rounded-full w-full max-w-[80px]", channelColors[ci % channelColors.length])} style={{ width: `${c.mrrShare}%`, maxWidth: "80px" }} />
                        <span className="text-[10px] tabular-nums text-gray-400 w-6 text-right">{c.mrrShare}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Col 2: Por Industria */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1.5 font-semibold">Por Industria (top 5)</p>
          {/* Stacked MRR bar — green palette */}
          <div className="h-5 rounded-full flex overflow-hidden w-full mb-2">
            {nationalIndustries.map((ind, ii) => {
              const indColors = ["bg-emerald-500", "bg-green-400", "bg-teal-400", "bg-lime-400", "bg-green-300", "bg-emerald-200"];
              return (
                <div
                  key={ind.label}
                  className={indColors[ii % indColors.length]}
                  style={{ width: `${ind.pct}%` }}
                  title={`${ind.label}: ${ind.pct}%`}
                />
              );
            })}
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="py-1 pr-2 font-semibold text-gray-400">Industria</th>
                <th className="py-1 px-1 font-semibold text-gray-400 text-right">MRR</th>
                <th className="py-1 pl-1 font-semibold text-gray-400">%</th>
              </tr>
            </thead>
            <tbody>
              {nationalIndustries.map((ind, ii) => {
                const indColors = ["bg-emerald-500", "bg-green-400", "bg-teal-400", "bg-lime-400", "bg-green-300", "bg-emerald-200"];
                return (
                  <tr key={ind.label} className="border-b border-gray-100">
                    <td className="py-1 pr-2 truncate max-w-[90px]">{ind.label}</td>
                    <td className="py-1 px-1 text-right tabular-nums font-medium">{fmtEur(ind.mrr)}</td>
                    <td className="py-1 pl-1 w-24">
                      <div className="flex items-center gap-1">
                        <div className={cn("h-1.5 rounded-full", indColors[ii % indColors.length])} style={{ width: `${ind.pct}%`, maxWidth: "80px" }} />
                        <span className="text-[10px] tabular-nums text-gray-400 w-6 text-right">{ind.pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Col 3: Por Tamaño */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1.5 font-semibold">Por Tamaño</p>
          {/* Stacked MRR bar — amber palette */}
          <div className="h-5 rounded-full flex overflow-hidden w-full mb-2">
            {nationalSizes.map((s, si) => {
              const sizeColors = ["bg-amber-300", "bg-amber-500", "bg-orange-400", "bg-orange-600"];
              return (
                <div
                  key={s.label}
                  className={sizeColors[si % sizeColors.length]}
                  style={{ width: `${s.mrrShare}%` }}
                  title={`${s.label}: ${s.mrrShare}%`}
                />
              );
            })}
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="py-1 pr-2 font-semibold text-gray-400">Segmento</th>
                <th className="py-1 px-1 font-semibold text-gray-400 text-right">ARPU</th>
                <th className="py-1 pl-1 font-semibold text-gray-400">% MRR</th>
              </tr>
            </thead>
            <tbody>
              {nationalSizes.map((s, si) => {
                const sizeColors = ["bg-amber-300", "bg-amber-500", "bg-orange-400", "bg-orange-600"];
                return (
                  <tr key={s.label} className="border-b border-gray-100">
                    <td className="py-1 pr-2">{s.label}</td>
                    <td className="py-1 px-1 text-right tabular-nums font-medium">{fmtEur(s.arpu)}</td>
                    <td className="py-1 pl-1 w-24">
                      <div className="flex items-center gap-1">
                        <div className={cn("h-1.5 rounded-full", sizeColors[si % sizeColors.length])} style={{ width: `${s.mrrShare}%`, maxWidth: "80px" }} />
                        <span className="text-[10px] tabular-nums text-gray-400 w-6 text-right">{s.mrrShare}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <InsightBox text={`Los canales partner (Santander, Telefónica, Canal Indirecto) generan el mayor ARPU (${fmtEur(slide2PartnerArpu)}) con solo el ${slide2PartnerMrrPct}% del MRR total${slide2PartnerVsInbound > 1 ? ` — ${slide2PartnerVsInbound}x el ARPU de Inbound` : ""}. La palanca es redirigir deals M/L hacia canal partner.`} />
    </div>,

    // ── Slide 3 — El Dilema de la Oportunidad ─────────────────────────────────
    <div key="s3" className="flex flex-col h-full p-8 gap-4 bg-white">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-0.5">El Dilema de la Oportunidad: Volumen vs. Conversión</h2>
        <p className="text-xs text-gray-400">Cada región enfrenta un problema distinto — penetración = clientes activos / TAM total</p>
      </div>
      <div className="flex-1 min-h-0">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b text-left">
              <th className="py-2 px-2 font-semibold text-gray-500">Región</th>
              <th className="py-2 px-2 font-semibold text-gray-500 text-right">TAM total</th>
              <th className="py-2 px-2 font-semibold text-gray-500 text-right">Penetración</th>
              <th className="py-2 px-2 font-semibold text-gray-500 text-right">Sin cubrir</th>
              <th className="py-2 px-2 font-semibold text-gray-500 text-right">D2W</th>
              <th className="py-2 px-2 font-semibold text-gray-500">Diagnóstico</th>
            </tr>
          </thead>
          <tbody>
            {untappedTop10.map((r) => {
              const diag = r.penetration < 6
                ? { label: "Problema de volumen", cls: "bg-red-100 text-red-700" }
                : r.d2w < 75
                ? { label: "Problema de conversión", cls: "bg-amber-100 text-amber-700" }
                : { label: "En ruta", cls: "bg-emerald-100 text-emerald-700" };
              return (
                <tr key={r.code} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-1.5 px-2 font-medium">{r.ccaa}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{r.tam.toLocaleString()}</td>
                  <td className={cn("py-1.5 px-2 text-right tabular-nums font-semibold", penColorClass(r.penetration))}>
                    {r.penetration}%
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums font-semibold">{r.untapped.toLocaleString()}</td>
                  <td className={cn("py-1.5 px-2 text-right tabular-nums font-semibold",
                    r.d2w >= 80 ? "text-emerald-700" : r.d2w >= 70 ? "text-amber-700" : "text-red-600",
                  )}>
                    {r.d2w}%
                  </td>
                  <td className="py-1.5 px-2">
                    <span className={cn("px-2 py-0.5 rounded text-[10px] font-semibold", diag.cls)}>{diag.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <InsightBox text={[
        slide3VolProblems.length > 0 && `${slide3VolProblems.slice(0, 2).join(" y ")} ${slide3VolProblems.length > 1 ? "son" : "es"} problema${slide3VolProblems.length > 1 ? "s" : ""} de escala: TAM enorme, penetración por debajo del 6%.`,
        slide3ConvProblems.length > 0 && `${slide3ConvProblems[0]}${slide3ConvProblems[1] ? ` y ${slide3ConvProblems[1]}` : ""} ${slide3ConvProblems.length > 1 ? "enfrentan" : "enfrenta"} el problema opuesto: el pipeline llega, pero la conversión es baja.`,
        "Estrategia diferente para cada grupo.",
      ].filter(Boolean).join(" ")} />
    </div>,

    // ── Slide 4 — Concentración Regional ──────────────────────────────────────
    (() => {
      const byTam = [...REGIONS].sort((a, b) => b.tam - a.tam).slice(0, 12);
      const maxTam = byTam[0].tam;
      const top5TamShare = byTam.slice(0, 5).reduce((s, r) => s + r.tam, 0);
      const top5TamPct = Math.round((top5TamShare / NATIONAL.tam) * 100);
      return (
        <div key="s4" className="flex flex-col h-full p-8 gap-4 bg-white">
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-0.5">Dónde Está el Mercado: TAM por Región y Penetración</h2>
            <p className="text-xs text-gray-400">Cada barra = empresas del TAM regional. Parte coloreada = clientes activos nuestros. Las 5 primeras CCAA concentran el {top5TamPct}% del TAM total.</p>
          </div>
          <div className="flex-1 min-h-0 flex flex-col justify-center gap-0">
            {byTam.map((r, i) => {
              const tamBarPct = Math.round((r.tam / maxTam) * 100);
              const penetrationPct = Math.round((r.active / r.tam) * 100 * 10) / 10;
              const fillPct = Math.round((r.active / r.tam) * 100);
              const barColor = r.archetype === "partner-led"
                ? "bg-violet-500" : r.archetype === "outbound-responsive"
                ? "bg-sky-400" : "bg-emerald-500";
              const penColor = penetrationPct >= 8 ? "text-emerald-700" : penetrationPct >= 5 ? "text-amber-600" : "text-red-600";
              const isAboveFold = i < 5;
              return (
                <div key={r.code}>
                  {i === 5 && (
                    <div className="border-t border-dashed border-gray-200 my-2" />
                  )}
                  <div className={cn("flex items-center gap-3 py-1 rounded-md px-1", isAboveFold ? "" : "opacity-80")}>
                    {/* Region name */}
                    <div className="w-44 shrink-0">
                      <span className={cn("text-xs font-semibold truncate block", isAboveFold ? "text-gray-800" : "text-gray-500")}>{r.ccaa}</span>
                    </div>
                    {/* Stacked bar */}
                    <div className="flex-1 flex items-center gap-1.5">
                      <div
                        className="relative h-5 rounded overflow-hidden bg-gray-100"
                        style={{ width: `${tamBarPct}%` }}
                      >
                        <div className={cn("h-full transition-all", barColor)} style={{ width: `${fillPct}%` }} />
                        {fillPct > 12 && (
                          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-white text-[9px] font-semibold whitespace-nowrap">
                            {r.active.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Stats */}
                    <div className="w-40 shrink-0 flex items-center justify-end gap-2 text-xs tabular-nums">
                      <span className="text-gray-400">{(r.tam / 1000).toFixed(1)}K emp.</span>
                      <span className={cn("font-bold w-10 text-right", penColor)}>{penetrationPct}%</span>
                    </div>
                    {i === 4 && (
                      <span className="shrink-0 text-[9px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                        {top5TamPct}% TAM
                      </span>
                    )}
                    {i !== 4 && <div className="w-16 shrink-0" />}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-5 text-[10px] text-gray-400 pt-1">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-500 inline-block" /> Partner-Led</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-sky-400 inline-block" /> Outbound-Responsive</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Multi-Channel</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-200 inline-block" /> Sin cubrir</span>
          </div>
          <InsightBox text={`Las regiones con barra larga y poco color son la mayor oportunidad: mercado enorme, apenas tocado. ${slide4Top2[0]?.ccaa ?? ""} (${(slide4Top2[0]?.tam ?? 0).toLocaleString()} TAM, ${slide4Top2[0]?.penetration ?? 0}% pen.) y ${slide4Top2[1]?.ccaa ?? ""} (${(slide4Top2[1]?.tam ?? 0).toLocaleString()}, ${slide4Top2[1]?.penetration ?? 0}%) lideran la lista de trabajo pendiente.`} />
        </div>
      );
    })(),

    // ── Slide 5 — Los 3 Arquetipos ─────────────────────────────────────────────
    <div key="s5" className="flex flex-col h-full p-8 gap-4 bg-white">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-0.5">Tres Modelos de Mercado, Tres Playbooks Distintos</h2>
      </div>
      <div className="grid grid-cols-3 gap-4 flex-1 min-h-0">
        {archetypeAgg.map(({ arch, regions, mrr, active, count, avgArpu, avgD2w }) => {
          const kpiDef = arch === "partner-led"
            ? "Canal partner > 35% del MRR"
            : arch === "outbound-responsive"
            ? "D2W outbound > media nacional + baja penetración partner"
            : "Ningún canal supera el 40% del MRR — distribución equilibrada";
          const tintBg = arch === "partner-led"
            ? "bg-violet-50 border-violet-200"
            : arch === "outbound-responsive"
            ? "bg-sky-50 border-sky-200"
            : "bg-emerald-50 border-emerald-200";
          const tintText = arch === "partner-led"
            ? "text-violet-900"
            : arch === "outbound-responsive"
            ? "text-sky-900"
            : "text-emerald-900";
          return (
            <div key={arch} className={cn("rounded-xl border p-4 flex flex-col gap-3", tintBg, tintText)}>
              <div>
                <span className={cn("text-[10px] px-2 py-0.5 rounded border font-semibold", archetypeColor(arch))}>
                  {archetypeLabel(arch)}
                </span>
                <span className="text-[10px] ml-2 opacity-60">{count} regiones</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] opacity-60 uppercase tracking-widest">MRR total</div>
                  <div className="text-lg font-bold tabular-nums">{fmtEur(mrr)}</div>
                </div>
                <div>
                  <div className="text-[10px] opacity-60 uppercase tracking-widest">Activos</div>
                  <div className="text-lg font-bold tabular-nums">{active.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[10px] opacity-60 uppercase tracking-widest">Avg ARPU</div>
                  <div className="text-base font-semibold tabular-nums">{fmtEur(avgArpu)}</div>
                </div>
                <div>
                  <div className="text-[10px] opacity-60 uppercase tracking-widest">Avg D2W</div>
                  <div className="text-base font-semibold tabular-nums">{avgD2w}%</div>
                </div>
              </div>
              <div className="text-[10px] italic opacity-70 leading-snug">{archetypeTagline(arch)}</div>
              <div className="text-[10px] font-semibold border-t border-current/20 pt-2 leading-snug">KPI definitorio: {kpiDef}</div>
              <div className="text-[10px] opacity-50 leading-snug">{regions.map((r) => r.ccaa).join(", ")}</div>
            </div>
          );
        })}
      </div>
      <InsightBox text="No hay una estrategia única. El arquetipo define el canal prioritario, el perfil de empresa objetivo y el perfil de AE necesario en esa región." />
    </div>,

    // ── Slide 6 — Deep Dive: Partner-Led ──────────────────────────────────────
    <div key="s6" className="flex flex-col h-full p-8 gap-4 bg-white">
      <div>
        <h2 className="text-xl font-bold text-violet-900 mb-0.5">Arquetipo 1: Partner-Led · {partnerLedData.regions.length} Regiones</h2>
        <p className="text-xs text-violet-600/70">Canal partner domina (&gt;35% MRR) — el canal directo es secundario</p>
      </div>
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left 40% — region list */}
        <div className="w-[38%] shrink-0">
          <p className="text-[10px] uppercase tracking-widest text-violet-600/70 mb-1.5 font-semibold">Regiones</p>
          <table className="w-full text-xs text-violet-900">
            <thead>
              <tr className="border-b border-violet-200 text-left">
                <th className="py-1.5 pr-2 font-semibold text-violet-600/70">CCAA</th>
                <th className="py-1.5 px-2 font-semibold text-violet-600/70 text-right">MRR</th>
                <th className="py-1.5 px-2 font-semibold text-violet-600/70 text-right">Pen.</th>
                <th className="py-1.5 pl-2 font-semibold text-violet-600/70">Top partner</th>
              </tr>
            </thead>
            <tbody>
              {partnerLedData.regions.map((r) => (
                <tr key={r.code} className="border-b border-violet-100">
                  <td className="py-1.5 pr-2 font-medium">{r.ccaa}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{fmtEur(r.mrr)}</td>
                  <td className={cn("py-1.5 px-2 text-right tabular-nums font-semibold", penColorClass(r.penetration))}>
                    {r.penetration}%
                  </td>
                  <td className="py-1.5 pl-2 text-[10px] opacity-70">{partnerLedData.dominantPartner(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Right 60% — provenance table */}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-violet-600/70 mb-1.5 font-semibold">Canales agregados (todas las regiones partner-led)</p>
          <div className="text-violet-900">
            <ArchProvenanceTable
              channels={partnerLedData.channels}
              totalActive={partnerLedData.totalActive}
              totalMrr={partnerLedData.totalMrr}
              weightedArpu={partnerLedData.weightedArpu}
              weightedD2w={partnerLedData.weightedD2w}
            />
          </div>
        </div>
      </div>
      <InsightBox actionable text={`El canal partner genera ${slide6Ratio > 1 ? `${slide6Ratio}x el ARPU del canal directo` : `un ARPU de ${fmtEur(slide6PartnerArpu)}`} en estas regiones.${slide6LowPen.length >= 2 ? ` Prioridad inmediata: activar 1-2 partners locales en ${slide6LowPen[0].ccaa} (penetración ${slide6LowPen[0].penetration}%) y ${slide6LowPen[1].ccaa} (${slide6LowPen[1].penetration}%).` : ""} KPI de seguimiento: % MRR partner por región — target >40% en 6 meses.`} />
    </div>,

    // ── Slide 7 — Deep Dive: Outbound-Responsive ──────────────────────────────
    <div key="s7" className="flex flex-col h-full p-8 gap-4 bg-white">
      <div>
        <h2 className="text-xl font-bold text-sky-900 mb-0.5">Arquetipo 2: Outbound-Responsive · {outboundData.regions.length} Regiones</h2>
        <p className="text-xs text-sky-600/70">SDR outbound primero — estos mercados convierten bien cuando se los busca proactivamente</p>
      </div>
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left 40% */}
        <div className="w-[38%] shrink-0">
          <p className="text-[10px] uppercase tracking-widest text-sky-600/70 mb-1.5 font-semibold">Regiones</p>
          <table className="w-full text-xs text-sky-900">
            <thead>
              <tr className="border-b border-sky-200 text-left">
                <th className="py-1.5 pr-2 font-semibold text-sky-600/70">CCAA</th>
                <th className="py-1.5 px-2 font-semibold text-sky-600/70 text-right">MRR</th>
                <th className="py-1.5 px-2 font-semibold text-sky-600/70 text-right">D2W OB</th>
                <th className="py-1.5 pl-2 font-semibold text-sky-600/70 text-right">Pen.</th>
              </tr>
            </thead>
            <tbody>
              {outboundData.regions.map((r) => (
                <tr key={r.code} className="border-b border-sky-100">
                  <td className="py-1.5 pr-2 font-medium">{r.ccaa}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{fmtEur(r.mrr)}</td>
                  <td className={cn("py-1.5 px-2 text-right tabular-nums font-semibold",
                    (() => { const d = outboundData.outboundD2w(r); return d !== null && d >= NATIONAL.d2w ? "text-emerald-700" : "text-amber-700"; })(),
                  )}>
                    {(() => { const d = outboundData.outboundD2w(r); return d !== null ? `${d}%` : "—"; })()}
                  </td>
                  <td className={cn("py-1.5 pl-2 text-right tabular-nums", penColorClass(r.penetration))}>
                    {r.penetration}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Right 60% */}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-sky-600/70 mb-1.5 font-semibold">Canales agregados (todas las regiones outbound-responsive)</p>
          <div className="text-sky-900">
            <ArchProvenanceTable
              channels={outboundData.channels}
              totalActive={outboundData.totalActive}
              totalMrr={outboundData.totalMrr}
              weightedArpu={outboundData.weightedArpu}
              weightedD2w={outboundData.weightedD2w}
            />
          </div>
        </div>
      </div>
      <InsightBox actionable text={`Los AEs cierran a un ritmo D2W del ${slide7ObD2w}% en estas regiones${slide7ObD2w >= NATIONAL.d2w ? " — por encima de la media nacional" : ""}. Concentrar la capacidad SDR/AE en ${slide7TopRegions[0]?.ccaa ?? "las regiones principales"}${slide7TopRegions[1] ? ` y ${slide7TopRegions[1].ccaa}` : ""} antes de diversificar. Expandir outbound aquí da más retorno por euro que abrir nuevas regiones.`} />
    </div>,

    // ── Slide 8 — Multi-Channel Core: Introducción ────────────────────────────
    <div key="s8" className="flex flex-col h-full p-8 gap-4 bg-white">
      <div>
        <h2 className="text-xl font-bold text-emerald-900 mb-0.5">Arquetipo 3: Multi-Channel Core · El Núcleo del Crecimiento</h2>
        <p className="text-xs text-emerald-600/70">{multiChannelData.regions.length} regiones · {fmtEur(multiChannelData.totalMrr)} MRR · {slide8McShare}% del negocio total</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <SlideKpiCard label="MRR Total" value={fmtEur(multiChannelData.totalMrr)} />
        <SlideKpiCard label="Clientes Activos" value={multiChannelData.totalActive.toLocaleString()} />
        <SlideKpiCard label="Avg ARPU" value={fmtEur(multiChannelData.avgArpu)} />
      </div>
      <div className="flex-1 min-h-0">
        <table className="w-full text-xs text-emerald-900">
          <thead>
            <tr className="border-b border-emerald-200 text-left bg-emerald-100/50">
              <th className="py-2 px-2 font-semibold text-emerald-600/70">Región</th>
              <th className="py-2 px-2 font-semibold text-emerald-600/70 text-right">MRR</th>
              <th className="py-2 px-2 font-semibold text-emerald-600/70 text-right">% MRR España</th>
              <th className="py-2 px-2 font-semibold text-emerald-600/70 text-right">ARPU</th>
              <th className="py-2 px-2 font-semibold text-emerald-600/70 text-right">D2W</th>
              <th className="py-2 px-2 font-semibold text-emerald-600/70">Canal top</th>
            </tr>
          </thead>
          <tbody>
            {multiChannelData.regions.map((r) => {
              const top = multiChannelData.topChannel(r);
              return (
                <tr key={r.code} className="border-b border-emerald-100 hover:bg-emerald-100/30">
                  <td className="py-1.5 px-2 font-medium">{r.ccaa}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums font-semibold">{fmtEur(r.mrr)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{Math.round((r.mrr / NATIONAL.mrr) * 100 * 10) / 10}%</td>
                  <td className={cn("py-1.5 px-2 text-right tabular-nums",
                    r.arpu >= NATIONAL.arpu * 1.1 ? "text-emerald-700 font-semibold" : ""
                  )}>
                    {fmtEur(r.arpu)}
                  </td>
                  <td className={cn("py-1.5 px-2 text-right tabular-nums font-semibold",
                    r.d2w >= NATIONAL.d2w ? "text-emerald-700" : "text-amber-700",
                  )}>
                    {r.d2w}%
                  </td>
                  <td className="py-1.5 px-2 text-[10px]">{top.label} <span className="opacity-60">({top.mrrShare}%)</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <InsightBox actionable text="En estas regiones no existe un canal dominante — los tres coexisten con rendimientos distintos. La estrategia no es elegir: es orquestar la secuencia. Inbound para volumen → Outbound para conversión rápida → Partners para deals M/L de alto ARPU." />
    </div>,

    // ── Slides 9-13 — Zoom por región Multi-Channel ────────────────────────────
    ...mcRegions.map((r) => {
      const actionable = mcActionable[r.ccaa] ?? "";
      // Top 4 provenances by mrrShare for matrix columns
      const top4Provs = [...r.provenances].sort((a, b) => b.mrrShare - a.mrrShare).slice(0, 4);
      return (
        <div key={`mc-${r.code}`} className="flex flex-col h-full p-8 gap-4 bg-white">
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-0.5">{r.ccaa} — Análisis Multichannel</h2>
            <p className="text-xs text-gray-400">{r.active.toLocaleString()} clientes · {fmtEur(r.mrr)} MRR · {r.penetration}% penetración</p>
          </div>
          {/* KPI pills */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-center">
              <div className="text-[10px] text-gray-400 uppercase tracking-widest">ARPU</div>
              <div className={cn("text-base font-bold tabular-nums", kpiColor(r.arpu, NATIONAL.arpu, true))}>
                {fmtEur(r.arpu)}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-center">
              <div className="text-[10px] text-gray-400 uppercase tracking-widest">D2W</div>
              <div className={cn("text-base font-bold tabular-nums", kpiColor(r.d2w, NATIONAL.d2w, true))}>
                {r.d2w}%
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-center">
              <div className="text-[10px] text-gray-400 uppercase tracking-widest">Pen.</div>
              <div className={cn("text-base font-bold tabular-nums", penColorClass(r.penetration))}>
                {r.penetration}%
              </div>
            </div>
          </div>
          {/* Two-panel layout */}
          <div className="flex gap-4 flex-1 min-h-0">
            {/* Left 40%: sizes table */}
            <div className="w-[40%] shrink-0 flex flex-col gap-2">
              <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Por tamaño</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="py-1 pr-1 font-semibold text-gray-400">Seg.</th>
                    <th className="py-1 px-1 font-semibold text-gray-400 text-right">Act.</th>
                    <th className="py-1 px-1 font-semibold text-gray-400 text-right">MRR</th>
                    <th className="py-1 px-1 font-semibold text-gray-400 text-right">ARPU</th>
                    <th className="py-1 pl-1 font-semibold text-gray-400 text-right">D2W</th>
                  </tr>
                </thead>
                <tbody>
                  {r.sizes.map((s) => (
                    <tr key={s.label} className="border-b border-gray-100">
                      <td className="py-1 pr-1">{s.label}</td>
                      <td className="py-1 px-1 text-right tabular-nums">{s.active.toLocaleString()}</td>
                      <td className="py-1 px-1 text-right tabular-nums font-medium">{fmtEur(s.mrr)}</td>
                      <td className="py-1 px-1 text-right tabular-nums">{fmtEur(s.arpu)}</td>
                      <td className={cn("py-1 pl-1 text-right tabular-nums",
                        s.d2w === null ? "text-gray-400" : s.d2w >= 80 ? "text-emerald-700" : s.d2w >= 65 ? "text-amber-700" : "text-red-600",
                      )}>
                        {s.d2w !== null ? `${s.d2w}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Right 60%: Canal performance for this region */}
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Rendimiento por Canal</p>
              <div className="flex flex-col gap-1.5">
                {top4Provs.map((p) => {
                  const mrrBarPct = Math.round((p.mrr / top4Provs[0].mrr) * 100);
                  const d2wColor = p.d2w === null
                    ? "text-gray-400"
                    : p.d2w >= 80 ? "text-emerald-700"
                    : p.d2w >= 70 ? "text-amber-600"
                    : "text-red-600";
                  const barColor = p.label === "Channel Partners"
                    ? "bg-violet-400"
                    : p.label === "Outbound" ? "bg-sky-400"
                    : p.label === "Inbound" ? "bg-blue-400"
                    : "bg-gray-400";
                  return (
                    <div key={p.label} className="bg-gray-50 rounded-lg p-2.5 flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-700">{p.label}</span>
                        <div className="flex items-center gap-3 text-xs tabular-nums">
                          <span className="text-gray-500">ARPU <span className="font-semibold text-gray-800">{fmtEur(p.arpu)}</span></span>
                          <span className="text-gray-500">D2W <span className={cn("font-semibold", d2wColor)}>{p.d2w !== null ? `${p.d2w}%` : "—"}</span></span>
                          <span className="text-gray-400 font-medium">{p.mrrShare}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full", barColor)} style={{ width: `${mrrBarPct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[9px] text-gray-400 italic">MRR share · ARPU · D2W por canal — datos reales de esta región</p>
            </div>
          </div>
          <InsightBox actionable={!!actionable} text={actionable || `Analizar oportunidades de crecimiento en ${r.ccaa}.`} />
        </div>
      );
    }),

    // ── Slide 14 — Priorización Final ─────────────────────────────────────────
    <div key="s14" className="flex flex-col h-full p-8 gap-3 bg-white">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-0.5">Top 5 Oportunidades Ganadoras</h2>
        <p className="text-xs text-gray-400">Score = TAM sin cubrir × (D2W/100) — cruce de mercado disponible × eficiencia histórica</p>
      </div>
      <div className="flex-1 flex flex-col gap-2 min-h-0">
        {top5Opp.map((r, i) => (
          <div key={r.code} className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 flex gap-3 items-stretch">
            {/* Rank */}
            <div className="flex flex-col items-center justify-center w-8 shrink-0">
              <span className="text-2xl font-black text-gray-200 tabular-nums leading-none">{i + 1}</span>
            </div>
            {/* Divider */}
            <div className="w-px bg-gray-200 shrink-0" />
            {/* Content */}
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-900">{r.ccaa}</span>
                <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-semibold border", archetypeColor(r.archetype))}>
                  {archetypeLabel(r.archetype)}
                </span>
              </div>
              <div className="flex gap-3 text-[10px]">
                <span className="text-gray-400">Sin cubrir <span className="font-semibold text-gray-700 tabular-nums">{r.untapped.toLocaleString()}</span></span>
                <span className="text-gray-300">·</span>
                <span className="text-gray-400">D2W <span className={cn("font-semibold tabular-nums", r.d2w >= 80 ? "text-emerald-700" : "text-amber-700")}>{r.d2w}%</span></span>
                <span className="text-gray-300">·</span>
                <span className="text-gray-400">Pen. <span className={cn("font-semibold tabular-nums", penColorClass(r.penetration))}>{r.penetration}%</span></span>
              </div>
              <p className="text-[10px] text-gray-600 leading-relaxed">
                <span className="font-semibold text-gray-800">Por qué: </span>{oppWhy[r.code] ?? `Penetración ${r.penetration}% con ${r.untapped.toLocaleString()} empresas sin cubrir.`}
              </p>
              <p className="text-[10px] text-gray-600 leading-relaxed">
                <span className="font-semibold text-red-600">Acción: </span>{oppAction[r.code] ?? r.strategy.leadChannel}
              </p>
            </div>
            {/* Score pill */}
            <div className="shrink-0 flex flex-col items-end justify-center gap-0.5 pl-2">
              <span className="text-[9px] uppercase tracking-wider text-gray-400 font-medium">Score</span>
              <span className="text-base font-black tabular-nums text-red-600">{r.score.toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
      <InsightBox text={`Estas 5 regiones concentran el ${slideLastTop5Share}% del TAM nacional sin penetrar. La acción es asimétrica: concentrar recursos aquí genera el máximo crecimiento potencial. Cualquier otra región es optimización marginal.`} />
    </div>,
  ];

  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, [REGIONS]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, [REGIONS]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") setSlide((s) => Math.min(TOTAL - 1, s + 1));
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") setSlide((s) => Math.max(0, s - 1));
      if (e.key === "f" || e.key === "F") toggleFullscreen();
      if (e.key === "Escape" && document.fullscreenElement) document.exitFullscreen();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [toggleFullscreen]);

  return (
    <div ref={containerRef} className="flex flex-col h-full bg-white">
      <div className="min-h-0 flex-1 overflow-hidden bg-white border border-gray-100 rounded-lg">
        {slides[slide]}
      </div>
      <SlideNav
        slide={slide}
        total={TOTAL}
        onPrev={() => setSlide((s) => Math.max(0, s - 1))}
        onNext={() => setSlide((s) => Math.min(TOTAL - 1, s + 1))}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
      />
    </div>
  );
}

type NavView = "summary" | "slides" | "bestpractices";

// ── Main page ────────────────────────────────────────────────────────────────

export function PlaybookPage() {
  const { email } = useAuth();
  const navigate = useNavigate();
  const country = window.localStorage.getItem("pre-event-country") ?? "";
  const hasAccess = !!email && email.endsWith("@factorial.co");

  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [navView, setNavView] = useState<NavView>("summary");
  const [searchTerm, setSearchTerm] = useState("");
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const hubspotFileRef = useRef<HTMLInputElement>(null);
  const tamFileRef = useRef<HTMLInputElement>(null);

  const { data, source, status, rowCount, error, refresh, importHubspotCsv, importTamCsv } =
    usePlaybookLiveData();

  if (country !== "es") {
    navigate("/");
    return null;
  }
  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center text-muted-foreground">
          <p className="text-sm font-medium">Acceso restringido</p>
          <p className="text-xs mt-1">Tu email no tiene acceso a esta sección.</p>
        </div>
      </div>
    );
  }

  const REGIONS = data.regions;
  const NATIONAL = data.national;

  const selectedRegion = selectedCode ? REGIONS.find((r) => r.code === selectedCode) ?? null : null;
  const filteredRegions = searchTerm
    ? REGIONS.filter((r) => r.ccaa.toLowerCase().includes(searchTerm.toLowerCase()))
    : REGIONS;
  const sortedRegions = [...filteredRegions].sort((a, b) => b.mrr - a.mrr);



  function handleSetSelectedCode(code: string) {
    setSelectedCode(code);
    setNavView("summary");
  }

  async function handleHubspotImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportProgress("Subiendo HubSpot CSV…");
    setImportResult(null);
    try {
      const result = await importHubspotCsv(file, (done, total) =>
        setImportProgress(`HubSpot: ${done}/${total} filas`),
      );
      setImportResult({ ok: true, msg: `HubSpot: ${result.inserted} registros importados${result.errors ? ` (${result.errors} errores)` : ""}.` });
    } catch (err) {
      setImportResult({ ok: false, msg: err instanceof Error ? err.message : "Error importando HubSpot CSV" });
    } finally {
      setImportProgress(null);
      if (hubspotFileRef.current) hubspotFileRef.current.value = "";
    }
  }

  async function handleTamImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportProgress("Subiendo TAM CSV…");
    setImportResult(null);
    try {
      const result = await importTamCsv(file, (done, total) =>
        setImportProgress(`TAM: ${done}/${total} filas`),
      );
      setImportResult({ ok: true, msg: `TAM: ${result.inserted} registros importados${result.errors ? ` (${result.errors} errores)` : ""}.` });
    } catch (err) {
      setImportResult({ ok: false, msg: err instanceof Error ? err.message : "Error importando TAM CSV" });
    } finally {
      setImportProgress(null);
      if (tamFileRef.current) tamFileRef.current.value = "";
    }
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border px-6 py-4" style={{ background: "var(--gradient-factorial)" }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white">The Spanish Playbook</h1>
            <p className="text-sm text-white/70 mt-0.5">
              Estrategia por región · {REGIONS.length} CCAAs · {NATIONAL.active.toLocaleString()} clientes · {fmtEur(NATIONAL.mrr)} MRR
              {source === "live" && rowCount > 0 && (
                <span className="ml-2 text-white/50 text-xs">· {rowCount.toLocaleString()} deals en vivo</span>
              )}
              {source === "static" && status === "ready" && (
                <span className="ml-2 text-white/50 text-xs">· datos estáticos</span>
              )}

            </p>
            {(importProgress || importResult) && (
              <div className="mt-1.5 flex items-center gap-1.5">
                {importProgress && (
                  <span className="text-xs text-white/80 flex items-center gap-1">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    {importProgress}
                  </span>
                )}
                {!importProgress && importResult && (
                  <span className={cn("text-xs flex items-center gap-1", importResult.ok ? "text-green-300" : "text-red-300")}>
                    {importResult.ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                    {importResult.msg}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {error && (
              <span className="text-xs text-red-300 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {error}
              </span>
            )}

            <input ref={hubspotFileRef} type="file" accept=".csv" className="hidden" onChange={handleHubspotImport} />
            <input ref={tamFileRef} type="file" accept=".csv" className="hidden" onChange={handleTamImport} />
            <button
              type="button"
              disabled={!!importProgress}
              onClick={() => hubspotFileRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-medium transition-colors disabled:opacity-50"
            >
              <Upload className="h-3 w-3" />
              HubSpot CSV
            </button>
            <button
              type="button"
              disabled={!!importProgress}
              onClick={() => tamFileRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-medium transition-colors disabled:opacity-50"
            >
              <Upload className="h-3 w-3" />
              TAM CSV
            </button>
            <button
              type="button"
              disabled={status === "loading"}
              onClick={refresh}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-medium transition-colors disabled:opacity-50"
              title="Recargar desde Supabase"
            >
              <RefreshCw className={cn("h-3 w-3", status === "loading" && "animate-spin")} />
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Left panel — region list */}
        <div className="w-72 shrink-0 border-r border-border bg-card/50 min-h-[calc(100vh-8rem)] flex flex-col">
          <div className="p-3 border-b border-border">
            <input
              type="text"
              placeholder="Buscar región…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-8 rounded-lg border border-border bg-background px-3 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            <button
              type="button"
              onClick={() => { setNavView("slides"); setSelectedCode(null); }}
              className={cn(
                "w-full text-left px-4 py-3 flex items-center gap-3 transition-colors border-l-[3px] text-sm font-medium",
                navView === "slides"
                  ? "bg-primary/5 border-l-primary text-primary"
                  : "border-l-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <Presentation className="h-4 w-4" />
              Slides
            </button>
            <button
              type="button"
              onClick={() => { setNavView("summary"); setSelectedCode(null); }}
              className={cn(
                "w-full text-left px-4 py-3 flex items-center gap-3 transition-colors border-l-[3px] text-sm font-medium",
                navView === "summary" && selectedCode === null
                  ? "bg-primary/5 border-l-primary text-primary"
                  : "border-l-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <Users className="h-4 w-4" />
              Vista resumen
            </button>
            <button
              type="button"
              onClick={() => { setNavView("bestpractices"); setSelectedCode(null); }}
              className={cn(
                "w-full text-left px-4 py-3 flex items-center gap-3 transition-colors border-l-[3px] text-sm font-medium",
                navView === "bestpractices" && selectedCode === null
                  ? "bg-primary/5 border-l-primary text-primary"
                  : "border-l-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <Star className="h-4 w-4" />
              Mejores Prácticas
              {data.bestPractices.length > 0 && (
                <span className="ml-auto text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full font-medium">
                  {data.bestPractices.length}
                </span>
              )}
            </button>
            <div className="border-t border-border" />
            {sortedRegions.map((r) => (
              <RegionListItem
                key={r.code}
                region={r}
                active={navView === "summary" && selectedCode === r.code}
                onClick={() => { setNavView("summary"); setSelectedCode(r.code); }}
              />
            ))}
          </div>
        </div>

        {/* Right panel — detail */}
        <div className={cn("flex-1 min-w-0", navView === "slides" ? "p-4 flex flex-col h-[calc(100vh-8rem)]" : "p-6")}>
          {status === "loading" && !data.regions.length ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              Cargando datos…
            </div>
          ) : navView === "slides" ? (
            <SlidesView data={data} />
          ) : navView === "bestpractices" && selectedCode === null ? (
            <BestPracticesView
              bestPractices={data.bestPractices}
              setSelectedCode={handleSetSelectedCode}
              setView={() => { setNavView("summary"); }}
            />
          ) : selectedRegion ? (
            <RegionDetail region={selectedRegion} national={NATIONAL} bestPractices={data.bestPractices} />
          ) : (
            <SummaryView data={data} />
          )}
        </div>
      </div>
    </div>
  );
}
