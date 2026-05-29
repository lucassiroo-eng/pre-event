import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import {
  Zap, Phone, CalendarCheck, Users, Trophy, Target, Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import {
  REGIONS, VERTICALS, PARTNERS, ICP_SEGMENTS, DEALS, formatEUR,
  type RegionCode, isClosedWon, isDemoBooked,
} from "@/data/mockData";
import { blitzRecommendations, computeRegionStats } from "@/data/regionMetrics";
import { cn } from "@/lib/utils";

const search = z.object({
  region: z.string().optional(),
});

export const Route = createFileRoute("/blitz-day")({
  validateSearch: search,
  component: BlitzDay,
});

function BlitzDay() {
  const { region: initial } = Route.useSearch();
  const [region, setRegion] = useState<RegionCode>((initial as RegionCode) ?? "11");
  const [partner, setPartner] = useState<string>(PARTNERS[0]);
  const [vertical, setVertical] = useState<string>(VERTICALS[0]);
  const [icp, setIcp] = useState<string>(ICP_SEGMENTS[0].id);
  const [target, setTarget] = useState<number>(10);

  const stats = useMemo(() => computeRegionStats(region), [region]);
  const recs = useMemo(() => blitzRecommendations(region), [region]);
  const recommendedCompanies = useMemo(() => {
    return DEALS
      .filter(d => d.region === region && d.vertical === vertical && d.icpId === icp && !isClosedWon(d))
      .slice(0, 8);
  }, [region, vertical, icp]);

  // Mock live progress
  const live = {
    calls: 142,
    demosBooked: 9,
    demosHeld: 5,
    noShows: 2,
    dealsCreated: 4,
    mrrCreated: 8400,
  };

  return (
    <div className="mx-auto max-w-[1500px] px-6 py-6 lg:px-8 lg:py-8 space-y-6">
      <PageHeader
        title="Blitz Day Mode"
        subtitle="Prepare, target and track your next sales acceleration day."
      />

      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        {/* Setup */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
            <Target className="h-4 w-4 text-foreground" /> Setup
          </h2>
          <div className="space-y-3">
            <Field label="Partner">
              <select value={partner} onChange={e => setPartner(e.target.value)} className={inputCls}>
                {PARTNERS.map(p => <option key={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Region">
              <select value={region} onChange={e => setRegion(e.target.value as RegionCode)} className={inputCls}>
                {REGIONS.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}
              </select>
            </Field>
            <Field label="Target vertical">
              <select value={vertical} onChange={e => setVertical(e.target.value)} className={inputCls}>
                {VERTICALS.map(v => <option key={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="Target ICP">
              <select value={icp} onChange={e => setIcp(e.target.value)} className={inputCls}>
                {ICP_SEGMENTS.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
              </select>
            </Field>
            <Field label="Demo booking target">
              <input
                type="number" min={1} value={target}
                onChange={e => setTarget(Number(e.target.value) || 0)}
                className={inputCls}
              />
            </Field>
            <button className="mt-2 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Launch Blitz Day
            </button>
          </div>
        </div>

        {/* Live + recos */}
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
              <Zap className="h-4 w-4 text-foreground" /> Live progress
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" /> Live
              </span>
            </h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <KpiCard label="Calls" value={live.calls} icon={Phone} />
              <KpiCard label="Demos booked" value={`${live.demosBooked}/${target}`} icon={CalendarCheck} trend="up" delta="on track" />
              <KpiCard label="Demos held" value={live.demosHeld} icon={Users} />
              <KpiCard label="No-shows" value={live.noShows} trend="down" delta="−1 vs avg" icon={Users} />
              <KpiCard label="Deals created" value={live.dealsCreated} icon={Trophy} />
              <KpiCard label="MRR created" value={formatEUR(live.mrrCreated)} icon={Sparkles} trend="up" />
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Smart recommendations for {stats.name}
            </h3>
            <ul className="space-y-2">
              {recs.map((r, i) => (
                <li key={i} className="rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm">{r}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between px-5 py-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Recommended call list
              </h3>
              <span className="text-xs text-muted-foreground">{recommendedCompanies.length} companies matching ICP</span>
            </div>
            <div className="divide-y divide-border">
              {recommendedCompanies.length === 0 && (
                <div className="px-5 py-6 text-sm text-muted-foreground">No companies match the current filters. Try a different vertical or ICP.</div>
              )}
              {recommendedCompanies.map((d, i) => (
                <div key={d.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                  <span className={cn(
                    "grid h-7 w-7 place-items-center rounded-full text-xs font-semibold",
                    i < 3 ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground",
                  )}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{d.company}</div>
                    <div className="text-xs text-muted-foreground">{d.contact} · {d.employees} emp. · {d.vertical}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Stage</div>
                    <div className="text-xs font-medium">{d.stage}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Pot. MRR</div>
                    <div className="text-xs font-semibold tabular-nums">{formatEUR(d.mrr)}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Historical Blitz Days</h3>
            <div className="grid gap-3 md:grid-cols-3">
              {["Blitz Q3 2025 · Deloitte", "Blitz Q2 2025 · Mazars", "Blitz Q1 2025 · EY"].map((h, i) => {
                const closed = DEALS.filter(d => isClosedWon(d)).slice(i * 5, i * 5 + 6);
                const demos = DEALS.filter(d => isDemoBooked(d)).slice(i * 8, i * 8 + 12);
                const mrr = closed.reduce((s, x) => s + x.mrr, 0);
                return (
                  <div key={h} className="rounded-lg border border-border p-3">
                    <div className="text-sm font-medium">{h}</div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                      <div><div className="font-semibold text-foreground">{demos.length}</div>Demos</div>
                      <div><div className="font-semibold text-foreground">{closed.length}</div>Closed</div>
                      <div><div className="font-semibold text-foreground">{formatEUR(mrr)}</div>MRR</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

const inputCls = "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
