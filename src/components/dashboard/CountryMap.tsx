import { useMemo, useState } from "react";
import { geoMercator, geoPath } from "d3-geo";
import { formatEUR } from "@/lib/csvStore";
import { cn } from "@/lib/utils";
import type { CountryCode } from "@/lib/countryConfig";

import geoFR from "@/data/france-regions.geojson.json";
import geoES from "@/data/spain-regions.geojson.json";
import geoIT from "@/data/italy-regions.geojson.json";
import geoDE from "@/data/germany-regions.geojson.json";
import geoBR from "@/data/brazil-regions.geojson.json";

type MapMetric = "wons" | "mrr";

interface GeoFeature {
  type: "Feature";
  properties: { code: string; nom: string };
  geometry: GeoJSON.Geometry;
}

interface GeoCollection {
  features: GeoFeature[];
}

const GEO_DATA: Partial<Record<CountryCode, GeoCollection>> = {
  fr: geoFR as unknown as GeoCollection,
  es: geoES as unknown as GeoCollection,
  it: geoIT as unknown as GeoCollection,
  de: geoDE as unknown as GeoCollection,
  br: geoBR as unknown as GeoCollection,
};

interface Props {
  country: CountryCode;
  metric: MapMetric;
  onMetricChange: (m: MapMetric) => void;
  selected?: string;
  onSelect: (code: string) => void;
  wonsPerRegion: Record<string, number>;
  mrrPerRegion: Record<string, number>;
  topVerticalByRegion?: Record<string, string>;
}

const WIDTH = 640;
const HEIGHT = 640;

const METRIC_LABEL: Record<MapMetric, string> = {
  wons: "# Wons",
  mrr: "MRR",
};

export function CountryMap({ country, metric, onMetricChange, selected, onSelect, wonsPerRegion, mrrPerRegion, topVerticalByRegion }: Props) {
  const geo = GEO_DATA[country];
  if (!geo) return null;

  const features = geo.features;

  const projection = useMemo(
    () => geoMercator().fitSize([WIDTH, HEIGHT - 20], { type: "FeatureCollection", features } as GeoJSON.FeatureCollection),
    [features],
  );
  const path = useMemo(() => geoPath(projection), [projection]);

  const regionNames = useMemo(() => {
    const m: Record<string, string> = {};
    for (const f of features) m[f.properties.code] = f.properties.nom;
    return m;
  }, [features]);

  const valueFor = (code: string): number => {
    if (metric === "mrr") return mrrPerRegion[code] ?? 0;
    return wonsPerRegion[code] ?? 0;
  };

  const allCodes = features.map((f) => f.properties.code);
  const max = Math.max(...allCodes.map(valueFor), 1);

  function intensityClass(code: string): string {
    const v = valueFor(code);
    const ratio = max > 0 ? Math.sqrt(v / max) : 0;
    if (v <= 0) return "fill-[var(--map-0)]";
    if (ratio < 0.25) return "fill-[var(--map-1)]";
    if (ratio < 0.45) return "fill-[var(--map-2)]";
    if (ratio < 0.65) return "fill-[var(--map-3)]";
    if (ratio < 0.85) return "fill-[var(--map-4)]";
    return "fill-[var(--map-5)]";
  }

  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null);

  return (
    <div className="relative w-full">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Par {METRIC_LABEL[metric]}
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {(["wons", "mrr"] as const).map((m) => (
            <button
              key={m}
              onClick={() => onMetricChange(m)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                metric === m
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/70",
              )}
            >
              {METRIC_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <svg
          data-country-map
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full h-auto"
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <filter id="region-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="var(--primary)" floodOpacity="0.35" />
            </filter>
          </defs>
          <g>
            {features.map((f) => {
              const code = f.properties.code;
              const isSelected = selected === code;
              const dimmed = selected && !isSelected;
              return (
                <path
                  key={code}
                  data-code={code}
                  d={path(f as unknown as GeoJSON.Feature) ?? undefined}
                  className={cn(
                    intensityClass(code),
                    "cursor-pointer transition-all duration-500 ease-out",
                    isSelected ? "stroke-primary" : "stroke-white",
                    dimmed && "opacity-40",
                  )}
                  strokeWidth={isSelected ? 2.5 : 1}
                  filter={isSelected ? "url(#region-shadow)" : undefined}
                  onClick={() => onSelect(code)}
                  onMouseMove={(e) => {
                    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                    setHover({ code, x: e.clientX - rect.left, y: e.clientY - rect.top });
                  }}
                />
              );
            })}
          </g>
        </svg>

        {hover && (() => {
          const wons = wonsPerRegion[hover.code] ?? 0;
          const mrr = mrrPerRegion[hover.code] ?? 0;
          const topV = topVerticalByRegion?.[hover.code] ?? "—";
          const name = regionNames[hover.code] ?? hover.code;
          return (
            <div
              className="pointer-events-none absolute z-20 min-w-[200px] rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg"
              style={{ left: Math.min(hover.x + 14, WIDTH - 220), top: Math.max(hover.y - 10, 0) }}
            >
              <div className="text-sm font-semibold text-foreground">{name}</div>
              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted-foreground">
                <span>Wons</span><span className="text-right text-foreground">{wons}</span>
                <span>MRR</span><span className="text-right text-foreground">{formatEUR(mrr)}</span>
                <span>Top vertical</span><span className="text-right text-foreground truncate">{topV}</span>
              </div>
            </div>
          );
        })()}
      </div>

      <div className="mt-3 flex items-center gap-2 px-1 text-xs text-muted-foreground">
        <span>Low</span>
        <div className="flex h-2 flex-1 overflow-hidden rounded-full">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex-1" style={{ background: `var(--map-${i})` }} />
          ))}
        </div>
        <span>High</span>
      </div>
    </div>
  );
}
