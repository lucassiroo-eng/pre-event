import { useMemo, useState } from "react";
import { X, FileImage, ChevronRight, Users, BarChart3, ChevronDown } from "lucide-react";
import { formatEUR, REGIONS, type WonDeal } from "@/lib/csvStore";
import { groupIndustry, industryColorClass } from "@/lib/industryGroups";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { countModulesForIndustry } from "@/lib/bundleModules";
import { useHideMrr } from "@/lib/useHideMrr";
import { useT } from "@/lib/i18n";

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
  const hideMrr = useHideMrr();
  const t = useT();

  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null);
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [showAllInd, setShowAllInd] = useState(false);

  const TOP_N = 4;

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

      {/* Header — compact */}
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t("region.label")}</div>
          <h2 className="truncate text-xl font-semibold tracking-tight text-foreground">
            {REGION_NAME[code] ?? code}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
              <Users className="h-3 w-3" />
              {deals.length} {t("picker.wons")}
            </span>
            {!hideMrr && (
              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-700 dark:text-emerald-400">
                MRR {formatEUR(totalMrr)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onGenerateSlide}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
          >
            <FileImage className="h-3.5 w-3.5" /> {t("region.slide")}
          </button>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 space-y-4">

        {/* Top clientes — flat, no nested card */}
        <section>
          <header className="mb-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-emerald-600" />
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {hideMrr ? t("region.topClients") : t("region.topClientsMrr")}
              </h3>
            </div>
            <button
              onClick={() => setClientDialogOpen(true)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              {t("region.viewAll")} {clientsByMrr.length} <ChevronRight className="h-3 w-3" />
            </button>
          </header>
          <ClientsTable deals={clientsByMrr.slice(0, 3)} hideMrr={hideMrr} t={t} />
        </section>

        {/* Industrias + drill-down de módulos — flat */}
        <section>
          <header className="mb-2 flex items-center gap-2">
            <BarChart3 className="h-3.5 w-3.5 text-violet-600" />
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t("region.industriesModules")}</h3>
          </header>

          <div className="space-y-1">
            {(showAllInd ? industries : industries.slice(0, TOP_N)).map(({ industry, count, mrr }) => {
              const isOpen = selectedIndustry === industry;
              return (
                <div key={industry}>
                  <button
                    onClick={() => setSelectedIndustry(isOpen ? null : industry)}
                    className={cn(
                      "w-full flex items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors",
                      isOpen ? "bg-primary/10" : "hover:bg-muted/60",
                    )}
                  >
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                      industryColorClass(industry),
                    )}>
                      {industry}
                    </span>
                    <span className="tabular-nums text-sm font-bold text-foreground">{count}</span>
                    {!hideMrr && <span className="text-[11px] text-muted-foreground tabular-nums">{formatEUR(mrr)}</span>}
                    <ChevronDown className={cn("ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                  </button>

                  {isOpen && (
                    <div className="mx-1 my-1 rounded-lg bg-muted/40 px-3 py-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("region.modulesCountry")}</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">{countryDealsForIndustry} {t("region.contracts")}</span>
                      </div>
                      {moduleSplit.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-1">{t("region.noModuleData")}</p>
                      ) : (
                        moduleSplit.map(({ module, count: mc, pct }) => (
                          <div key={module} className="flex items-center gap-3">
                            <span className="w-24 shrink-0 truncate text-[11px] font-semibold text-foreground" title={module}>{module}</span>
                            <div className="flex-1 overflow-hidden rounded-full bg-muted h-1.5">
                              <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${(mc / maxBar) * 100}%` }} />
                            </div>
                            <span className="w-14 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">{mc} <span className="opacity-60">({pct}%)</span></span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {industries.length > TOP_N && (
              <button
                onClick={() => setShowAllInd((v) => !v)}
                className="mt-1 inline-flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
              >
                {showAllInd ? t("region.viewLess") : `${t("region.viewMore")} (${industries.length - TOP_N})`}
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAllInd && "rotate-180")} />
              </button>
            )}
          </div>
        </section>
      </div>

      {/* Clients dialog */}
      <Dialog open={clientDialogOpen} onOpenChange={setClientDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("region.allClients")} · {REGION_NAME[code] ?? code}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto">
            <ClientsTable deals={clientsByMrr} hideMrr={hideMrr} t={t} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClientsTable({ deals, hideMrr = false, t }: { deals: WonDeal[]; hideMrr?: boolean; t: (k: string) => string }) {
  if (deals.length === 0) return <p className="text-xs text-muted-foreground py-2">{t("region.noData")}</p>;
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">{t("region.empresa")}</th>
            <th className="px-3 py-2 text-left font-medium">{t("region.sector")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("region.seats")}</th>
            {!hideMrr && <th className="px-3 py-2 text-right font-medium">MRR</th>}
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
              {!hideMrr && <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatEUR(d.totalActualMrr)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
