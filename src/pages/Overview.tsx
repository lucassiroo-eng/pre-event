import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { CountryMap } from "@/components/dashboard/CountryMap";
import { RegionDetail } from "@/components/dashboard/RegionDetail";
import { formatEUR, type WonDeal } from "@/lib/csvStore";
import { useDeals } from "@/lib/useDeals";
import { getCountryConfig, applyCountryTheme, type CountryCode } from "@/lib/countryConfig";
import { groupIndustry } from "@/lib/industryGroups";
import { generateRegionSlide } from "@/lib/generateSlide";
import { readEnrichmentStore } from "@/lib/enrichmentStore";
import { cn } from "@/lib/utils";
import { Target, MapPin, Zap } from "lucide-react";

type MapMetric = "wons" | "mrr";

export function OverviewPage() {
  const navigate = useNavigate();
  const country = window.localStorage.getItem("pre-event-country") ?? "";
  const cfg = getCountryConfig(country);

  useEffect(() => {
    if (!country) { navigate("/"); return; }
    applyCountryTheme(country as CountryCode);
  }, [country, navigate]);

  const { byCountry } = useDeals();
  const deals = useMemo(() => byCountry(country), [byCountry, country]);

  const [metric, setMetric] = useState<MapMetric>("wons");
  const [selected, setSelected] = useState<string | undefined>(undefined);

  const wonsPerRegion = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of deals) {
      if (d.regionCode === "unknown") continue;
      m[d.regionCode] = (m[d.regionCode] ?? 0) + 1;
    }
    return m;
  }, [deals]);

  const mrrPerRegion = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of deals) {
      if (d.regionCode === "unknown") continue;
      m[d.regionCode] = (m[d.regionCode] ?? 0) + d.totalActualMrr;
    }
    return m;
  }, [deals]);

  const topVerticalByRegion = useMemo(() => {
    const counts: Record<string, Record<string, number>> = {};
    for (const d of deals) {
      if (d.regionCode === "unknown") continue;
      const g = groupIndustry(d.sector);
      if (g === "Unknown") continue;
      (counts[d.regionCode] ??= {});
      counts[d.regionCode][g] = (counts[d.regionCode][g] ?? 0) + 1;
    }
    const out: Record<string, string> = {};
    for (const [code, map] of Object.entries(counts)) {
      const top = Object.entries(map).sort((a, b) => b[1] - a[1])[0];
      if (top) out[code] = top[0];
    }
    return out;
  }, [deals]);

  const totalWons = deals.length;
  const totalMrr = deals.reduce((s, d) => s + d.totalActualMrr, 0);
  const withRegion = deals.filter((d) => d.regionCode !== "unknown").length;
  const pctMapped = totalWons > 0 ? ((withRegion / totalWons) * 100).toFixed(0) : "0";

  const handleGenerateSlide = () => {
    if (!selected) return;
    generateRegionSlide(selected, deals, country, readEnrichmentStore());
  };

  const hasSelection = !!selected;

  if (!country) return null;

  return (
    <div className="mx-auto max-w-[1500px] px-6 py-6 lg:px-8 lg:py-8">
      <PageHeader
        title={`${cfg.flag} ${cfg.name}`}
        subtitle={`${totalWons.toLocaleString()} wons · MRR ${formatEUR(totalMrr)}`}
        actions={
          <div className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs text-white backdrop-blur">
            <MapPin className="h-3 w-3" />
            {pctMapped}% mapeados ({withRegion}/{totalWons})
          </div>
        }
      />

      {cfg.hasMap && withRegion === 0 && totalWons > 0 && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Zap className="h-4 w-4 shrink-0 text-amber-500" />
          <span className="flex-1">
            <strong>0 deals mapeados</strong> — re-sube el CSV si incluye columnas de ciudad/zip, o ve a{" "}
            <button
              onClick={() => navigate("/enrichment")}
              className="font-semibold underline underline-offset-2 hover:text-amber-900"
            >
              Enrichment
            </button>{" "}
            para poblar el mapa con HubSpot.
          </span>
        </div>
      )}

      {cfg.hasMap ? (
        <section
          className={cn(
            "mt-6 grid gap-6 transition-[grid-template-columns] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]",
            hasSelection ? "lg:grid-cols-[320px_1fr]" : "lg:grid-cols-1",
          )}
        >
          <div className={cn(
            "rounded-2xl border border-border bg-card shadow-sm transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]",
            hasSelection
              ? "p-3 lg:p-4"
              : "mx-auto w-full max-w-xl p-5 lg:p-6 shadow-[var(--shadow-pink-soft)]",
          )}>
            {!hasSelection && (
              <div className="mb-3 flex items-end justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    {cfg.name} · Wons
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {withRegion} wons con región de {totalWons} totales ({pctMapped}%)
                  </p>
                </div>
              </div>
            )}
            <CountryMap
              country={country as CountryCode}
              metric={metric}
              onMetricChange={setMetric}
              selected={selected}
              onSelect={setSelected}
              wonsPerRegion={wonsPerRegion}
              mrrPerRegion={mrrPerRegion}
              topVerticalByRegion={topVerticalByRegion}
            />
          </div>

          {hasSelection && (
            <aside
              key={selected}
              className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-pink-soft)] animate-[fade-in_0.5s_ease-out,scale-in_0.5s_cubic-bezier(0.22,1,0.36,1)]"
            >
              <RegionDetail
                code={selected! as any}
                deals={deals.filter((d) => d.regionCode === selected)}
                allDeals={deals}
                onClose={() => setSelected(undefined)}
                onGenerateSlide={handleGenerateSlide}
              />
            </aside>
          )}
        </section>
      ) : (
        <section className="mt-6">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <Target className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-base font-semibold">Top sectores</h2>
            </div>
            <SectorGrid deals={deals} />
          </div>
        </section>
      )}
    </div>
  );
}

function SectorGrid({ deals }: { deals: WonDeal[] }) {
  const sectors = useMemo(() => {
    const map = new Map<string, { count: number; mrr: number }>();
    for (const d of deals) {
      const g = groupIndustry(d.sector);
      const cur = map.get(g) ?? { count: 0, mrr: 0 };
      cur.count += 1;
      cur.mrr += d.totalActualMrr;
      map.set(g, cur);
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [deals]);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {sectors.map((s) => (
        <div key={s.name} className="rounded-lg border border-border p-4">
          <div className="text-sm font-semibold">{s.name}</div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-2xl font-bold tabular-nums">{s.count}</span>
            <span className="text-xs text-muted-foreground">wons</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">{formatEUR(s.mrr)} MRR</div>
        </div>
      ))}
    </div>
  );
}
