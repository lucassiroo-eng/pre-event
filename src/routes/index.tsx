import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Target } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { FranceMap, type LiveMetric } from "@/components/dashboard/FranceMap";
import { RegionLiveDetail, type SlideSection } from "@/components/dashboard/RegionLiveDetail";

import { type RegionCode, formatEUR } from "@/data/mockData";
import type { MapMetric } from "@/data/regionMetrics";
import { cn } from "@/lib/utils";
import { useSync } from "@/lib/useSync";
import { groupIndustry } from "@/lib/industryGroups";
import { generateRegionSlide } from "@/lib/generateSlide";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const [metric, setMetric] = useState<MapMetric>("demosBooked");
  const [liveMetric, setLiveMetric] = useState<LiveMetric>("wons");
  const [selected, setSelected] = useState<RegionCode | undefined>(undefined);
  const { sync } = useSync();

  const toRegionMap = (src: Record<string, number> | undefined) => {
    if (!src) return undefined;
    const out: Partial<Record<RegionCode, number>> = {};
    for (const [code, n] of Object.entries(src)) {
      if (code === "unknown") continue;
      out[code as RegionCode] = n;
    }
    return out;
  };

  const liveByRegion = useMemo(() => toRegionMap(sync?.wonsPerRegion), [sync]);
  const liveDemosByRegion = useMemo(() => toRegionMap(sync?.demosPerRegion), [sync]);
  const liveMrrByRegion = useMemo(() => toRegionMap(sync?.mrrPerRegion), [sync]);
  const liveTopVerticalByRegion = useMemo(() => {
    if (!sync) return undefined;
    const counts: Record<string, Record<string, number>> = {};
    for (const d of sync.deals) {
      if (!d.isWon) continue;
      if (d.regionCode === "unknown") continue;
      const g = groupIndustry(d.industry);
      if (g === "Unknown") continue;
      (counts[d.regionCode] ??= {});
      counts[d.regionCode][g] = (counts[d.regionCode][g] ?? 0) + 1;
    }
    const out: Partial<Record<RegionCode, string>> = {};
    for (const [code, map] of Object.entries(counts)) {
      const top = Object.entries(map).sort((a, b) => b[1] - a[1])[0];
      if (top) out[code as RegionCode] = top[0];
    }
    return out;
  }, [sync]);


  const handleGenerateSlide = (sections: SlideSection[]) => {
    if (!sync || !selected) return;
    generateRegionSlide(selected, sync, sections);
  };

  const hasSelection = !!selected;

  return (
    <div className="mx-auto max-w-[1500px] px-6 py-6 lg:px-8 lg:py-8">
      <PageHeader
        title="Factorial Regional ICP"
        subtitle="Regional performance dashboard for sales teams"
      />

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
                  France · {sync ? "Closed-Won deals" : "Regional performance"}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {sync
                    ? `${sync.totalWons} wons · ${sync.totalDemos} demos · MRR ${formatEUR(sync.totalMrr ?? 0)}`
                    : "Click on a region to view performance insights."}
                </p>
              </div>
            </div>
          )}
          <div className="transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]">
            <FranceMap
              metric={metric}
              onMetricChange={setMetric}
              selected={selected}
              onSelect={setSelected}
              liveDealsByRegion={liveByRegion}
              liveDemosByRegion={liveDemosByRegion}
              liveMrrByRegion={liveMrrByRegion}
              liveTopVerticalByRegion={liveTopVerticalByRegion}
              liveMetric={liveMetric}
              onLiveMetricChange={setLiveMetric}
            />
          </div>
        </div>

        {hasSelection && (
          <aside
            key={selected}
            className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-pink-soft)] animate-[fade-in_0.5s_ease-out,scale-in_0.5s_cubic-bezier(0.22,1,0.36,1)]"
          >
            {sync ? (
              <RegionLiveDetail
                code={selected!}
                sync={sync}
                onClose={() => setSelected(undefined)}
                onGenerateSlide={handleGenerateSlide}
              />
            ) : (
              <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-3 p-8 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-accent/30 text-foreground">
                  <Target className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold">Sync HubSpot first</h3>
                <p className="max-w-xs text-sm text-muted-foreground">
                  Run a sync to load Closed-Won deals for this region.
                </p>
              </div>
            )}
          </aside>
        )}
      </section>

    </div>
  );
}
