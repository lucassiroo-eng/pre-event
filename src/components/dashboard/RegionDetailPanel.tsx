import { X, ExternalLink, ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  type RegionCode, formatEUR, formatDate, hubspotDealUrl, regionName,
} from "@/data/mockData";
import {
  computeRegionStats, lastDemosBooked, lastDemosHeld, lastClosedDeals, topClosedDeals,
  topVerticalsInRegion, topIcpInRegion,
} from "@/data/regionMetrics";
import { dealsByRegion } from "@/data/mockData";
import { cn } from "@/lib/utils";

interface Props {
  code: RegionCode;
  onClose: () => void;
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="border-t border-border px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function DealRow({ d, mode }: { d: import("@/data/mockData").Deal; mode: "demo" | "held" | "closed" | "top" }) {
  const dateLabel = mode === "demo" ? d.demoBookedAt : mode === "held" ? d.demoHeldAt : d.closedAt;
  return (
    <a
      href={hubspotDealUrl(d.hubspotId)}
      target="_blank" rel="noreferrer"
      className="group flex items-start gap-3 rounded-lg border border-transparent p-2.5 transition hover:border-border hover:bg-muted/50"
    >
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-accent/40 text-xs font-semibold text-foreground">
        {d.company.split(" ").slice(-1)[0].slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{d.company}</span>
          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {d.contact} · {d.vertical} · {d.employees} emp.
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">{d.owner}</span>
          {d.partner && <span className="rounded-full bg-accent/30 px-2 py-0.5">{d.partner}</span>}
          <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">{d.stage}</span>
        </div>
      </div>
      <div className="text-right text-xs">
        <div className="font-semibold text-foreground tabular-nums">{formatEUR(d.mrr)}/mo</div>
        <div className="text-muted-foreground">{formatDate(dateLabel)}</div>
      </div>
    </a>
  );
}

export function RegionDetailPanel({ code, onClose }: Props) {
  const stats = computeRegionStats(code);
  const deals = dealsByRegion(code);
  const demos = lastDemosBooked(deals, 3);
  const held = lastDemosHeld(deals, 3);
  const closed = lastClosedDeals(deals, 3);
  const top = topClosedDeals(deals, 6, 3);
  const verticals = topVerticalsInRegion(code, 3);
  const icps = topIcpInRegion(code, 3);

  return (
    <div className="flex h-full w-full flex-col bg-card">
      <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-5">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Region insights</div>
          <h2 className="mt-1 text-xl font-semibold text-foreground">{regionName(code)}</h2>
        </div>
        <div className="flex items-center gap-1">
          <Link
            to="/regions/$code" params={{ code }}
            className="hidden sm:inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:bg-muted"
          >
            Open page <ArrowRight className="h-3 w-3" />
          </Link>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 px-5 pb-4 sm:grid-cols-4">
        {[
          { k: "Demos", v: stats.demosBooked },
          { k: "Closed", v: stats.dealsClosed },
          { k: "MRR", v: formatEUR(stats.mrr) },
          { k: "Conv.", v: `${(stats.conversion * 100).toFixed(0)}%` },
        ].map(s => (
          <div key={s.k} className="rounded-lg bg-muted/50 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">{s.k}</div>
            <div className="text-sm font-semibold tabular-nums">{s.v}</div>
          </div>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Last 3 demos booked">
          <p className="mb-2 text-[11px] text-muted-foreground">Sorted by demo booked date · current stage reflects where the deal is today.</p>
          {demos.length ? demos.map(d => <DealRow key={d.id} d={d} mode="demo" />)
            : <p className="text-xs text-muted-foreground">No recent demos.</p>}
        </Section>

        <Section title="Last 3 demos held">
          <p className="mb-2 text-[11px] text-muted-foreground">Sorted by demo held date.</p>
          {held.length ? held.map(d => <DealRow key={d.id} d={d} mode="held" />)
            : <p className="text-xs text-muted-foreground">No demos held yet.</p>}
        </Section>

        <Section title="Last 3 deals closed">
          {closed.length ? closed.map(d => <DealRow key={d.id} d={d} mode="closed" />)
            : <p className="text-xs text-muted-foreground">No recent closed deals.</p>}
        </Section>

        <Section title="Top 3 closed deals — last 6 months">
          {top.length ? top.map(d => <DealRow key={d.id} d={d} mode="top" />)
            : <p className="text-xs text-muted-foreground">No closed deals in this period.</p>}
        </Section>

        <Section title="Top verticals">
          <div className="space-y-2">
            {verticals.map((v, i) => (
              <div key={v.vertical} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
                <div className="flex items-center gap-3">
                  <span className={cn("grid h-6 w-6 place-items-center rounded-full text-xs font-semibold",
                    i === 0 ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground")}>{i + 1}</span>
                  <span className="font-medium">{v.vertical}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{v.volume} won</span>
                  <span>{(v.conversion * 100).toFixed(0)}% conv.</span>
                  <span className="font-semibold text-foreground">{formatEUR(v.mrr)}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Top ICP segments">
          <div className="space-y-2">
            {icps.map((i, idx) => (
              <div key={i.icpId} className="rounded-lg border border-border p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("grid h-6 w-6 place-items-center rounded-full text-xs font-semibold",
                      idx === 0 ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground")}>{idx + 1}</span>
                    <span className="font-medium">{i.label}</span>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2 text-[11px] text-muted-foreground">
                  <div><div className="font-semibold text-foreground">{i.matching}</div>Matching</div>
                  <div><div className="font-semibold text-foreground">{i.demos}</div>Demos</div>
                  <div><div className="font-semibold text-foreground">{i.closed}</div>Closed</div>
                  <div><div className="font-semibold text-foreground">{formatEUR(i.avgMrr)}</div>Avg MRR</div>
                </div>
              </div>
            ))}
          </div>
        </Section>

      </div>
    </div>
  );
}
