import { useMemo, useState } from "react";
import { geoMercator, geoPath } from "d3-geo";
import geo from "@/data/france-regions.geojson.json";
import { formatEUR, REGIONS, type RegionCode } from "@/lib/csvStore";
import { cn } from "@/lib/utils";

type MapMetric = "wons" | "mrr";

interface Props {
  metric: MapMetric;
  onMetricChange: (m: MapMetric) => void;
  selected?: RegionCode;
  onSelect: (code: RegionCode) => void;
  wonsPerRegion: Partial<Record<RegionCode, number>>;
  mrrPerRegion: Partial<Record<RegionCode, number>>;
  topVerticalByRegion?: Partial<Record<RegionCode, string>>;
}

const WIDTH = 640;
const HEIGHT = 640;

interface GeoFeature {
  type: "Feature";
  properties: { code: string; nom: string };
  geometry: GeoJSON.Geometry;
}

const METRIC_LABEL: Record<MapMetric, string> = {
  wons: "# Wons",
  mrr: "MRR",
};

const statsByCode = new Map(REGIONS.map((s) => [s.code, s]));

export function FranceMap({ metric, onMetricChange, selected, onSelect, wonsPerRegion, mrrPerRegion, topVerticalByRegion }: Props) {
  const features = (geo as { features: GeoFeature[] }).features;

  const mainland = useMemo(
    () => ({ type: "FeatureCollection" as const, features: features.filter((f) => f.properties.code !== "94") }),
    [features],
  );
  const projection = useMemo(
    () => geoMercator().fitSize([WIDTH, HEIGHT - 20], mainland as GeoJSON.FeatureCollection),
    [mainland],
  );
  const path = useMemo(() => geoPath(projection), [projection]);

  const valueFor = (code: RegionCode): number => {
    if (metric === "mrr") return mrrPerRegion[code] ?? 0;
    return wonsPerRegion[code] ?? 0;
  };

  const max = Math.max(
    ...REGIONS.map((s) => valueFor(s.code)),
    1,
  );

  function intensityClass(code: RegionCode): string {
    const v = valueFor(code);
    const ratio = max > 0 ? Math.sqrt(v / max) : 0;
    if (v <= 0) return "fill-[var(--map-0)]";
    if (ratio < 0.25) return "fill-[var(--map-1)]";
    if (ratio < 0.45) return "fill-[var(--map-2)]";
    if (ratio < 0.65) return "fill-[var(--map-3)]";
    if (ratio < 0.85) return "fill-[var(--map-4)]";
    return "fill-[var(--map-5)]";
  }

  const [hover, setHover] = useState<{ code: RegionCode; x: number; y: number } | null>(null);
  const hoverRegion = hover ? statsByCode.get(hover.code) : undefined;

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
          data-france-map
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full h-auto"
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <filter id="region-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="var(--primary)" floodOpacity="0.35" />
            </filter>
            <linearGradient id="map-bg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity="0.6" />
              <stop offset="1" stopColor="var(--background)" />
            </linearGradient>
            <radialGradient id="map-glow" cx="0.5" cy="0.42" r="0.62">
              <stop offset="0" stopColor="var(--map-1)" stopOpacity="0.35" />
              <stop offset="1" stopColor="var(--map-1)" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="map-vignette" cx="0.5" cy="0.5" r="0.72">
              <stop offset="0.55" stopColor="#000" stopOpacity="0" />
              <stop offset="1" stopColor="#000" stopOpacity="0.06" />
            </radialGradient>
          </defs>
          <rect width={WIDTH} height={HEIGHT} fill="url(#map-bg)" rx={16} />
          <rect width={WIDTH} height={HEIGHT} fill="url(#map-glow)" rx={16} />
          <g>
            {features.map((f) => {
              const code = f.properties.code as RegionCode;
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
          <rect width={WIDTH} height={HEIGHT} fill="url(#map-vignette)" rx={16} pointerEvents="none" />
        </svg>

        {hover && hoverRegion && (() => {
          const wons = wonsPerRegion[hover.code] ?? 0;
          const mrr = mrrPerRegion[hover.code] ?? 0;
          const topV = topVerticalByRegion?.[hover.code] ?? "—";
          return (
            <div
              className="pointer-events-none absolute z-20 min-w-[200px] rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg"
              style={{ left: Math.min(hover.x + 14, WIDTH - 220), top: Math.max(hover.y - 10, 0) }}
            >
              <div className="text-sm font-semibold text-foreground">{hoverRegion.name}</div>
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
