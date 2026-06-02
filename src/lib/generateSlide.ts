import type PptxGenJSType from "pptxgenjs";
import { geoMercator, geoPath } from "d3-geo";
import { type WonDeal } from "@/lib/csvStore";
import { groupIndustry } from "@/lib/industryGroups";
import { recordPptDownload, type EnrichmentStore } from "@/lib/enrichmentStore";
import { fetchLogos } from "@/lib/logoStore";
import { countModulesForIndustry } from "@/lib/bundleModules";

import geoFR from "@/data/france-regions.geojson.json";
import geoES from "@/data/spain-regions.geojson.json";
import geoIT from "@/data/italy-regions.geojson.json";
import geoDE from "@/data/germany-regions.geojson.json";
import geoBR from "@/data/brazil-regions.geojson.json";
import geoPT from "@/data/portugal-regions.geojson.json";
import geoMX from "@/data/mexico-regions.geojson.json";

// ─── Palette ─────────────────────────────────────────────────────────────────
const C = {
  bg:         "0B0C14",
  headerBg:   "06070D",
  card:       "12131D",
  cardBorder: "1C1E2C",
  accent:     "FD4F6B",
  accentMid:  "8C1E30",
  accentDark: "1A090E",
  white:      "EDEEF8",
  sub:        "4E5168",
  muted:      "1E202C",
  sep:        "22242F",
};

// ─── Geo names ───────────────────────────────────────────────────────────────
type GeoCollection = { features: { properties: { code: unknown; nom: string } }[] };
const GEO_NAMES: Record<string, Record<string, string>> = {};
for (const [c, geo] of Object.entries<GeoCollection>({
  fr: geoFR as GeoCollection, es: geoES as GeoCollection,
  it: geoIT as GeoCollection, de: geoDE as GeoCollection,
  br: geoBR as GeoCollection, pt: geoPT as GeoCollection, mx: geoMX as GeoCollection,
})) {
  GEO_NAMES[c] = {};
  for (const f of geo.features) GEO_NAMES[c][String(f.properties.code)] = f.properties.nom;
}

function getRegionName(country: string, code: string): string {
  return GEO_NAMES[country]?.[code] ?? code;
}


// ─── Map rendering (D3 → canvas, no DOM dependency) ─────────────────────────

type RawFeature = { properties: { code: unknown; nom: string }; geometry: unknown };
type RawGeo = { features: RawFeature[] };

const GEO_MAP: Record<string, RawGeo> = {
  fr: geoFR as RawGeo, es: geoES as RawGeo,
  it: geoIT as RawGeo, de: geoDE as RawGeo,
  br: geoBR as RawGeo, pt: geoPT as RawGeo, mx: geoMX as RawGeo,
};

// Max mainland longitude — features with centroid west of this go into the inset
const ISLAND_LON_THRESHOLD: Record<string, number> = {
  es: -10,  // Canary Islands centroid ~-16.4°
};

// Hardcoded projection params per country (center + scale at 640px reference size).
// Same values as CountryMap.tsx — scale for PPTX canvas is proportionally adjusted.
const PROJ_PARAMS: Record<string, { center: [number, number]; scale640: number }> = {
  fr: { center: [2.25,    46.25],  scale640: 2100 },
  es: { center: [-2.50,   39.50],  scale640: 2250 },
  it: { center: [12.55,   41.30],  scale640: 2200 },
  de: { center: [10.45,   51.20],  scale640: 2400 },
  br: { center: [-53.20, -14.25],  scale640: 750  },
  pt: { center: [-8.10,   39.55],  scale640: 4900 },
  mx: { center: [-102.55, 23.55],  scale640: 980  },
};

function featureCentroidLon(geom: unknown): number {
  const g = geom as { type: string; coordinates: unknown[] };
  let coords: number[][] = [];
  if (g.type === "Polygon") coords = (g.coordinates[0] as number[][]);
  else if (g.type === "MultiPolygon")
    for (const poly of g.coordinates as number[][][][]) coords.push(...poly[0]);
  if (!coords.length) return 0;
  return coords.reduce((s, c) => s + c[0], 0) / coords.length;
}

type CanvasPathGen = (feature: GeoJSON.Feature | null | undefined) => void;

function drawRegion(
  ctx: CanvasRenderingContext2D,
  pathGen: CanvasPathGen,
  feature: GeoJSON.Feature,
  isSelected: boolean,
  size: number,
) {
  if (isSelected) {
    ctx.save();
    ctx.shadowColor = "#FD4F6B";
    ctx.shadowBlur = size * 0.04;
    ctx.beginPath();
    pathGen(feature);
    ctx.fillStyle = "#FD4F6B";
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    pathGen(feature);
    ctx.fillStyle = "#FF5C77";
    ctx.fill();
    ctx.strokeStyle = "#FFAAB8";
    ctx.lineWidth = size * 0.0022;
    ctx.stroke();
  } else {
    ctx.beginPath();
    pathGen(feature);
    ctx.fillStyle = "#191B2E";
    ctx.fill();
    ctx.strokeStyle = "#272A40";
    ctx.lineWidth = size * 0.001;
    ctx.stroke();
  }
}

async function renderMapPng(
  country: string,
  selectedCode: string,
  size = 1600,
): Promise<string | null> {
  const raw = GEO_MAP[country];
  if (!raw) return null;

  const allFeatures = raw.features.map((f) => ({
    type: "Feature" as const,
    properties: f.properties,
    geometry: f.geometry as GeoJSON.Geometry,
  }));

  // Split mainland vs island features
  const lonThreshold = ISLAND_LON_THRESHOLD[country];
  const mainlandFeatures = lonThreshold !== undefined
    ? allFeatures.filter((f) => featureCentroidLon(f.geometry) >= lonThreshold)
    : allFeatures;
  const islandFeatures = lonThreshold !== undefined
    ? allFeatures.filter((f) => featureCentroidLon(f.geometry) < lonThreshold)
    : [];

  const params = PROJ_PARAMS[country];
  const projection = params
    ? geoMercator()
        .center(params.center)
        .scale(params.scale640 * (size / 640))
        .translate([size / 2, size / 2])
    : geoMercator().fitSize([size, size], { type: "FeatureCollection" as const, features: mainlandFeatures });

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Background
  ctx.fillStyle = "#0B0C14";
  ctx.fillRect(0, 0, size, size);

  const pathGen = geoPath().projection(projection).context(ctx) as unknown as CanvasPathGen;

  // Draw mainland regions
  for (const f of mainlandFeatures) {
    drawRegion(ctx, pathGen, f, String(f.properties.code) === selectedCode, size);
  }

  // Vignette overlay
  const vignette = ctx.createRadialGradient(size / 2, size / 2, size * 0.28, size / 2, size / 2, size * 0.72);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.32)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, size, size);

  // ── Island inset (bottom-left) ─────────────────────────────────────────────
  if (islandFeatures.length > 0) {
    const IW = Math.round(size * 0.30);
    const IH = Math.round(size * 0.14);
    const IX = Math.round(size * 0.07);
    const IY = size - Math.round(size * 0.07) - IH;
    const IPAD = Math.round(size * 0.012);
    const RADIUS = Math.round(size * 0.008);

    // Box
    ctx.beginPath();
    ctx.roundRect(IX, IY, IW, IH, RADIUS);
    ctx.fillStyle = "#0D0F1C";
    ctx.fill();
    ctx.strokeStyle = "#2A2D44";
    ctx.lineWidth = Math.round(size * 0.0015);
    ctx.stroke();

    // Inset projection
    const islandFC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: islandFeatures };
    const islandProj = geoMercator().fitExtent(
      [[IX + IPAD, IY + IPAD], [IX + IW - IPAD, IY + IH - IPAD]],
      islandFC,
    );
    const islandPath = geoPath().projection(islandProj).context(ctx) as unknown as CanvasPathGen;

    for (const f of islandFeatures) {
      drawRegion(ctx, islandPath, f, String(f.properties.code) === selectedCode, IH);
    }

    // "ISLAS" label
    ctx.font = `bold ${Math.round(size * 0.011)}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = "#3A3D58";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("ISLAS", IX + IPAD, IY + IH - IPAD / 2);
  }

  return canvas.toDataURL("image/png");
}

// ─── Main export ─────────────────────────────────────────────────────────────
export async function generateRegionSlide(
  code: string,
  deals: WonDeal[],
  country: string,
  enrichStore?: EnrichmentStore,
) {
  const regionDeals = deals.filter((d) => d.regionCode === code);
  const name = getRegionName(country, code);

  // Top 5 companies (region, by seats then MRR — most visible accounts)
  const seenCompany = new Set<string>();
  const top5Companies: { name: string; companyId: string }[] = [];
  for (const d of [...regionDeals].sort((a, b) => b.seats - a.seats || b.totalActualMrr - a.totalActualMrr)) {
    const key = d.companyName.trim().toLowerCase();
    if (seenCompany.has(key)) continue;
    seenCompany.add(key);
    top5Companies.push({ name: d.companyName, companyId: d.companyId });
    if (top5Companies.length >= 5) break;
  }

  // Top 3 industries (region)
  type IndAcc = { count: number; deals: WonDeal[] };
  const industryMap = new Map<string, IndAcc>();
  for (const d of regionDeals) {
    const g = groupIndustry(d.sector);
    if (g === "Other" || g === "Unknown") continue;
    const cur: IndAcc = industryMap.get(g) ?? { count: 0, deals: [] };
    cur.count++;
    cur.deals.push(d);
    industryMap.set(g, cur);
  }
  const top3Industries = Array.from(industryMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 3);

  // Top module per industry (country-wide, real module counts via bundle mapping)
  const industryTopModules = top3Industries.map(([industryName]) => {
    const mods = countModulesForIndustry(deals, industryName, country);
    return { industry: industryName, module: mods[0]?.module ?? "—" };
  });

  // Logos for top 5
  const domains = top5Companies.map((c) => enrichStore?.[c.companyId]?.domain ?? "");
  const logoCache = await fetchLogos(domains.filter(Boolean));

  const mapPng = await renderMapPng(country, code);

  // ─── PPTX ─────────────────────────────────────────────────────────────────
  const PptxMod = (await import("pptxgenjs")).default as unknown as new () => PptxGenJSType;
  const pptx = new PptxMod();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = `${name} · Factorial`;

  const slide = pptx.addSlide();
  slide.background = { color: C.bg };

  // ── Layout ────────────────────────────────────────────────────────────────
  const W = 13.33;
  const H = 7.5;
  const HEADER_H = 1.42;
  const BODY_Y = HEADER_H + 0.08;  // 1.50

  const MAP_W = 5.9;
  const VDIV_X = MAP_W + 0.06;
  const COL_X = VDIV_X + 0.012 + 0.2;   // ≈ 6.17
  const COL_W = W - COL_X - 0.12;       // ≈ 7.04

  // Logo row
  const LOGO_LABEL_Y = BODY_Y + 0.08;   // 1.58
  const LOGO_PILL_SZ = 1.02;            // square pill
  const LOGO_IMG_SZ = 0.74;
  const LOGO_Y = LOGO_LABEL_Y + 0.28;   // 1.86
  const LOGO_GAP = (COL_W - 5 * LOGO_PILL_SZ) / 4;  // ≈ 0.505

  // Industry rows
  const HDIV_Y = LOGO_Y + LOGO_PILL_SZ + 0.22;  // ≈ 3.10
  const IND_Y = HDIV_Y + 0.28;                   // ≈ 3.38
  const IND_ROW_H = (H - IND_Y - 0.12) / 3;     // ≈ 1.33

  // ── HEADER ────────────────────────────────────────────────────────────────
  slide.addShape("rect", { x: 0, y: 0, w: W, h: HEADER_H, fill: { color: C.headerBg }, line: { type: "none" } });
  slide.addShape("rect", { x: 0, y: HEADER_H - 0.04, w: W, h: 0.04, fill: { color: C.accent }, line: { type: "none" } });

  // "factorial" wordmark (small, top-left)
  slide.addText("factorial", {
    x: 0.5, y: 0.28, w: 2, h: 0.22,
    fontSize: 11, bold: true, color: C.accent, fontFace: "Inter",
  });

  // Region name
  slide.addText(name, {
    x: 0.5, y: 0.48, w: 11, h: 0.78,
    fontSize: 36, bold: true, color: C.white, fontFace: "Inter",
  });

  // Client count (right side, big)
  slide.addText(String(regionDeals.length), {
    x: 10.3, y: 0.15, w: 2.85, h: 0.82,
    fontSize: 52, bold: true, color: C.accent, align: "right", valign: "bottom", fontFace: "Inter",
  });
  slide.addText(regionDeals.length === 1 ? "CLIENT" : "CLIENTS", {
    x: 10.3, y: 1.02, w: 2.85, h: 0.22,
    fontSize: 8, bold: true, color: C.sub, charSpacing: 2.5, align: "right", fontFace: "Inter",
  });

  // ── MAP ───────────────────────────────────────────────────────────────────
  if (mapPng) {
    slide.addImage({ data: mapPng, x: 0.08, y: BODY_Y, w: MAP_W - 0.08, h: H - BODY_Y - 0.08 });
  }

  slide.addShape("rect", {
    x: VDIV_X, y: HEADER_H, w: 0.012, h: H - HEADER_H,
    fill: { color: C.sep }, line: { type: "none" },
  });

  // ── LOGO ROW ──────────────────────────────────────────────────────────────
  slide.addText("NOS CLIENTS DANS LA RÉGION", {
    x: COL_X, y: LOGO_LABEL_Y, w: COL_W, h: 0.2,
    fontSize: 7.5, bold: true, color: C.sub, charSpacing: 2.5, fontFace: "Inter",
  });

  top5Companies.forEach((c, i) => {
    const px = COL_X + i * (LOGO_PILL_SZ + LOGO_GAP);
    const domain = enrichStore?.[c.companyId]?.domain ?? "";
    const dataUrl = domain ? (logoCache[domain] ?? "") : "";

    // pill background
    slide.addShape("roundRect", {
      x: px, y: LOGO_Y, w: LOGO_PILL_SZ, h: LOGO_PILL_SZ,
      fill: { color: dataUrl ? "FFFFFF" : C.card },
      line: { color: dataUrl ? "E8E8EC" : C.cardBorder, width: 0.5 },
      rectRadius: 0.14,
    });

    if (dataUrl) {
      const offset = (LOGO_PILL_SZ - LOGO_IMG_SZ) / 2;
      slide.addImage({ data: dataUrl, x: px + offset, y: LOGO_Y + offset, w: LOGO_IMG_SZ, h: LOGO_IMG_SZ });
    } else {
      // Initial letter fallback
      slide.addText(c.name.charAt(0).toUpperCase(), {
        x: px, y: LOGO_Y, w: LOGO_PILL_SZ, h: LOGO_PILL_SZ,
        fontSize: 24, bold: true, color: C.accent, align: "center", valign: "middle", fontFace: "Inter",
      });
    }

    // Company name below pill (truncated)
    const shortName = c.name.length > 14 ? c.name.slice(0, 13) + "…" : c.name;
    slide.addText(shortName, {
      x: px, y: LOGO_Y + LOGO_PILL_SZ + 0.06, w: LOGO_PILL_SZ, h: 0.2,
      fontSize: 7.5, color: C.sub, align: "center", fontFace: "Inter",
    });
  });

  // ── DIVIDER ───────────────────────────────────────────────────────────────
  slide.addShape("rect", {
    x: COL_X, y: HDIV_Y, w: COL_W, h: 0.012,
    fill: { color: C.sep }, line: { type: "none" },
  });

  // ── INDUSTRY → MODULE ROWS ────────────────────────────────────────────────
  slide.addText("SECTEUR PRINCIPAL  ·  MODULE CLÉ", {
    x: COL_X, y: IND_Y - 0.2, w: COL_W, h: 0.18,
    fontSize: 7.5, bold: true, color: C.sub, charSpacing: 2.5, fontFace: "Inter",
  });

  industryTopModules.forEach(({ industry, module }, i) => {
    const iy = IND_Y + i * IND_ROW_H;

    // Thin top separator for rows 1 and 2
    if (i > 0) {
      slide.addShape("rect", {
        x: COL_X, y: iy, w: COL_W, h: 0.012,
        fill: { color: C.muted }, line: { type: "none" },
      });
    }

    // Industry label (small, muted)
    slide.addText(industry.toUpperCase(), {
      x: COL_X, y: iy + 0.22, w: COL_W * 0.5, h: 0.22,
      fontSize: 8.5, bold: true, color: C.sub, charSpacing: 1.5, fontFace: "Inter",
    });

    // Module name (big, coral, right-aligned)
    slide.addText(module, {
      x: COL_X, y: iy + 0.48, w: COL_W, h: 0.65,
      fontSize: 24, bold: true, color: C.accent, align: "right", valign: "top", fontFace: "Inter",
    });
  });

  await pptx.writeFile({ fileName: `${name.replace(/\s+/g, "-")}-factorial.pptx` });

  const user = window.localStorage.getItem("factorial.session.email") ?? "unknown";
  recordPptDownload({
    timestamp: new Date().toISOString(), region: name, country, user,
    sections: ["logos", "industries-modules"],
  });
}
