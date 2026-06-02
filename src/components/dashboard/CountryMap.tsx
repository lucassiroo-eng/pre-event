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
import geoPT from "@/data/portugal-regions.geojson.json";
import geoMX from "@/data/mexico-regions.geojson.json";

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
  pt: geoPT as unknown as GeoCollection,
  mx: geoMX as unknown as GeoCollection,
};

// Islands with centroid lon below this threshold go into the inset box
const ISLAND_LON_THRESHOLD: Partial<Record<CountryCode, number>> = {
  es: -10,  // Canary Islands centroid ~-16.4°
};

// Inset box for islands (bottom-left, SVG coords)
const INSET_X = 6;
const INSET_H = 100;
const INSET_W = 200;
const INSET_Y_FROM_BOTTOM = 6;
const INSET_PAD = 7;

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
const INSET_Y = HEIGHT - INSET_Y_FROM_BOTTOM - INSET_H;

const METRIC_LABEL: Record<MapMetric, string> = {
  wons: "# Wons",
  mrr: "MRR",
};

type SvgPathFn = (feature: GeoJSON.Feature | null | undefined) => string | null;

function getFeatureCentroidLon(f: GeoFeature): number {
  const geom = f.geometry as { type: string; coordinates: unknown[] };
  let coords: number[][] = [];
  if (geom.type === "Polygon") coords = geom.coordinates[0] as number[][];
  else if (geom.type === "MultiPolygon")
    for (const p of geom.coordinates as number[][][][]) coords.push(...p[0]);
  if (!coords.length) return 0;
  return coords.reduce((s, c) => s + c[0], 0) / coords.length;
}

export function CountryMap({ country, metric, onMetricChange, selected, onSelect, wonsPerRegion, mrrPerRegion, topVerticalByRegion }: Props) {
  const geo = GEO_DATA[country];
  if (!geo) return null;

  const features = geo.features;

  const islandThreshold = ISLAND_LON_THRESHOLD[country];

  const { mainlandFeatures, islandFeatures } = useMemo(() => {
    if (islandThreshold === undefined) return { mainlandFeatures: features, islandFeatures: [] as GeoFeature[] };
    return {
      mainlandFeatures: features.filter((f) => getFeatureCentroidLon(f) >= islandThreshold),
      islandFeatures:   features.filter((f) => getFeatureCentroidLon(f) <  islandThreshold),
    };
  }, [features, islandThreshold]);

  const projection = useMemo(
    () =>
      geoMercator().fitSize(
        [WIDTH, HEIGHT - 20],
        { type: "FeatureCollection", features: mainlandFeatures } as GeoJSON.FeatureCollection,
      ),
    [mainlandFeatures],
  );

  const path = useMemo(() => geoPath(projection) as unknown as SvgPathFn, [projection]);

  // Inset projection for island features
  const insetProjection = useMemo(() => {
    if (!islandFeatures.length) return null;
    return geoMercator().fitExtent(
      [[INSET_X + INSET_PAD, INSET_Y + INSET_PAD], [INSET_X + INSET_W - INSET_PAD, INSET_Y + INSET_H - INSET_PAD]],
      { type: "FeatureCollection", features: islandFeatures } as GeoJSON.FeatureCollection,
    );
  }, [islandFeatures]);
  const insetPath = useMemo(
    () => (insetProjection ? (geoPath(insetProjection) as unknown as SvgPathFn) : null),
    [insetProjection],
  );

  const regionNames = useMemo(() => {
    const m: Record<string, string> = {};
    for (const f of features) m[String(f.properties.code)] = f.properties.nom;
    return m;
  }, [features]);

  const valueFor = (code: string): number => {
    if (metric === "mrr") return mrrPerRegion[code] ?? 0;
    return wonsPerRegion[code] ?? 0;
  };

  const allCodes = features.map((f) => String(f.properties.code));
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

  function renderRegion(f: GeoFeature, pathFn: SvgPathFn) {
    const code = String(f.properties.code);
    const isSelected = selected === code;
    const dimmed = selected && !isSelected;
    return (
      <path
        key={code}
        data-code={code}
        d={pathFn(f as unknown as GeoJSON.Feature) ?? undefined}
        className={cn(
          intensityClass(code),
          "cursor-pointer transition-all duration-500 ease-out",
          isSelected ? "stroke-primary" : "stroke-neutral-400",
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
  }

  return (
    <div className="relative w-full">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-3">
        <h2 className="text-sm font-medium text-muted-foreground">Par {METRIC_LABEL[metric]}</h2>
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
          {/* Themed but soft backdrop so the map feels grounded, not floating on flat gray */}
          <rect width={WIDTH} height={HEIGHT} fill="url(#map-bg)" rx={16} />
          <rect width={WIDTH} height={HEIGHT} fill="url(#map-glow)" rx={16} />

          {/* Mainland regions */}
          <g>{mainlandFeatures.map((f) => renderRegion(f, path))}</g>

          {/* Island inset (bottom-left corner) */}
          {insetPath && islandFeatures.length > 0 && (
            <g>
              <rect
                x={INSET_X} y={INSET_Y} width={INSET_W} height={INSET_H}
                rx={5} ry={5}
                fill="var(--background)" fillOpacity={0.9}
                stroke="var(--border)" strokeWidth={1}
              />
              {islandFeatures.map((f) => renderRegion(f, insetPath!))}
              <text
                x={INSET_X + INSET_PAD} y={INSET_Y + INSET_H - 5}
                fontSize={9} fontFamily="Inter, system-ui, sans-serif"
                fontWeight="600" fill="var(--muted-foreground)" letterSpacing={1}
              >
                ISLAS
              </text>
            </g>
          )}

          {/* Soft vignette frames the map without obscuring regions */}
          <rect width={WIDTH} height={HEIGHT} fill="url(#map-vignette)" rx={16} pointerEvents="none" />
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
