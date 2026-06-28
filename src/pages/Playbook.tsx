import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { STRATEGY_EMAILS } from "@/lib/strategyStore";
import { REGIONS, NATIONAL, type RegionPlaybook } from "@/lib/playbookData";
import {
  ChevronRight, TrendingUp, TrendingDown, Users, Building2, Handshake,
  Target, AlertCircle, HelpCircle, BarChart3, Zap, ArrowUpRight, Presentation,
  ChevronLeft,
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
  const color = kpiColor(value, baseline, higherIsBetter);
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm p-4">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-1">{label}</div>
      <div className={cn("text-2xl font-bold tabular-nums leading-none", color)}>{formatted}</div>
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
    </div>
  );
}

// ── Size table ───────────────────────────────────────────────────────────────

function SizeTable({ sizes }: { sizes: RegionPlaybook["sizes"] }) {
  const maxMrr = Math.max(...sizes.map((s) => s.mrr));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="py-2 pr-3 font-semibold text-muted-foreground">Segmento</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">Pipeline</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">Activos</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">MRR</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">ARPU</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">D2W</th>
            <th className="py-2 pl-3 font-semibold text-muted-foreground">% MRR</th>
          </tr>
        </thead>
        <tbody>
          {sizes.map((s) => (
            <tr key={s.label} className="border-b border-border/50 hover:bg-muted/30">
              <td className="py-2 pr-3">
                <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold ring-1 ring-inset", segmentBadge(s.label))}>
                  {s.label}
                </span>
              </td>
              <td className="py-2 px-3 text-right tabular-nums">{s.pipeline.toLocaleString()}</td>
              <td className="py-2 px-3 text-right tabular-nums">{s.active.toLocaleString()}</td>
              <td className="py-2 px-3 text-right tabular-nums font-medium">{fmtEur(s.mrr)}</td>
              <td className="py-2 px-3 text-right tabular-nums">{fmtEur(s.arpu)}</td>
              <td className={cn("py-2 px-3 text-right tabular-nums font-medium",
                s.d2w === null ? "text-muted-foreground/40" : s.d2w >= 80 ? "text-emerald-700" : s.d2w >= 65 ? "text-amber-700" : "text-red-600"
              )}>
                {s.d2w !== null ? `${s.d2w}%` : "—"}
              </td>
              <td className="py-2 pl-3 w-24">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary/60" style={{ width: barWidth(s.mrr, maxMrr) }} />
                  </div>
                  <span className="text-[10px] tabular-nums text-muted-foreground w-7 text-right">{s.mrrShare}%</span>
                </div>
              </td>
            </tr>
          ))}
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
  const maxMrr = Math.max(...provenances.map((p) => p.mrr));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="py-2 pr-3 font-semibold text-muted-foreground">Canal</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">Pipeline</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">Activos</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">MRR</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">ARPU</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">D2W</th>
            <th className="py-2 pl-3 font-semibold text-muted-foreground">% MRR</th>
          </tr>
        </thead>
        <tbody>
          {provenances.map((p) => (
            <tr key={p.label} className="border-b border-border/50 hover:bg-muted/30">
              <td className="py-2 pr-3 font-medium">{p.label}</td>
              <td className="py-2 px-3 text-right tabular-nums">{p.pipeline.toLocaleString()}</td>
              <td className="py-2 px-3 text-right tabular-nums">{p.active.toLocaleString()}</td>
              <td className="py-2 px-3 text-right tabular-nums font-medium">{fmtEur(p.mrr)}</td>
              <td className="py-2 px-3 text-right tabular-nums">{fmtEur(p.arpu)}</td>
              <td className={cn("py-2 px-3 text-right tabular-nums font-medium",
                p.d2w === null ? "text-muted-foreground/40" : p.d2w >= 80 ? "text-emerald-700" : p.d2w >= 65 ? "text-amber-700" : "text-red-600"
              )}>
                {p.d2w !== null ? `${p.d2w}%` : "—"}
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
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Industry table ───────────────────────────────────────────────────────────

function IndustryTable({ industries }: { industries: RegionPlaybook["industries"] }) {
  const maxMrr = Math.max(...industries.map((i) => i.mrr));
  const totalMrr = industries.reduce((s, i) => s + i.mrr, 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="py-2 pr-3 font-semibold text-muted-foreground">Industria</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">Activos</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">MRR</th>
            <th className="py-2 px-3 font-semibold text-muted-foreground text-right">ARPU</th>
            <th className="py-2 pl-3 font-semibold text-muted-foreground">Peso</th>
          </tr>
        </thead>
        <tbody>
          {industries.map((ind) => {
            const share = totalMrr > 0 ? Math.round((ind.mrr / totalMrr) * 100) : 0;
            return (
              <tr key={ind.label} className="border-b border-border/50 hover:bg-muted/30">
                <td className="py-2 pr-3 font-medium">{ind.label}</td>
                <td className="py-2 px-3 text-right tabular-nums">{ind.active}</td>
                <td className="py-2 px-3 text-right tabular-nums font-medium">{fmtEur(ind.mrr)}</td>
                <td className={cn("py-2 px-3 text-right tabular-nums font-medium",
                  ind.arpu >= NATIONAL.arpu * 1.5 ? "text-emerald-700" : ind.arpu <= NATIONAL.arpu * 0.7 ? "text-red-600" : ""
                )}>
                  {fmtEur(ind.arpu)}
                </td>
                <td className="py-2 pl-3 w-32">
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary/40" style={{ width: barWidth(ind.mrr, maxMrr) }} />
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

// ── Region detail panel ──────────────────────────────────────────────────────

function RegionDetail({ region }: { region: RegionPlaybook }) {
  const [activeTab, setActiveTab] = useState<"overview" | "channels" | "segments" | "industries" | "partners">("overview");
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
        <KpiCard label="ARPU" value={region.arpu} formatted={fmtEur(region.arpu)} baseline={NATIONAL.arpu} />
        <KpiCard label="Demo → Won" value={region.d2w} formatted={`${region.d2w}%`} baseline={NATIONAL.d2w} />
        <KpiCard label="Penetración" value={region.penetration} formatted={`${region.penetration}%`} baseline={NATIONAL.penetration} />
        <KpiCard label="€/TAM" value={region.mrrPerTam} formatted={`${region.mrrPerTam.toFixed(1)}€`} baseline={NATIONAL.mrr / NATIONAL.tam} />
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
          {/* Strategy recommendations */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Recomendaciones estratégicas
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <StrategyCard icon={Zap} title="Canal principal" headline={region.strategy.leadChannel} detail={region.strategy.leadChannelDetail} />
              <StrategyCard icon={Handshake} title="Partners" headline={region.strategy.partnerPlay} detail={region.strategy.partnerDetail} />
              <StrategyCard icon={Building2} title="Tamaño objetivo" headline={region.strategy.sizeFocus} detail={region.strategy.sizeDetail} />
              <StrategyCard icon={BarChart3} title="ARPU" headline={region.strategy.arpuAssessment} detail="" />
            </div>
            <div className="mt-3 rounded-xl border border-border bg-card shadow-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <ArrowUpRight className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">Conversión</span>
              </div>
              <div className="text-xs text-muted-foreground leading-relaxed">{region.strategy.conversionAssessment}</div>
            </div>
          </div>

          {/* Key insights */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              Insights clave
            </h3>
            <div className="rounded-xl border border-border bg-card shadow-sm px-4 divide-y divide-border/50">
              {region.keyInsights.map((insight, i) => (
                <InsightPill key={i} text={insight} />
              ))}
            </div>
          </div>

          {/* Open questions */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-blue-500" />
              Preguntas abiertas
            </h3>
            <div className="rounded-xl border border-blue-100 bg-blue-50/30 shadow-sm px-4 divide-y divide-blue-100/50">
              {region.openQuestions.map((q, i) => (
                <OpenQuestion key={i} text={q} />
              ))}
            </div>
          </div>
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
        </div>
      )}

      {activeTab === "segments" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card shadow-sm p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Desglose por tamaño de empresa</h3>
            <SizeTable sizes={region.sizes} />
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
            <IndustryTable industries={region.industries} />
          </div>
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

function SummaryView() {
  const [summaryTab, setSummaryTab] = useState<"ccaa" | "industria" | "tamaño">("ccaa");
  const sorted = useMemo(() => [...REGIONS].sort((a, b) => b.mrr - a.mrr), []);

  const nationalIndustries = useMemo(() => {
    const map = new Map<string, { active: number; mrr: number }>();
    for (const r of REGIONS) {
      for (const ind of r.industries) {
        const g = map.get(ind.label) ?? { active: 0, mrr: 0 };
        g.active += ind.active;
        g.mrr += ind.mrr;
        map.set(ind.label, g);
      }
    }
    return [...map.entries()]
      .map(([label, g]) => ({ label, active: g.active, mrr: g.mrr, arpu: g.active > 0 ? Math.round(g.mrr / g.active) : 0 }))
      .filter((r) => r.active > 0)
      .sort((a, b) => b.mrr - a.mrr);
  }, []);

  const nationalSizes = useMemo(() => {
    const ORDER = ["S (1-50)", "M (51-200)", "L (201-500)", "XL (500+)"];
    const map = new Map<string, { active: number; mrr: number; won: number; demos: number }>();
    for (const r of REGIONS) {
      for (const s of r.sizes) {
        const g = map.get(s.label) ?? { active: 0, mrr: 0, won: 0, demos: 0 };
        g.active += s.active;
        g.mrr += s.mrr;
        if (s.d2w !== null && s.pipeline > 0) {
          g.demos += s.pipeline;
          g.won += Math.round(s.pipeline * (s.d2w / 100));
        }
        map.set(s.label, g);
      }
    }
    return [...map.entries()]
      .map(([label, g]) => ({
        label,
        active: g.active,
        mrr: g.mrr,
        arpu: g.active > 0 ? Math.round(g.mrr / g.active) : 0,
        d2w: g.demos > 0 ? Math.round((g.won / g.demos) * 100 * 10) / 10 : null,
      }))
      .filter((r) => r.active > 0)
      .sort((a, b) => (ORDER.indexOf(a.label) ?? 99) - (ORDER.indexOf(b.label) ?? 99));
  }, []);

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
                  <th className="py-2 px-2 font-semibold text-muted-foreground text-right">Activos</th>
                  <th className="py-2 px-2 font-semibold text-muted-foreground text-right">MRR</th>
                  <th className="py-2 px-2 font-semibold text-muted-foreground text-right">ARPU</th>
                  <th className="py-2 px-2 font-semibold text-muted-foreground text-right">D2W</th>
                  <th className="py-2 px-2 font-semibold text-muted-foreground text-right">TAM</th>
                  <th className="py-2 px-2 font-semibold text-muted-foreground text-right">Pen.</th>
                  <th className="py-2 pl-2 font-semibold text-muted-foreground text-right">€/TAM</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.code} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 pr-2 font-medium">{r.ccaa}</td>
                    <td className="py-2 px-2">
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium whitespace-nowrap", archetypeColor(r.archetype))}>
                        {archetypeLabel(r.archetype)}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">{r.active.toLocaleString()}</td>
                    <td className="py-2 px-2 text-right tabular-nums font-medium">{fmtEur(r.mrr)}</td>
                    <td className={cn("py-2 px-2 text-right tabular-nums font-medium",
                      r.arpu >= NATIONAL.arpu * 1.1 ? "text-emerald-700" : r.arpu <= NATIONAL.arpu * 0.85 ? "text-red-600" : ""
                    )}>
                      {fmtEur(r.arpu)}
                    </td>
                    <td className={cn("py-2 px-2 text-right tabular-nums font-medium",
                      r.d2w >= NATIONAL.d2w ? "text-emerald-700" : r.d2w <= NATIONAL.d2w - 5 ? "text-red-600" : ""
                    )}>
                      {r.d2w}%
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">{r.tam.toLocaleString()}</td>
                    <td className={cn("py-2 px-2 text-right tabular-nums",
                      r.penetration >= NATIONAL.penetration ? "text-emerald-700" : "text-muted-foreground"
                    )}>
                      {r.penetration}%
                    </td>
                    <td className={cn("py-2 pl-2 text-right tabular-nums font-medium",
                      r.mrrPerTam >= 50 ? "text-emerald-700" : r.mrrPerTam <= 30 ? "text-red-600" : ""
                    )}>
                      {r.mrrPerTam.toFixed(1)}€
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {summaryTab === "industria" && (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-3 font-semibold text-muted-foreground">Industria</th>
                  <th className="py-2 px-3 font-semibold text-muted-foreground text-right">Activos</th>
                  <th className="py-2 px-3 font-semibold text-muted-foreground text-right">MRR</th>
                  <th className="py-2 pl-3 font-semibold text-muted-foreground text-right">ARPU</th>
                </tr>
              </thead>
              <tbody>
                {nationalIndustries.map((ind) => (
                  <tr key={ind.label} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 pr-3 font-medium">{ind.label}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{ind.active.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-medium">{fmtEur(ind.mrr)}</td>
                    <td className={cn("py-2 pl-3 text-right tabular-nums font-medium",
                      ind.arpu >= NATIONAL.arpu * 1.1 ? "text-emerald-700" : ind.arpu <= NATIONAL.arpu * 0.85 ? "text-red-600" : ""
                    )}>
                      {fmtEur(ind.arpu)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {summaryTab === "tamaño" && (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-3 font-semibold text-muted-foreground">Tamaño</th>
                  <th className="py-2 px-3 font-semibold text-muted-foreground text-right">Activos</th>
                  <th className="py-2 px-3 font-semibold text-muted-foreground text-right">MRR</th>
                  <th className="py-2 px-3 font-semibold text-muted-foreground text-right">ARPU</th>
                  <th className="py-2 pl-3 font-semibold text-muted-foreground text-right">D2W</th>
                </tr>
              </thead>
              <tbody>
                {nationalSizes.map((s) => (
                  <tr key={s.label} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 pr-3 font-medium">{s.label}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{s.active.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-medium">{fmtEur(s.mrr)}</td>
                    <td className={cn("py-2 px-3 text-right tabular-nums font-medium",
                      s.arpu >= NATIONAL.arpu * 1.1 ? "text-emerald-700" : s.arpu <= NATIONAL.arpu * 0.85 ? "text-red-600" : ""
                    )}>
                      {fmtEur(s.arpu)}
                    </td>
                    <td className={cn("py-2 pl-3 text-right tabular-nums font-medium",
                      s.d2w === null ? "text-muted-foreground/40"
                      : s.d2w >= NATIONAL.d2w ? "text-emerald-700"
                      : s.d2w <= NATIONAL.d2w - 5 ? "text-red-600" : ""
                    )}>
                      {s.d2w !== null ? `${s.d2w}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
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

function SlideNav({ slide, total, onPrev, onNext }: {
  slide: number; total: number; onPrev: () => void; onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-8 py-4 border-t border-gray-100 shrink-0">
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
    </div>
  );
}

function penColorClass(p: number): string {
  if (p < 5) return "text-red-600 font-semibold";
  if (p <= 10) return "text-amber-600 font-semibold";
  return "text-emerald-700 font-semibold";
}

// ── SlidesView ────────────────────────────────────────────────────────────────

function SlidesView() {
  const [slide, setSlide] = useState(0);
  const TOTAL = 12;

  // ── Aggregated data (computed once) ─────────────────────────────────────────

  // National size breakdown
  const nationalSizes = useMemo(() => {
    const ORDER = ["S (1-50)", "M (51-200)", "L (201-500)", "XL (500+)"];
    const map = new Map<string, { active: number; mrr: number }>();
    for (const r of REGIONS) {
      for (const s of r.sizes) {
        const g = map.get(s.label) ?? { active: 0, mrr: 0 };
        g.active += s.active;
        g.mrr += s.mrr;
        map.set(s.label, g);
      }
    }
    return [...map.entries()]
      .map(([label, g]) => ({
        label,
        active: g.active,
        mrr: g.mrr,
        arpu: g.active > 0 ? Math.round(g.mrr / g.active) : 0,
        mrrPct: Math.round((g.mrr / NATIONAL.mrr) * 100),
      }))
      .sort((a, b) => ORDER.indexOf(a.label) - ORDER.indexOf(b.label));
  }, []);

  // National channel breakdown (top 5 by mrr)
  const nationalChannels = useMemo(() => {
    const map = new Map<string, { active: number; mrr: number }>();
    for (const r of REGIONS) {
      for (const p of r.provenances) {
        const g = map.get(p.label) ?? { active: 0, mrr: 0 };
        g.active += p.active;
        g.mrr += p.mrr;
        map.set(p.label, g);
      }
    }
    return [...map.entries()]
      .map(([label, g]) => ({
        label,
        mrr: g.mrr,
        arpu: g.active > 0 ? Math.round(g.mrr / g.active) : 0,
        active: g.active,
      }))
      .sort((a, b) => b.mrr - a.mrr)
      .slice(0, 5);
  }, []);

  // National industry breakdown (top 5 by mrr)
  const nationalIndustries = useMemo(() => {
    const map = new Map<string, { active: number; mrr: number }>();
    for (const r of REGIONS) {
      for (const ind of r.industries) {
        const g = map.get(ind.label) ?? { active: 0, mrr: 0 };
        g.active += ind.active;
        g.mrr += ind.mrr;
        map.set(ind.label, g);
      }
    }
    return [...map.entries()]
      .map(([label, g]) => ({
        label,
        active: g.active,
        mrr: g.mrr,
        arpu: g.active > 0 ? Math.round(g.mrr / g.active) : 0,
      }))
      .sort((a, b) => b.mrr - a.mrr)
      .slice(0, 5);
  }, []);

  // Untapped TAM ranking (top 10)
  const untappedRanking = useMemo(() => {
    return [...REGIONS]
      .map((r) => ({
        ...r,
        untapped: Math.round((1 - r.penetration / 100) * r.tam),
        score: Math.round((1 - r.penetration / 100) * r.tam),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }, []);

  // Regions sorted by MRR (slide 5)
  const regionsByMrr = useMemo(() => [...REGIONS].sort((a, b) => b.mrr - a.mrr), []);

  // Archetype aggregates (slide 6)
  const archetypeAgg = useMemo(() => {
    const archetypes = ["partner-led", "outbound-responsive", "multi-channel"] as const;
    return archetypes.map((arch) => {
      const regions = REGIONS.filter((r) => r.archetype === arch);
      return {
        arch,
        regions,
        mrr: regions.reduce((s, r) => s + r.mrr, 0),
        active: regions.reduce((s, r) => s + r.active, 0),
        count: regions.length,
      };
    });
  }, []);

  // Partner-led regions (slide 7)
  const partnerLedRegions = useMemo(
    () => REGIONS.filter((r) => r.archetype === "partner-led").sort((a, b) => b.mrr - a.mrr),
    [],
  );
  const partnerLedMrr = partnerLedRegions.reduce((s, r) => s + r.mrr, 0);

  // Outbound-responsive regions (slide 8)
  const outboundRegions = useMemo(
    () => REGIONS.filter((r) => r.archetype === "outbound-responsive").sort((a, b) => b.mrr - a.mrr),
    [],
  );
  const outboundMrr = outboundRegions.reduce((s, r) => s + r.mrr, 0);

  // Multi-channel regions (slide 9 & 10)
  const multiChannelRegions = useMemo(
    () => REGIONS.filter((r) => r.archetype === "multi-channel").sort((a, b) => b.mrr - a.mrr),
    [],
  );
  const multiChannelMrr = multiChannelRegions.reduce((s, r) => s + r.mrr, 0);

  // Top-5 opportunities: score = untapped_tam * (d2w / 100)
  const top5Opportunities = useMemo(() => {
    return [...REGIONS]
      .map((r) => ({
        ...r,
        oppScore: Math.round((1 - r.penetration / 100) * r.tam * (r.d2w / 100)),
      }))
      .sort((a, b) => b.oppScore - a.oppScore)
      .slice(0, 5);
  }, []);

  // ── Slide content ─────────────────────────────────────────────────────────

  const slides: React.ReactNode[] = [
    // ── Slide 1 — Portada ─────────────────────────────────────────────────────
    <div key="s1" className="flex flex-col h-full p-8 gap-6">
      <div className="flex-1 flex flex-col justify-center gap-6">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-gray-400 mb-2">Factorial HR · Junio 2026</div>
          <h1 className="text-4xl font-bold text-gray-900 leading-tight">Estrategia de Crecimiento España</h1>
          <p className="text-lg text-gray-500 mt-2">Playbook de Mercado · Factorial HR</p>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <SlideKpiPill label="MRR" value="4.8M€" />
          <SlideKpiPill label="Clientes activos" value="6,545" />
          <SlideKpiPill label="Penetración" value="7.0%" />
          <SlideKpiPill label="TAM" value="93,174" />
        </div>
      </div>
      <InsightBox text="España representa el mercado core de Factorial. Con 7% de penetración sobre 93K empresas, el 93% del mercado aún está sin capturar." />
    </div>,

    // ── Slide 2 — Macro financiero ────────────────────────────────────────────
    <div key="s2" className="flex flex-col h-full p-8 gap-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Situación Financiera del Mercado Español</h2>
        <p className="text-xs text-gray-500">Métricas nacionales agregadas — {REGIONS.length} CCAAs</p>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <SlideKpiCard label="MRR" value="4.8M€" />
        <SlideKpiCard label="ARPU" value="729€" />
        <SlideKpiCard label="Demo → Won" value="79.2%" />
        <SlideKpiCard label="Activos" value="6,545" />
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">ARPU por segmento de empresa</p>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-left">
              <th className="py-2 px-3 font-semibold text-gray-500">Segmento</th>
              <th className="py-2 px-3 font-semibold text-gray-500 text-right">Activos</th>
              <th className="py-2 px-3 font-semibold text-gray-500 text-right">MRR</th>
              <th className="py-2 px-3 font-semibold text-gray-500 text-right">ARPU</th>
              <th className="py-2 px-3 font-semibold text-gray-500 text-right">% MRR</th>
            </tr>
          </thead>
          <tbody>
            {nationalSizes.map((s) => (
              <tr key={s.label} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 px-3 font-medium">{s.label}</td>
                <td className="py-2 px-3 text-right tabular-nums">{s.active.toLocaleString()}</td>
                <td className="py-2 px-3 text-right tabular-nums font-medium">{fmtEur(s.mrr)}</td>
                <td className="py-2 px-3 text-right tabular-nums font-semibold text-gray-900">{fmtEur(s.arpu)}</td>
                <td className="py-2 px-3 text-right tabular-nums text-gray-500">{s.mrrPct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <InsightBox text="El ARPU de empresas M (51-200) es 3x el de empresas S. Cada deal desplazado hacia M equivale a 3 deals S en valor." />
    </div>,

    // ── Slide 3 — Segmentación ────────────────────────────────────────────────
    <div key="s3" className="flex flex-col h-full p-8 gap-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Origen y Composición del Pipeline</h2>
        <p className="text-xs text-gray-500">Agregado nacional por canal, industria y tamaño</p>
      </div>
      <div className="grid grid-cols-3 gap-4 flex-1 min-h-0">
        {/* Canal */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Por Canal (top 5 MRR)</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b text-left">
                <th className="py-1.5 px-2 font-semibold text-gray-500">Canal</th>
                <th className="py-1.5 px-2 font-semibold text-gray-500 text-right">MRR</th>
                <th className="py-1.5 px-2 font-semibold text-gray-500 text-right">ARPU</th>
              </tr>
            </thead>
            <tbody>
              {nationalChannels.map((c) => (
                <tr key={c.label} className="border-b border-gray-100">
                  <td className="py-1.5 px-2">{c.label}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{fmtEur(c.mrr)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums font-semibold">{fmtEur(c.arpu)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Industria */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Por Industria (top 5)</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b text-left">
                <th className="py-1.5 px-2 font-semibold text-gray-500">Industria</th>
                <th className="py-1.5 px-2 font-semibold text-gray-500 text-right">Activos</th>
                <th className="py-1.5 px-2 font-semibold text-gray-500 text-right">ARPU</th>
              </tr>
            </thead>
            <tbody>
              {nationalIndustries.map((i) => (
                <tr key={i.label} className="border-b border-gray-100">
                  <td className="py-1.5 px-2">{i.label}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{i.active}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums font-semibold">{fmtEur(i.arpu)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Tamaño */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Por Tamaño</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b text-left">
                <th className="py-1.5 px-2 font-semibold text-gray-500">Segmento</th>
                <th className="py-1.5 px-2 font-semibold text-gray-500 text-right">MRR%</th>
                <th className="py-1.5 px-2 font-semibold text-gray-500 text-right">ARPU</th>
              </tr>
            </thead>
            <tbody>
              {nationalSizes.map((s) => (
                <tr key={s.label} className="border-b border-gray-100">
                  <td className="py-1.5 px-2">{s.label}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{s.mrrPct}%</td>
                  <td className="py-1.5 px-2 text-right tabular-nums font-semibold">{fmtEur(s.arpu)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <InsightBox text="Partners generan el ARPU más alto (>1,100€). Inbound tiene el mayor volumen. Optimizar la mezcla canal→tamaño es la palanca principal." />
    </div>,

    // ── Slide 4 — TAM y Oportunidad ───────────────────────────────────────────
    <div key="s4" className="flex flex-col h-full p-8 gap-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Mercado Sin Cubrir: Priorización por Región</h2>
        <p className="text-xs text-gray-500">Top 10 CCAAs ordenadas por TAM sin cubrir absoluto</p>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b text-left">
              <th className="py-2 px-3 font-semibold text-gray-500">#</th>
              <th className="py-2 px-3 font-semibold text-gray-500">Región</th>
              <th className="py-2 px-3 font-semibold text-gray-500 text-right">TAM</th>
              <th className="py-2 px-3 font-semibold text-gray-500 text-right">Penetración actual</th>
              <th className="py-2 px-3 font-semibold text-gray-500 text-right">Empresas sin cubrir</th>
              <th className="py-2 px-3 font-semibold text-gray-500 text-right">Score oportunidad</th>
            </tr>
          </thead>
          <tbody>
            {untappedRanking.map((r, i) => (
              <tr key={r.code} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 px-3 text-gray-400">{i + 1}</td>
                <td className="py-2 px-3 font-medium">{r.ccaa}</td>
                <td className="py-2 px-3 text-right tabular-nums">{r.tam.toLocaleString()}</td>
                <td className={cn("py-2 px-3 text-right tabular-nums", penColorClass(r.penetration))}>
                  {r.penetration}%
                </td>
                <td className="py-2 px-3 text-right tabular-nums font-semibold">{r.untapped.toLocaleString()}</td>
                <td className="py-2 px-3 text-right tabular-nums">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-red-600"
                        style={{ width: `${Math.round((r.score / untappedRanking[0].score) * 100)}%` }}
                      />
                    </div>
                    <span className="tabular-nums">{r.score.toLocaleString()}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <InsightBox text="Madrid y Cataluña tienen el mayor volumen absoluto sin cubrir. Pero regiones como Andalucía ofrecen el mejor ratio oportunidad/base instalada." />
    </div>,

    // ── Slide 5 — Tabla Regional ──────────────────────────────────────────────
    <div key="s5" className="flex flex-col h-full p-8 gap-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Comparativa Regional: CC.AA Principales</h2>
        <p className="text-xs text-gray-500">18 CCAAs ordenadas por MRR — ARPU y D2W comparados vs nacional</p>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b text-left">
              <th className="py-2 px-2 font-semibold text-gray-500">Región</th>
              <th className="py-2 px-2 font-semibold text-gray-500">Arquetipo</th>
              <th className="py-2 px-2 font-semibold text-gray-500 text-right">Activos</th>
              <th className="py-2 px-2 font-semibold text-gray-500 text-right">MRR</th>
              <th className="py-2 px-2 font-semibold text-gray-500 text-right">ARPU</th>
              <th className="py-2 px-2 font-semibold text-gray-500 text-right">D2W</th>
              <th className="py-2 px-2 font-semibold text-gray-500 text-right">Penetración</th>
            </tr>
          </thead>
          <tbody>
            {regionsByMrr.map((r) => (
              <tr key={r.code} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-1.5 px-2 font-medium">{r.ccaa}</td>
                <td className="py-1.5 px-2">
                  <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-medium whitespace-nowrap", archetypeColor(r.archetype))}>
                    {archetypeLabel(r.archetype)}
                  </span>
                </td>
                <td className="py-1.5 px-2 text-right tabular-nums">{r.active.toLocaleString()}</td>
                <td className="py-1.5 px-2 text-right tabular-nums font-medium">{fmtEur(r.mrr)}</td>
                <td className={cn("py-1.5 px-2 text-right tabular-nums font-medium",
                  r.arpu >= NATIONAL.arpu * 1.1 ? "text-emerald-700" : r.arpu <= NATIONAL.arpu * 0.85 ? "text-red-600" : "",
                )}>
                  {fmtEur(r.arpu)}
                </td>
                <td className={cn("py-1.5 px-2 text-right tabular-nums font-medium",
                  r.d2w >= NATIONAL.d2w ? "text-emerald-700" : r.d2w <= NATIONAL.d2w - 5 ? "text-red-600" : "",
                )}>
                  {r.d2w}%
                </td>
                <td className={cn("py-1.5 px-2 text-right tabular-nums", penColorClass(r.penetration))}>
                  {r.penetration}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <InsightBox text="Cataluña y Madrid concentran el 55% del MRR total. La disparidad regional es estructural — los arquetipos explican el porqué." />
    </div>,

    // ── Slide 6 — Los 3 Arquetipos ────────────────────────────────────────────
    <div key="s6" className="flex flex-col h-full p-8 gap-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Tres Modelos de Mercado Distintos</h2>
        <p className="text-xs text-gray-500">Cada arquetipo tiene un playbook de canal, tamaño e inversión diferente</p>
      </div>
      <div className="flex-1 flex flex-col gap-3 min-h-0">
        {archetypeAgg.map(({ arch, regions, mrr, active, count }) => (
          <div key={arch} className={cn("rounded-lg border p-4 flex gap-6 items-start", archetypeColor(arch))}>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className={cn("text-xs px-2 py-0.5 rounded border font-bold", archetypeColor(arch))}>
                  {archetypeLabel(arch)}
                </span>
                <span className="text-xs text-gray-500">{count} regiones</span>
              </div>
              <p className="text-[11px] italic leading-snug opacity-80">{archetypeTagline(arch)}</p>
              <p className="text-[10px] mt-1.5 opacity-60">{regions.map((r) => r.ccaa).join(", ")}</p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-lg font-bold tabular-nums">{fmtEur(mrr)}</div>
              <div className="text-[10px] text-gray-500">{active.toLocaleString()} clientes</div>
            </div>
          </div>
        ))}
      </div>
      <InsightBox text="No existe una estrategia única. Cada arquetipo requiere un playbook diferente: canal, tamaño objetivo y mix de inversión son distintos." />
    </div>,

    // ── Slide 7 — Partner-Led ─────────────────────────────────────────────────
    <div key="s7" className="flex flex-col h-full p-8 gap-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">
          Arquetipo 1: Partner-Led — {partnerLedRegions.length} Regiones, {fmtEur(partnerLedMrr)} MRR
        </h2>
        <p className="text-xs text-gray-500">Canal partner domina (&gt;40% MRR) — el canal directo es secundario</p>
      </div>
      <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Regiones</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b text-left">
                <th className="py-1.5 px-2 font-semibold text-gray-500">CCAA</th>
                <th className="py-1.5 px-2 font-semibold text-gray-500 text-right">MRR</th>
                <th className="py-1.5 px-2 font-semibold text-gray-500 text-right">Penetración</th>
              </tr>
            </thead>
            <tbody>
              {partnerLedRegions.map((r) => (
                <tr key={r.code} className="border-b border-gray-100">
                  <td className="py-1.5 px-2 font-medium">{r.ccaa}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{fmtEur(r.mrr)}</td>
                  <td className={cn("py-1.5 px-2 text-right tabular-nums", penColorClass(r.penetration))}>
                    {r.penetration}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Métricas clave</p>
          <table className="w-full text-xs">
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="py-2 pr-3 text-gray-500">ARPU medio</td>
                <td className="py-2 text-right font-semibold tabular-nums">
                  {fmtEur(Math.round(partnerLedRegions.reduce((s, r) => s + r.arpu, 0) / partnerLedRegions.length))}
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-3 text-gray-500">D2W medio</td>
                <td className="py-2 text-right font-semibold tabular-nums">
                  {(partnerLedRegions.reduce((s, r) => s + r.d2w, 0) / partnerLedRegions.length).toFixed(1)}%
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-3 text-gray-500">Canal dominante</td>
                <td className="py-2 text-right font-semibold">Channel Partners</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 text-gray-500">Top partner</td>
                <td className="py-2 text-right font-semibold">Landín Informática (Galicia)</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 text-gray-500">Penetración media</td>
                <td className="py-2 text-right font-semibold tabular-nums">
                  {(partnerLedRegions.reduce((s, r) => s + r.penetration, 0) / partnerLedRegions.length).toFixed(1)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <InsightBox
        actionable
        text="Activar y escalar partnerships locales en cada región. Priorizar Galicia (penetración 4.1%) y Castilla y León (4.4%). Target: duplicar clientes partner en 6 meses."
      />
    </div>,

    // ── Slide 8 — Outbound-Responsive ─────────────────────────────────────────
    <div key="s8" className="flex flex-col h-full p-8 gap-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">
          Arquetipo 2: Outbound-Responsive — {outboundRegions.length} Regiones, {fmtEur(outboundMrr)} MRR
        </h2>
        <p className="text-xs text-gray-500">Outbound SDR genera los mejores resultados — mercados que responden a la búsqueda proactiva</p>
      </div>
      <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Regiones</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b text-left">
                <th className="py-1.5 px-2 font-semibold text-gray-500">CCAA</th>
                <th className="py-1.5 px-2 font-semibold text-gray-500 text-right">MRR</th>
                <th className="py-1.5 px-2 font-semibold text-gray-500 text-right">D2W</th>
              </tr>
            </thead>
            <tbody>
              {outboundRegions.map((r) => (
                <tr key={r.code} className="border-b border-gray-100">
                  <td className="py-1.5 px-2 font-medium">{r.ccaa}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{fmtEur(r.mrr)}</td>
                  <td className={cn("py-1.5 px-2 text-right tabular-nums font-semibold",
                    r.d2w >= NATIONAL.d2w ? "text-emerald-700" : "text-red-600",
                  )}>
                    {r.d2w}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Métricas clave</p>
          <table className="w-full text-xs">
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="py-2 pr-3 text-gray-500">ARPU medio</td>
                <td className="py-2 text-right font-semibold tabular-nums">
                  {fmtEur(Math.round(outboundRegions.reduce((s, r) => s + r.arpu, 0) / outboundRegions.length))}
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-3 text-gray-500">D2W medio</td>
                <td className="py-2 text-right font-semibold tabular-nums">
                  {(outboundRegions.reduce((s, r) => s + r.d2w, 0) / outboundRegions.length).toFixed(1)}%
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-3 text-gray-500">Mejor D2W outbound</td>
                <td className="py-2 text-right font-semibold">Extremadura (96%) / Canarias (95%)</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 text-gray-500">Canal dominante</td>
                <td className="py-2 text-right font-semibold">Outbound SDR</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <InsightBox
        actionable
        text="Incrementar cobertura SDR en C. Valenciana y País Vasco — D2W >78% confirma que estas regiones convierten bien cuando se contactan. ROI de SDR aquí es superior a la media nacional."
      />
    </div>,

    // ── Slide 9 — Multi-Channel Core ──────────────────────────────────────────
    <div key="s9" className="flex flex-col h-full p-8 gap-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">
          Arquetipo 3: Multi-Channel Core — {multiChannelRegions.length} Regiones, {fmtEur(multiChannelMrr)} MRR
        </h2>
        <p className="text-xs text-gray-500">Ningún canal domina — orquesta inbound + outbound + partners para maximizar cobertura</p>
      </div>
      <div className="flex-1 min-h-0">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b text-left">
              <th className="py-2 px-3 font-semibold text-gray-500">CCAA</th>
              <th className="py-2 px-3 font-semibold text-gray-500 text-right">MRR</th>
              <th className="py-2 px-3 font-semibold text-gray-500">Top Canal</th>
              <th className="py-2 px-3 font-semibold text-gray-500 text-right">D2W</th>
              <th className="py-2 px-3 font-semibold text-gray-500 text-right">ARPU</th>
            </tr>
          </thead>
          <tbody>
            {multiChannelRegions.map((r) => {
              const topChannel = [...r.provenances].sort((a, b) => b.mrr - a.mrr)[0];
              return (
                <tr key={r.code} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-3 font-medium">{r.ccaa}</td>
                  <td className="py-2 px-3 text-right tabular-nums font-semibold">{fmtEur(r.mrr)}</td>
                  <td className="py-2 px-3 text-gray-600">
                    {topChannel.label} <span className="text-gray-400">({topChannel.mrrShare}%)</span>
                  </td>
                  <td className={cn("py-2 px-3 text-right tabular-nums font-semibold",
                    r.d2w >= NATIONAL.d2w ? "text-emerald-700" : "text-amber-600",
                  )}>
                    {r.d2w}%
                  </td>
                  <td className={cn("py-2 px-3 text-right tabular-nums",
                    r.arpu >= NATIONAL.arpu ? "text-emerald-700" : "text-red-600",
                  )}>
                    {fmtEur(r.arpu)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <InsightBox
        actionable
        text="No elegir un canal — orquestar. En estas regiones conviven Partners (ARPU 1,128€), Outbound (D2W 87%) e Inbound (volumen). La secuencia ideal: Inbound para leads → Outbound para conversión → Partners para upmarket."
      />
    </div>,

    // ── Slide 10 — Zoom Multi-Channel ─────────────────────────────────────────
    <div key="s10" className="flex flex-col h-full p-8 gap-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Multi-Channel Core: Decisiones por Región</h2>
        <p className="text-xs text-gray-500">Comparativa detallada de las {multiChannelRegions.length} CCAAs Multi-Channel</p>
      </div>
      <div className="flex-1 min-h-0">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b text-left">
              <th className="py-2 px-3 font-semibold text-gray-500">Región</th>
              <th className="py-2 px-3 font-semibold text-gray-500 text-right">Activos</th>
              <th className="py-2 px-3 font-semibold text-gray-500 text-right">MRR</th>
              <th className="py-2 px-3 font-semibold text-gray-500 text-right">ARPU</th>
              <th className="py-2 px-3 font-semibold text-gray-500 text-right">D2W</th>
              <th className="py-2 px-3 font-semibold text-gray-500">Top Canal</th>
              <th className="py-2 px-3 font-semibold text-gray-500 text-right">ARPU Partner</th>
            </tr>
          </thead>
          <tbody>
            {multiChannelRegions.map((r) => {
              const topChannel = [...r.provenances].sort((a, b) => b.mrr - a.mrr)[0];
              const partnerProv = r.provenances.find((p) => p.label === "Channel Partners");
              return (
                <tr key={r.code} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-3 font-medium">{r.ccaa}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{r.active.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right tabular-nums font-semibold">{fmtEur(r.mrr)}</td>
                  <td className={cn("py-2 px-3 text-right tabular-nums",
                    r.arpu >= NATIONAL.arpu * 1.05 ? "text-emerald-700" : r.arpu <= NATIONAL.arpu * 0.9 ? "text-red-600" : "",
                  )}>
                    {fmtEur(r.arpu)}
                  </td>
                  <td className={cn("py-2 px-3 text-right tabular-nums font-semibold",
                    r.d2w >= NATIONAL.d2w ? "text-emerald-700" : r.d2w <= NATIONAL.d2w - 5 ? "text-red-600" : "",
                  )}>
                    {r.d2w}%
                  </td>
                  <td className="py-2 px-3 text-gray-600">{topChannel.label} ({topChannel.mrrShare}%)</td>
                  <td className="py-2 px-3 text-right tabular-nums">
                    {partnerProv ? fmtEur(partnerProv.arpu) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <InsightBox
        actionable
        text="Cataluña y Madrid justifican inversión en los 3 canales simultáneamente. Baleares y Asturias: concentrar en el canal dominante antes de diversificar."
      />
    </div>,

    // ── Slide 11 — Priorización Final ─────────────────────────────────────────
    <div key="s11" className="flex flex-col h-full p-8 gap-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Top 5 Oportunidades Ganadoras</h2>
        <p className="text-xs text-gray-500">Puntuación = TAM sin cubrir × (D2W / 100) — alto potencial y alta probabilidad de conversión</p>
      </div>
      <div className="flex-1 flex flex-col gap-3 min-h-0">
        {top5Opportunities.map((r, i) => (
          <div key={r.code} className="rounded-lg border border-gray-200 bg-white p-3 flex gap-4 items-start">
            <div className="text-2xl font-bold text-gray-200 tabular-nums w-8 shrink-0 text-right">{i + 1}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-bold text-gray-900">{r.ccaa}</span>
                <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-medium", archetypeColor(r.archetype))}>
                  {archetypeLabel(r.archetype)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 text-xs">
                <div><span className="text-gray-400">Porqué: </span><span className="text-gray-700">Penetración {r.penetration}% ({Math.round((1 - r.penetration / 100) * r.tam).toLocaleString()} sin cubrir), D2W {r.d2w}%</span></div>
                <div><span className="text-gray-400">Qué: </span><span className="text-gray-700">{r.strategy.leadChannel}</span></div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xs text-gray-400">Score</div>
              <div className="text-base font-bold tabular-nums text-red-600">{r.oppScore.toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>
      <InsightBox text="Cada euro de inversión incremental debe ir primero a regiones con D2W alto y penetración baja. Madrid outbound y Cataluña partner son las apuestas de menor riesgo y mayor retorno." />
    </div>,

    // ── Slide 12 — Próximos Pasos ─────────────────────────────────────────────
    <div key="s12" className="flex flex-col h-full p-8 gap-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Plan de Acción: Próximos 90 Días</h2>
        <p className="text-xs text-gray-500">Prioridades ejecutables ordenadas por impacto esperado</p>
      </div>
      <div className="grid grid-cols-3 gap-4 flex-1 min-h-0">
        {[
          {
            label: "30 días",
            color: "border-red-200 bg-red-50",
            header: "text-red-700",
            items: [
              "Asignar SDR dedicado a Canarias y Extremadura (D2W outbound >95%)",
              "Activar campañas outbound en C. Valenciana y País Vasco",
              "Reunión de revisión con Landín Informática (Galicia) — plan de escalada",
              "Diagnóstico D2W en Murcia — entrevistar AEs sobre objeciones frecuentes",
            ],
          },
          {
            label: "60 días",
            color: "border-amber-200 bg-amber-50",
            header: "text-amber-700",
            items: [
              "Reclutar 1 nuevo partner local en Castilla y León y en Aragón",
              "Lanzar campaña vertical Healthcare en Andalucía (ARPU €2,627)",
              "Optimizar Santander D2W en País Vasco — revisión del proceso de handoff",
              "Ampliar Wolters Kluwer en Madrid — modelo de bajo volumen / alto ARPU",
            ],
          },
          {
            label: "90 días",
            color: "border-emerald-200 bg-emerald-50",
            header: "text-emerald-700",
            items: [
              "Consolidar pipeline M+ en Cataluña — orquestar outbound (87% D2W) → partner",
              "Plan de partner turístico en Baleares y Canarias (Hospitality 33% MRR)",
              "Revisar targeting de Inbound en País Vasco y Castilla y León (D2W <65%)",
              "Publicar playbook regional internal — mejores prácticas de los 5 top CCAAs",
            ],
          },
        ].map((col) => (
          <div key={col.label} className={cn("rounded-lg border p-4", col.color)}>
            <p className={cn("text-xs font-bold uppercase tracking-widest mb-3", col.header)}>{col.label}</p>
            <ul className="space-y-2">
              {col.items.map((item, i) => (
                <li key={i} className="flex gap-2 text-xs text-gray-700">
                  <span className="mt-0.5 shrink-0 h-1.5 w-1.5 rounded-full bg-gray-400 mt-1.5" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-gray-200 bg-white px-4 py-2 flex gap-6">
        <div className="text-[10px] uppercase tracking-widest text-gray-400 shrink-0 self-center">Métricas de éxito</div>
        <div className="flex gap-6 text-xs">
          <div><span className="font-semibold">MRR incremental</span> <span className="text-gray-500">+300K€ en 90 días</span></div>
          <div><span className="font-semibold">D2W nacional</span> <span className="text-gray-500">79.2% → 81%+</span></div>
          <div><span className="font-semibold">Partners activados</span> <span className="text-gray-500">+4 nuevos acuerdos</span></div>
        </div>
      </div>
      <InsightBox text="La velocidad de ejecución es la variable diferencial. Las regiones de alta oportunidad no esperan." />
    </div>,
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="min-h-0 flex-1 overflow-hidden bg-white border border-gray-100 rounded-lg">
        {slides[slide]}
      </div>
      <SlideNav
        slide={slide}
        total={TOTAL}
        onPrev={() => setSlide((s) => Math.max(0, s - 1))}
        onNext={() => setSlide((s) => Math.min(TOTAL - 1, s + 1))}
      />
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export function PlaybookPage() {
  const { email } = useAuth();
  const navigate = useNavigate();
  const country = window.localStorage.getItem("pre-event-country") ?? "";
  const hasAccess = !!email && email.endsWith("@factorial.co");

  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showSlides, setShowSlides] = useState(false);

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

  const selectedRegion = selectedCode ? REGIONS.find((r) => r.code === selectedCode) ?? null : null;

  const filteredRegions = searchTerm
    ? REGIONS.filter((r) => r.ccaa.toLowerCase().includes(searchTerm.toLowerCase()))
    : REGIONS;

  const sortedRegions = [...filteredRegions].sort((a, b) => b.mrr - a.mrr);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border px-6 py-5" style={{ background: "var(--gradient-factorial)" }}>
        <h1 className="text-xl font-bold text-white">The Spanish Playbook</h1>
        <p className="text-sm text-white/70 mt-0.5">
          Estrategia por región · {REGIONS.length} CCAAs · {NATIONAL.active.toLocaleString()} clientes · {fmtEur(NATIONAL.mrr)} MRR
        </p>
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
              onClick={() => { setShowSlides(true); setSelectedCode(null); }}
              className={cn(
                "w-full text-left px-4 py-3 flex items-center gap-3 transition-colors border-l-[3px] text-sm font-medium",
                showSlides
                  ? "bg-primary/5 border-l-primary text-primary"
                  : "border-l-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <Presentation className="h-4 w-4" />
              Slides
            </button>
            <button
              type="button"
              onClick={() => { setShowSlides(false); setSelectedCode(null); }}
              className={cn(
                "w-full text-left px-4 py-3 flex items-center gap-3 transition-colors border-l-[3px] text-sm font-medium",
                !showSlides && selectedCode === null
                  ? "bg-primary/5 border-l-primary text-primary"
                  : "border-l-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <Users className="h-4 w-4" />
              Vista resumen
            </button>
            <div className="border-t border-border" />
            {sortedRegions.map((r) => (
              <RegionListItem
                key={r.code}
                region={r}
                active={!showSlides && selectedCode === r.code}
                onClick={() => { setShowSlides(false); setSelectedCode(r.code); }}
              />
            ))}
          </div>
        </div>

        {/* Right panel — detail */}
        <div className={cn("flex-1 min-w-0", showSlides ? "p-4 flex flex-col h-[calc(100vh-8rem)]" : "p-6")}>
          {showSlides ? (
            <SlidesView />
          ) : selectedRegion ? (
            <RegionDetail region={selectedRegion} />
          ) : (
            <SummaryView />
          )}
        </div>
      </div>
    </div>
  );
}
