import { useMemo, useState } from "react";
import { X, FileImage, ChevronRight, Users, BarChart3 } from "lucide-react";
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

function IndustryPill({ value, active, onClick }: { value: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset transition-all",
        industryColorClass(value),
        active && "ring-2 shadow-sm scale-105",
        onClick && "cursor-pointer hover:scale-105",
      )}
    >
      {value}
    </button>
  );
}

function ModuleBar({ module, count, pct, max }: { module: string; count: number; pct: number; max: number }) {
  const ratio = max > 0 ? count / max : 0;
  return (
    <div className="group flex items-center gap-3">
      <div className="w-24 shrink-0 truncate text-[11px] font-semibold text-foreground" title={module}>{module}</div>
      <div className="flex-1 overflow-hidden rounded-full bg-muted h-2">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <div className="w-16 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
        {count} <span className="opacity-60">({pct}%)</span>
      </div>
    </div>
  );
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
      cur.count += 1;
      cur.mrr += d.totalActualMrr;
      map.set(g, cur);
    }
    return Array.from(map.entries())
      .map(([industry, v]) => ({ industry, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [deals]);

  // Module split for the selected industry (country-wide for significance)
  const moduleSplit = useMemo(() => {
    if (!selectedIndustry) return [];
    return countModulesForIndustry(allDeals, selectedIndustry, country).slice(0, 5);
  }, [selectedIndustry, allDeals, country]);

  const totalMrr = deals.reduce((acc, d) => acc + d.totalActualMrr, 0);
  const maxModuleCount = moduleSplit[0]?.count ?? 1;

  return (
    <div className="flex h-full w-full flex-col bg-card">
      {/* ── Header ────────────────────────────────────────────────────────────── */}
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
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-semibold text-emerald-700 dark:text-emerald-400">
              MRR {formatEUR(totalMrr)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onGenerateSlide}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
          >
            <FileImage className="h-3.5 w-3.5" /> Slide
          </button>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────────── */}
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
              Ver todos <ChevronRight className="h-3 w-3" />
            </button>
          </header>
          <div className="px-4 pb-4">
            <ClientsTable deals={clientsByMrr.slice(0, 5)} />
          </div>
        </section>

        {/* Industries + module split */}
        <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <header className="flex items-center gap-2 px-4 pt-4 pb-3 bg-gradient-to-b from-violet-500/10 to-transparent">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-violet-500/15 text-violet-700">
              <BarChart3 className="h-3.5 w-3.5" />
            </span>
            <h3 className="text-sm font-semibold">Industrias · módulos</h3>
          </header>

          <div className="px-4 pb-4 space-y-4">
            {/* Industry pills — clickable */}
            <div className="flex flex-wrap gap-1.5">
              {industries.map(({ industry, count }) => (
                <button
                  key={industry}
                  onClick={() => setSelectedIndustry(selectedIndustry === industry ? null : industry)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset transition-all",
                    industryColorClass(industry),
                    selectedIndustry === industry && "ring-2 shadow-md scale-105",
                  )}
                >
                  {industry}
                  <span className="opacity-70">{count}</span>
                </button>
              ))}
            </div>

            {/* Module split for selected industry */}
            {selectedIndustry && (
              <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Módulos · {selectedIndustry} · país
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {allDeals.filter((d) => groupIndustry(d.sector) === selectedIndustry).length} contratos
                  </span>
                </div>

                {moduleSplit.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin datos de módulos para esta industria.</p>
                ) : (
                  moduleSplit.map(({ module, count, pct }) => (
                    <ModuleBar key={module} module={module} count={count} pct={pct} max={maxModuleCount} />
                  ))
                )}
              </div>
            )}

            {/* Summary table */}
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Sector</th>
                    <th className="px-3 py-2 text-right font-medium">Wons</th>
                    <th className="px-3 py-2 text-right font-medium">MRR región</th>
                  </tr>
                </thead>
                <tbody>
                  {industries.map(({ industry, count, mrr }) => (
                    <tr
                      key={industry}
                      className={cn(
                        "border-t border-border cursor-pointer transition-colors",
                        selectedIndustry === industry ? "bg-primary/5" : "hover:bg-muted/30",
                      )}
                      onClick={() => setSelectedIndustry(selectedIndustry === industry ? null : industry)}
                    >
                      <td className="px-3 py-2">
                        <IndustryPill value={industry} active={selectedIndustry === industry} />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">{count}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground text-xs">{formatEUR(mrr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      {/* ── Clients dialog ─────────────────────────────────────────────────────── */}
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
                <IndustryPill value={groupIndustry(d.sector)} />
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
