import { useMemo, useState } from "react";
import { X, FileImage, Maximize2, TrendingUp, Layers } from "lucide-react";
import { formatEUR, REGIONS, type WonDeal } from "@/lib/csvStore";
import { groupIndustry, industryColorClass } from "@/lib/industryGroups";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const REGION_NAME: Record<string, string> = Object.fromEntries(
  REGIONS.map((r) => [r.code, r.name]),
);

interface Props {
  code: string;
  deals: WonDeal[];
  allDeals: WonDeal[];
  onClose: () => void;
  onGenerateSlide: () => void;
}

function IndustryPill({ value }: { value: string }) {
  const color = industryColorClass(value);
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", color)}>
      {value}
    </span>
  );
}

export function RegionDetail({ code, deals, onClose, onGenerateSlide }: Props) {
  const dealsByMrr = useMemo(
    () => [...deals].filter((d) => d.totalActualMrr > 0).sort((a, b) => b.totalActualMrr - a.totalActualMrr),
    [deals],
  );
  const topByMrr = dealsByMrr.slice(0, 3);

  const allIndustries = useMemo(() => {
    const map = new Map<string, { count: number; biggest: WonDeal | null }>();
    for (const d of deals) {
      const g = groupIndustry(d.sector);
      if (g === "Other" || g === "Unknown") continue;
      const cur = map.get(g) ?? { count: 0, biggest: null };
      cur.count += 1;
      if (!cur.biggest || d.totalActualMrr > cur.biggest.totalActualMrr) cur.biggest = d;
      map.set(g, cur);
    }
    return Array.from(map.entries())
      .map(([industry, v]) => ({ industry, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [deals]);
  const topIndustries = allIndustries.slice(0, 3);

  const totalMrr = deals.reduce((acc, d) => acc + d.totalActualMrr, 0);

  const [openDialog, setOpenDialog] = useState<null | "topMrr" | "topIndustries">(null);

  return (
    <div className="flex h-full w-full flex-col bg-card">
      <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Wons · CSV
          </div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            {REGION_NAME[code] ?? code}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary">
              {deals.length} won{deals.length === 1 ? "" : "s"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-0.5 font-medium text-success">
              MRR {formatEUR(totalMrr)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onGenerateSlide()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            <FileImage className="h-3.5 w-3.5" /> Generate slide
          </button>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 px-6 py-5 space-y-4">
        <ClickableBlock
          icon={<TrendingUp className="h-4 w-4" />}
          title="Top clients · by MRR"
          accent="from-emerald-500/15 to-emerald-500/0"
          iconBg="bg-emerald-500/15 text-emerald-700"
          onExpand={() => setOpenDialog("topMrr")}
          expandLabel={`See all ${dealsByMrr.length}`}
        >
          <DealsList deals={topByMrr} />
        </ClickableBlock>

        <ClickableBlock
          icon={<Layers className="h-4 w-4" />}
          title="Top sectores"
          accent="from-violet-500/15 to-violet-500/0"
          iconBg="bg-violet-500/15 text-violet-700"
          onExpand={() => setOpenDialog("topIndustries")}
          expandLabel={`See all ${allIndustries.length}`}
        >
          <IndustriesList rows={topIndustries} />
        </ClickableBlock>
      </div>

      <Dialog open={openDialog !== null} onOpenChange={(o) => !o && setOpenDialog(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {openDialog === "topMrr" && `All deals by MRR · ${REGION_NAME[code] ?? code}`}
              {openDialog === "topIndustries" && `All sectors · ${REGION_NAME[code] ?? code}`}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto">
            {openDialog === "topMrr" && <DealsList deals={dealsByMrr} />}
            {openDialog === "topIndustries" && <IndustriesList rows={allIndustries} />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClickableBlock({
  icon, title, accent, iconBg, onExpand, expandLabel, children,
}: {
  icon: React.ReactNode; title: string; accent: string; iconBg: string;
  onExpand: () => void; expandLabel: string; children: React.ReactNode;
}) {
  return (
    <section className="group relative overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:shadow-md">
      <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b", accent)} />
      <header className="relative flex items-center justify-between gap-3 px-4 pt-4 pb-3">
        <div className="flex items-center gap-2.5">
          <span className={cn("grid h-8 w-8 place-items-center rounded-lg", iconBg)}>{icon}</span>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
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

function IndustriesList({ rows }: { rows: { industry: string; count: number; biggest: WonDeal | null }[] }) {
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">No data.</p>;
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Sector</th>
            <th className="px-3 py-2 text-right font-medium"># Wons</th>
            <th className="px-3 py-2 text-left font-medium">Biggest MRR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.industry} className="border-t border-border">
              <td className="px-3 py-2"><IndustryPill value={row.industry} /></td>
              <td className="px-3 py-2 text-right tabular-nums font-medium">{row.count}</td>
              <td className="px-3 py-2 text-muted-foreground">
                <span className="font-medium text-foreground">{row.biggest?.companyName ?? "—"}</span>
                {row.biggest && <span className="ml-1.5 text-[10px] tabular-nums">{formatEUR(row.biggest.totalActualMrr)}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DealsList({ deals }: { deals: WonDeal[] }) {
  if (deals.length === 0) return <p className="text-xs text-muted-foreground">No data.</p>;
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Company</th>
            <th className="px-3 py-2 text-left font-medium">Sector</th>
            <th className="px-3 py-2 text-right font-medium">Seats</th>
            <th className="px-3 py-2 text-right font-medium">MRR</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((d) => (
            <tr key={d.companyId} className="border-t border-border">
              <td className="px-3 py-2 font-medium text-foreground">{d.companyName}</td>
              <td className="px-3 py-2"><IndustryPill value={groupIndustry(d.sector)} /></td>
              <td className="px-3 py-2 text-right tabular-nums">{d.seats || "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums font-medium">{formatEUR(d.totalActualMrr)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
