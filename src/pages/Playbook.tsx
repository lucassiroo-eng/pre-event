import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { STRATEGY_EMAILS } from "@/lib/strategyStore";
import { REGIONS, NATIONAL, type RegionPlaybook } from "@/lib/playbookData";
import {
  ChevronRight, TrendingUp, TrendingDown, Users, Building2, Handshake,
  Target, AlertCircle, HelpCircle, BarChart3, Zap, ArrowUpRight,
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

type SummaryGroupBy = "ccaa" | "industry" | "size";

function SummaryView() {
  const [groupBy, setGroupBy] = useState<SummaryGroupBy>("ccaa");

  const sortedCcaa = useMemo(() => [...REGIONS].sort((a, b) => b.mrr - a.mrr), []);

  const byIndustry = useMemo(() => {
    const map = new Map<string, { active: number; mrr: number }>();
    for (const r of REGIONS) {
      for (const ind of r.industries) {
        const e = map.get(ind.label) ?? { active: 0, mrr: 0 };
        map.set(ind.label, { active: e.active + ind.active, mrr: e.mrr + ind.mrr });
      }
    }
    return [...map.entries()]
      .map(([label, d]) => ({ label, active: d.active, mrr: d.mrr, arpu: d.active > 0 ? Math.round(d.mrr / d.active) : 0 }))
      .sort((a, b) => b.mrr - a.mrr);
  }, []);

  const bySize = useMemo(() => {
    const SIZE_ORDER = ["S (1-50)", "M (51-200)", "L (201-500)", "XL (500+)", "Unknown"];
    const map = new Map<string, { pipeline: number; active: number; mrr: number; d2wNum: number; d2wDen: number }>();
    for (const r of REGIONS) {
      for (const s of r.sizes) {
        const e = map.get(s.label) ?? { pipeline: 0, active: 0, mrr: 0, d2wNum: 0, d2wDen: 0 };
        map.set(s.label, {
          pipeline: e.pipeline + s.pipeline,
          active: e.active + s.active,
          mrr: e.mrr + s.mrr,
          d2wNum: e.d2wNum + (s.d2w ?? 0) * s.active,
          d2wDen: e.d2wDen + (s.d2w !== null ? s.active : 0),
        });
      }
    }
    return [...map.entries()]
      .map(([label, d]) => ({
        label, pipeline: d.pipeline, active: d.active, mrr: d.mrr,
        arpu: d.active > 0 ? Math.round(d.mrr / d.active) : 0,
        d2w: d.d2wDen > 0 ? Math.round((d.d2wNum / d.d2wDen) * 10) / 10 : null,
      }))
      .sort((a, b) => SIZE_ORDER.indexOf(a.label) - SIZE_ORDER.indexOf(b.label));
  }, []);

  const GROUP_LABELS: Record<SummaryGroupBy, string> = { ccaa: "CCAA", industry: "Industria", size: "Tamaño" };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card shadow-sm p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-foreground">Resumen nacional</h3>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-0.5">
            {(["ccaa", "industry", "size"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGroupBy(g)}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                  groupBy === g ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {GROUP_LABELS[g]}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          {NATIONAL.active.toLocaleString()} clientes activos, {fmtEur(NATIONAL.mrr)} MRR, {NATIONAL.penetration}% penetración sobre {NATIONAL.tam.toLocaleString()} TAM
        </p>
        <div className="overflow-x-auto">
          {groupBy === "ccaa" && (
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
                {sortedCcaa.map((r) => (
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
                    )}>{fmtEur(r.arpu)}</td>
                    <td className={cn("py-2 px-2 text-right tabular-nums font-medium",
                      r.d2w >= NATIONAL.d2w ? "text-emerald-700" : r.d2w <= NATIONAL.d2w - 5 ? "text-red-600" : ""
                    )}>{r.d2w}%</td>
                    <td className="py-2 px-2 text-right tabular-nums">{r.tam.toLocaleString()}</td>
                    <td className={cn("py-2 px-2 text-right tabular-nums",
                      r.penetration >= NATIONAL.penetration ? "text-emerald-700" : "text-muted-foreground"
                    )}>{r.penetration}%</td>
                    <td className={cn("py-2 pl-2 text-right tabular-nums font-medium",
                      r.mrrPerTam >= 50 ? "text-emerald-700" : r.mrrPerTam <= 30 ? "text-red-600" : ""
                    )}>{r.mrrPerTam.toFixed(1)}€</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {groupBy === "industry" && (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-2 font-semibold text-muted-foreground">Industria</th>
                  <th className="py-2 px-2 font-semibold text-muted-foreground text-right">Activos</th>
                  <th className="py-2 px-2 font-semibold text-muted-foreground text-right">MRR</th>
                  <th className="py-2 pl-2 font-semibold text-muted-foreground text-right">ARPU</th>
                </tr>
              </thead>
              <tbody>
                {byIndustry.map((row) => (
                  <tr key={row.label} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 pr-2 font-medium">{row.label}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{row.active.toLocaleString()}</td>
                    <td className="py-2 px-2 text-right tabular-nums font-medium">{fmtEur(row.mrr)}</td>
                    <td className={cn("py-2 pl-2 text-right tabular-nums font-medium",
                      row.arpu >= NATIONAL.arpu * 1.1 ? "text-emerald-700" : row.arpu <= NATIONAL.arpu * 0.85 ? "text-red-600" : ""
                    )}>{fmtEur(row.arpu)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {groupBy === "size" && (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-2 font-semibold text-muted-foreground">Tamaño</th>
                  <th className="py-2 px-2 font-semibold text-muted-foreground text-right">Pipeline</th>
                  <th className="py-2 px-2 font-semibold text-muted-foreground text-right">Activos</th>
                  <th className="py-2 px-2 font-semibold text-muted-foreground text-right">MRR</th>
                  <th className="py-2 px-2 font-semibold text-muted-foreground text-right">ARPU</th>
                  <th className="py-2 pl-2 font-semibold text-muted-foreground text-right">D2W</th>
                </tr>
              </thead>
              <tbody>
                {bySize.map((row) => (
                  <tr key={row.label} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 pr-2 font-medium">{row.label}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{row.pipeline.toLocaleString()}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{row.active.toLocaleString()}</td>
                    <td className="py-2 px-2 text-right tabular-nums font-medium">{fmtEur(row.mrr)}</td>
                    <td className={cn("py-2 px-2 text-right tabular-nums font-medium",
                      row.arpu >= NATIONAL.arpu * 1.1 ? "text-emerald-700" : row.arpu <= NATIONAL.arpu * 0.85 ? "text-red-600" : ""
                    )}>{fmtEur(row.arpu)}</td>
                    <td className={cn("py-2 pl-2 text-right tabular-nums font-medium",
                      row.d2w !== null && row.d2w >= NATIONAL.d2w ? "text-emerald-700" : row.d2w !== null && row.d2w <= NATIONAL.d2w - 5 ? "text-red-600" : ""
                    )}>{row.d2w !== null ? `${row.d2w}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Archetype summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
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
      </div>
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
              onClick={() => setSelectedCode(null)}
              className={cn(
                "w-full text-left px-4 py-3.5 flex items-center gap-2.5 transition-colors border-l-[3px] font-semibold",
                selectedCode === null
                  ? "bg-primary/10 border-l-primary text-primary text-sm"
                  : "border-l-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground text-sm",
              )}
            >
              <BarChart3 className={cn("h-4 w-4 shrink-0", selectedCode === null ? "text-primary" : "text-muted-foreground")} />
              Vista resumen
              {selectedCode === null && <span className="ml-auto text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded font-medium">Nacional</span>}
            </button>
            <div className="border-t border-border" />
            {sortedRegions.map((r) => (
              <RegionListItem
                key={r.code}
                region={r}
                active={selectedCode === r.code}
                onClick={() => setSelectedCode(r.code)}
              />
            ))}
          </div>
        </div>

        {/* Right panel — detail */}
        <div className="flex-1 min-w-0 p-6">
          {selectedRegion ? (
            <RegionDetail region={selectedRegion} />
          ) : (
            <SummaryView />
          )}
        </div>
      </div>
    </div>
  );
}
