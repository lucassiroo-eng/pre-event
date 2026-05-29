import { useMemo, useState } from "react";
import { X, ExternalLink, FileImage, Check, Maximize2, TrendingUp, Layers, Clock, Trophy } from "lucide-react";
import { formatEUR, REGIONS, type RegionCode } from "@/data/mockData";
import { groupIndustry, industryColorClass } from "@/lib/industryGroups";
import type { HubspotWonDeal, SyncResult } from "@/lib/hubspot.functions";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const REGION_NAME: Record<string, string> = Object.fromEntries(
  REGIONS.map((r) => [r.code, r.name]),
);

function hubspotUrl(portalId: number | null, dealId: string): string {
  if (portalId) return `https://app.hubspot.com/contacts/${portalId}/deal/${dealId}`;
  return `https://app.hubspot.com/contacts/0/record/0-3/${dealId}`;
}

export type SlideSection = "topMrr" | "topIndustries" | "recent";

interface Props {
  code: RegionCode;
  sync: SyncResult;
  onClose: () => void;
  onGenerateSlide: (sections: SlideSection[]) => void;
}

function IndustryPill({ value, asGroup = false }: { value: string | null | undefined; asGroup?: boolean }) {
  const label = asGroup
    ? (value && value.trim() ? value : "Unknown")
    : (value && value.trim() ? groupIndustry(value) : "Unknown");
  const color = industryColorClass(asGroup ? label : value);
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
      color,
    )}>
      {label}
    </span>
  );
}

export function RegionLiveDetail({ code, sync, onClose, onGenerateSlide }: Props) {
  const regionDeals = useMemo(
    () => sync.deals.filter((d) => d.regionCode === code),
    [sync.deals, code],
  );

  const dealsByMrr = useMemo(
    () => [...regionDeals]
      .filter((d) => d.isWon && (d.mrr ?? 0) > 0)
      .sort((a, b) => (b.mrr ?? 0) - (a.mrr ?? 0)),
    [regionDeals],
  );
  const topByMrr = dealsByMrr.slice(0, 3);

  const allIndustries = useMemo(() => {
    const map = new Map<string, { count: number; biggest: HubspotWonDeal | null }>();
    for (const d of regionDeals) {
      if (!d.isWon) continue;
      const g = groupIndustry(d.industry);
      if (g === "Other" || g === "Unknown") continue;
      const cur = map.get(g) ?? { count: 0, biggest: null };
      cur.count += 1;
      if (!cur.biggest || (d.mrr ?? 0) > (cur.biggest.mrr ?? 0)) cur.biggest = d;
      map.set(g, cur);
    }
    return Array.from(map.entries())
      .map(([industry, v]) => ({ industry, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [regionDeals]);
  const topIndustries = allIndustries.slice(0, 3);

  const demoIndustries = useMemo(() => {
    const map = new Map<string, { count: number; biggest: HubspotWonDeal | null }>();
    for (const d of regionDeals) {
      if (!d.dateEnteredDemoStage) continue;
      const g = groupIndustry(d.industry);
      if (g === "Other" || g === "Unknown") continue;
      const cur = map.get(g) ?? { count: 0, biggest: null };
      cur.count += 1;
      if (!cur.biggest || (d.mrr ?? 0) > (cur.biggest.mrr ?? 0)) cur.biggest = d;
      map.set(g, cur);
    }
    return Array.from(map.entries())
      .map(([industry, v]) => ({ industry, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [regionDeals]);
  const topDemoIndustries = demoIndustries.slice(0, 3);

  const totalMrr = regionDeals.reduce((acc, d) => acc + (d.mrr ?? 0), 0);

  const [picker, setPicker] = useState(false);
  const [selected, setSelected] = useState<Record<SlideSection, boolean>>({
    topMrr: true, topIndustries: true, recent: true,
  });
  const toggle = (k: SlideSection) => setSelected((s) => ({ ...s, [k]: !s[k] }));

  const [openDialog, setOpenDialog] = useState<null | "topMrr" | "topIndustries" | "recent">(null);

  return (
    <div className="flex h-full w-full flex-col bg-card">
      <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Closed-Won deals · HubSpot
          </div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            {REGION_NAME[code] ?? code}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary">
              {regionDeals.length} deal{regionDeals.length === 1 ? "" : "s"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-0.5 font-medium text-success">
              MRR {formatEUR(totalMrr)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPicker((p) => !p)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            <FileImage className="h-3.5 w-3.5" /> Generate slide
          </button>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {picker && (
        <div className="border-b border-border bg-muted/30 px-6 py-3">
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            Pick sections to include in the slide
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {([
              ["topMrr", "Top 3 clients"],
              ["topIndustries", "Top 3 industries per clients"],
              ["recent", "Top 3 industries per demo"],
            ] as [SlideSection, string][]).map(([k, label]) => (
              <button
                key={k}
                onClick={() => toggle(k)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition",
                  selected[k]
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-muted",
                )}
              >
                {selected[k] && <Check className="h-3 w-3" />} {label}
              </button>
            ))}
            <div className="flex-1" />
            <button
              onClick={() => {
                const sections = (Object.keys(selected) as SlideSection[]).filter((k) => selected[k]);
                if (sections.length === 0) return;
                onGenerateSlide(sections);
              }}
              className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              Generate
            </button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 px-6 py-5 space-y-4">
        <ClickableBlock
          icon={<TrendingUp className="h-4 w-4" />}
          title="Top clients · by wons"
          accent="from-emerald-500/15 to-emerald-500/0"
          iconBg="bg-emerald-500/15 text-emerald-700"
          onExpand={() => setOpenDialog("topMrr")}
          expandLabel={`See all ${dealsByMrr.length} clients`}
        >
          <DealsList deals={topByMrr} portalId={sync.portalId} empty="No MRR data." />
        </ClickableBlock>

        <ClickableBlock
          icon={<Layers className="h-4 w-4" />}
          title="Top industries per clients"
          accent="from-violet-500/15 to-violet-500/0"
          iconBg="bg-violet-500/15 text-violet-700"
          onExpand={() => setOpenDialog("topIndustries")}
          expandLabel={`See all ${allIndustries.length} industries`}
        >
          <IndustriesList rows={topIndustries} />
        </ClickableBlock>

        <ClickableBlock
          icon={<Clock className="h-4 w-4" />}
          title="Top industries per demos"
          accent="from-sky-500/15 to-sky-500/0"
          iconBg="bg-sky-500/15 text-sky-700"
          onExpand={() => setOpenDialog("recent")}
          expandLabel={`See all ${demoIndustries.length} industries`}
        >
          <IndustriesList rows={topDemoIndustries} countLabel="# Demos" />
        </ClickableBlock>
      </div>

      <Dialog open={openDialog !== null} onOpenChange={(o) => !o && setOpenDialog(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {openDialog === "topMrr" && `All deals by MRR · ${REGION_NAME[code] ?? code}`}
              {openDialog === "topIndustries" && `All industries · ${REGION_NAME[code] ?? code}`}
              {openDialog === "recent" && `All industries by demos · ${REGION_NAME[code] ?? code}`}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto">
            {openDialog === "topMrr" && (
              <DealsList deals={dealsByMrr} portalId={sync.portalId} empty="No MRR data." />
            )}
            {openDialog === "topIndustries" && (
              <IndustriesList rows={allIndustries} />
            )}
            {openDialog === "recent" && (
              <IndustriesList rows={demoIndustries} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClickableBlock({
  icon, title, subtitle, accent, iconBg, onExpand, expandLabel, children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  accent: string;
  iconBg: string;
  onExpand: () => void;
  expandLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="group relative overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:shadow-md">
      <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b", accent)} />
      <header className="relative flex items-center justify-between gap-3 px-4 pt-4 pb-3">
        <div className="flex items-center gap-2.5">
          <span className={cn("grid h-8 w-8 place-items-center rounded-lg", iconBg)}>
            {icon}
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        <button
          onClick={onExpand}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {expandLabel} <Maximize2 className="h-3 w-3" />
        </button>
      </header>
      <div className="relative px-4 pb-4">{children}</div>
    </section>
  );
}

function IndustriesList({
  rows,
  countLabel = "# Deals",
}: { rows: { industry: string; count: number; biggest: HubspotWonDeal | null }[]; countLabel?: string }) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">No industry data.</p>;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Industry</th>
            <th className="px-3 py-2 text-right font-medium">{countLabel}</th>
            <th className="px-3 py-2 text-left font-medium">Biggest MRR company</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.industry} className="border-t border-border">
              <td className="px-3 py-2"><IndustryPill value={row.industry} asGroup /></td>
              <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">{row.count}</td>
              <td className="px-3 py-2 text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Trophy className="h-3 w-3 text-amber-500" />
                  <span className="font-medium text-foreground">
                    {row.biggest?.companyName ?? row.biggest?.dealname ?? "—"}
                  </span>
                  {row.biggest?.mrr != null && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-foreground">
                      {formatEUR(row.biggest.mrr)}
                    </span>
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DealsList({
  deals, portalId, empty,
}: { deals: HubspotWonDeal[]; portalId: number | null; empty: string }) {
  if (deals.length === 0) return <p className="text-xs text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Company</th>
            <th className="px-3 py-2 text-left font-medium">City</th>
            <th className="px-3 py-2 text-left font-medium">Industry</th>
            <th className="px-3 py-2 text-right font-medium">MRR</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((d) => (
            <tr key={d.dealId} className="border-t border-border">
              <td className="px-3 py-2">
                <a
                  href={hubspotUrl(portalId, d.dealId)}
                  target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 font-medium text-foreground hover:underline"
                >
                  {d.companyName ?? d.dealname ?? "—"}
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </a>
              </td>
              <td className="px-3 py-2 text-muted-foreground">{d.city ?? "—"}</td>
              <td className="px-3 py-2"><IndustryPill value={d.industry} /></td>
              <td className="px-3 py-2 text-right tabular-nums">
                {d.mrr != null ? formatEUR(d.mrr) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
