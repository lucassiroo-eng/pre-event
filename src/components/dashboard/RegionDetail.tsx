import { useMemo, useState } from "react";
import { X, FileImage, ChevronRight, Users, BarChart3, ChevronDown } from "lucide-react";
import { formatEUR, REGIONS, type WonDeal } from "@/lib/csvStore";
import { groupIndustry, industryColorClass } from "@/lib/industryGroups";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { countModulesForIndustry } from "@/lib/bundleModules";

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

export function RegionDetail({ code, deals, allDeals, onClose, onGenerateSlide }: Props) {
  const country = deals[0]?.country ?? allDeals[0]?.country ?? "fr";

  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null);
  const [clientDialogOpen, setClientDialogOpen] = useState(false);

  const clientsByMrr = useMemo(
    () => [...deals].filter((d) => d.totalActualMrr > 0).sort((a, b) => b.totalActualMrr - a.totalActualMrr),
    [deals],
  );

  // Industries in this region, sorted by # wons
  const industries = useMemo(() => {
    const map = new Map<string, { count: number; mrr: number }>();
    for (const d of deals) {
      const g = groupIndustry(d.sector);
      if (g === "Other" || g === "Unknown") continue;
      const cur = map.get(g) ?? { count: 0, mrr: 0 };
      cur.count++;
      cur.mrr += d.totalActualMrr;
      map.set(g, cur);
    }
    return Array.from(map.entries())
      .map(([industry, v]) => ({ industry, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [deals]);

  // Module split for the selected industry (country-wide for statistical significance)
  const moduleSplit = useMemo(() => {
    if (!selectedIndustry) return [];
    return countModulesForIndustry(allDeals, selectedIndustry, country).slice(0, 5);
  }, [selectedIndustry, allDeals, country]);

  const countryDealsForIndustry = selectedIndustry
    ? allDeals.filter((d) => groupIndustry(d.sector) === selectedIndustry).length
    : 0;

  const totalMrr = deals.reduce((acc, d) => acc + d.totalActualMrr, 0);
  const maxBar = moduleSplit[0]?.count ?? 1;

  return (
    <div className="flex h-full w-full flex-col bg-card">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Región</div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            {REGION_NAME[code] ?? code}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 font-semibold text-primary">
              <Users className="h-3 w-3" />
              {deals.length} won{deals.length === 1 ? "" : "s"}
            </span>
            <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-semibold text-emerald-700 dark:text-emerald-400">
              MRR {formatEUR(totalMrr)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onGenerateSlide}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
          >
            <FileImage className="h-3.5 w-3.5" /> Slide
          </button>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto space-y-4 px-6 py-5">

        {/* Top clients */}
        <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <header className="flex items-center justify-between gap-3 px-4 pt-4 pb-3 bg-gradient-to-b from-emerald-500/10 to-transparent">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-500/15 text-emerald-700">
                <Users className="h-3.5 w-3.5" />
              </span>
              <h3 className="text-sm font-semibold">Top clients · MRR</h3>
            </div>
            <button
              onClick={() => setClientDialogOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Ver todos {clientsByMrr.length} <ChevronRight className="h-3 w-3" />
            </button>
          </header>
          <div className="px-4 pb-4">
            <ClientsTable deals={clientsByMrr.slice(0, 5)} />
          </div>
        </section>

        {/* Industries + module drill-down */}
        <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <header className="flex items-center gap-2 px-4 pt-4 pb-3 bg-gradient-to-b from-violet-500/10 to-transparent">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-violet-500/15 text-violet-700">
              <BarChart3 className="h-3.5 w-3.5" />
            </span>
            <h3 className="text-sm font-semibold">Industrias · módulos</h3>
            <span className="ml-auto text-[11px] text-muted-foreground">clic para ver módulos</span>
          </header>

          <div className="px-4 pb-4 space-y-3">
            {/* Industry pills — each pill is a clickable row showing count */}
            <div className="space-y-1.5">
              {industries.map(({ industry, count, mrr }) => {
                const isOpen = selectedIndustry === industry;
                return (
                  <div key={industry}>
                    <button
                      onClick={() => setSelectedIndustry(isOpen ? null : industry)}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                        isOpen ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/50 border border-transparent",
                      )}
                    >
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                        industryColorClass(industry),
                      )}>
                        {industry}
                      </span>
                      <span className="tabular-nums text-xs font-semibold text-foreground">{count}</span>
                      <span className="text-xs text-muted-foreground">{formatEUR(mrr)}</span>
                      <ChevronDown className={cn("ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                    </button>

                    {/* Module breakdown — inline expand */}
                    {isOpen && (
                      <div className="mx-1 mb-1 rounded-lg border border-border bg-muted/30 px-4 py-3 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Módulos · país
                          </span>
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {countryDealsForIndustry} contratos (país)
                          </span>
                        </div>

                        {moduleSplit.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-1">
                            Sin datos de módulos — plan no reconocido en el catálogo.
                          </p>
                        ) : (
                          moduleSplit.map(({ module, count: mc, pct }) => (
                            <div key={module} className="flex items-center gap-3">
                              <span className="w-28 shrink-0 truncate text-[11px] font-semibold text-foreground" title={module}>
                                {module}
                              </span>
                              <div className="flex-1 overflow-hidden rounded-full bg-muted h-1.5">
                                <div
                                  className="h-full rounded-full bg-primary transition-all duration-500"
                                  style={{ width: `${(mc / maxBar) * 100}%` }}
                                />
                              </div>
                              <span className="w-14 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                                {mc} <span className="opacity-60">({pct}%)</span>
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {/* Clients dialog */}
      <Dialog open={clientDialogOpen} onOpenChange={setClientDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Todos los clientes · {REGION_NAME[code] ?? code}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto">
            <ClientsTable deals={clientsByMrr} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClientsTable({ deals }: { deals: WonDeal[] }) {
  if (deals.length === 0) return <p className="text-xs text-muted-foreground py-2">No data.</p>;
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Empresa</th>
            <th className="px-3 py-2 text-left font-medium">Sector</th>
            <th className="px-3 py-2 text-right font-medium">Seats</th>
            <th className="px-3 py-2 text-right font-medium">MRR</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((d) => (
            <tr key={d.companyId} className="border-t border-border hover:bg-muted/30">
              <td className="px-3 py-2 font-medium text-foreground">{d.companyName}</td>
              <td className="px-3 py-2">
                <span className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                  industryColorClass(groupIndustry(d.sector)),
                )}>
                  {groupIndustry(d.sector)}
                </span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{d.seats || "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatEUR(d.totalActualMrr)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
