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
  barTrack:   "1C1E2C",
  chipText:   "EDEEF8",
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

  const projection = geoMercator().fitSize(
    [size, size],
    { type: "FeatureCollection" as const, features: mainlandFeatures },
  );

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

// ─── Helpers ─────────────────────────────────────────────────────────────────
function shortCompanyName(name: string, maxLen = 11): string {
  if (name.length <= maxLen) return name;
  const firstWord = name.split(/[\s,.(]/)[0];
  return firstWord.length <= maxLen ? firstWord : firstWord.slice(0, maxLen - 1) + "…";
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

  // For each industry: top 3 modules (country-wide) + top 3 clients (by seats in region)
  const industryData = top3Industries.map(([industryName, { count }]) => {
    // Top 3 modules country-wide for this industry
    const modules = countModulesForIndustry(deals, industryName, country).slice(0, 3);

    // Top 3 clients in region by seats
    const seen = new Set<string>();
    const clients: { name: string; companyId: string; seats: number }[] = [];
    for (const d of [...regionDeals.filter((x) => groupIndustry(x.sector) === industryName)]
      .sort((a, b) => b.seats - a.seats || b.totalActualMrr - a.totalActualMrr)) {
      const key = d.companyName.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      clients.push({ name: d.companyName, companyId: d.companyId, seats: d.seats });
      if (clients.length >= 3) break;
    }

    return { industry: industryName, count, modules, clients };
  });

  // Collect all unique domains for logos
  const allCompanyIds = industryData.flatMap((ind) => ind.clients.map((c) => c.companyId));
  const allDomains = [...new Set(allCompanyIds)].map((id) => enrichStore?.[id]?.domain ?? "").filter(Boolean);
  const logoCache = await fetchLogos(allDomains);

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
  const BODY_Y = HEADER_H + 0.08;   // 1.50

  const MAP_W = 3.90;
  const RIGHT_X = MAP_W + 0.12;     // 4.02
  const RIGHT_W = W - RIGHT_X - 0.10;  // 9.21
  const COL_GAP = 0.10;
  const COL_W = (RIGHT_W - 2 * COL_GAP) / 3;  // 2.97
  const COL_BOTTOM = H - 0.12;      // 7.38
  const COL_H = COL_BOTTOM - BODY_Y; // 5.88
  const COL_PAD = 0.18;             // inner horizontal padding

  const LOGO_SZ = 0.80;
  const LOGO_GAP = 0.07;

  const MAX_MODULES = 3;
  const MOD_ROW_H = 0.46;
  const BAR_H = 0.14;

  // ── HEADER ────────────────────────────────────────────────────────────────
  slide.addShape("rect", { x: 0, y: 0, w: W, h: HEADER_H, fill: { color: C.headerBg }, line: { type: "none" } });
  slide.addShape("rect", { x: 0, y: HEADER_H - 0.04, w: W, h: 0.04, fill: { color: C.accent }, line: { type: "none" } });

  slide.addText("factorial", {
    x: 0.5, y: 0.26, w: 2, h: 0.22,
    fontSize: 11, bold: true, color: C.accent, fontFace: "Inter",
  });
  slide.addText(name, {
    x: 0.5, y: 0.46, w: 10.5, h: 0.82,
    fontSize: 36, bold: true, color: C.white, fontFace: "Inter",
  });
  slide.addText(String(regionDeals.length), {
    x: 10.5, y: 0.14, w: 2.7, h: 0.80,
    fontSize: 52, bold: true, color: C.accent, align: "right", valign: "bottom", fontFace: "Inter",
  });
  slide.addText(regionDeals.length === 1 ? "CLIENT" : "CLIENTS", {
    x: 10.5, y: 1.04, w: 2.7, h: 0.22,
    fontSize: 8, bold: true, color: C.sub, charSpacing: 2.5, align: "right", fontFace: "Inter",
  });

  // ── MAP ───────────────────────────────────────────────────────────────────
  if (mapPng) {
    slide.addImage({ data: mapPng, x: 0.06, y: BODY_Y, w: MAP_W - 0.06, h: COL_H });
  }
  // Map/content divider
  slide.addShape("rect", {
    x: MAP_W + 0.01, y: BODY_Y, w: 0.01, h: COL_H,
    fill: { color: C.cardBorder }, line: { type: "none" },
  });

  // ── 3 INDUSTRY COLUMNS ───────────────────────────────────────────────────
  const IND_COLORS = [C.accent, "F59E0B", "22C97B"] as const; // coral / amber / green

  industryData.forEach(({ industry, count, modules, clients }, colIdx) => {
    const CX = RIGHT_X + colIdx * (COL_W + COL_GAP);
    const innerW = COL_W - 2 * COL_PAD;
    let y = BODY_Y + 0.20;

    // Column card
    slide.addShape("roundRect", {
      x: CX, y: BODY_Y + 0.06, w: COL_W, h: COL_H - 0.12,
      fill: { color: C.card }, line: { color: C.cardBorder, width: 0.5 }, rectRadius: 0.12,
    });

    // Left accent bar
    slide.addShape("rect", {
      x: CX + 0.06, y: y + 0.06, w: 0.08, h: 0.38,
      fill: { color: IND_COLORS[colIdx] ?? C.accent }, line: { type: "none" },
    });

    // Industry name
    slide.addText(industry, {
      x: CX + 0.20, y, w: COL_W - 0.30, h: 0.44,
      fontSize: 11, bold: true, color: C.white, fontFace: "Inter",
    });
    // Count badge
    slide.addText(`${count} wons`, {
      x: CX + COL_PAD, y: y + 0.46, w: innerW, h: 0.18,
      fontSize: 7.5, color: C.sub, fontFace: "Inter",
    });
    y += 0.74;

    // "MODULES · PAYS" section
    slide.addShape("rect", {
      x: CX + COL_PAD, y, w: innerW, h: 0.01,
      fill: { color: C.cardBorder }, line: { type: "none" },
    });
    y += 0.14;
    slide.addText("MODULES · PAYS", {
      x: CX + COL_PAD, y, w: innerW, h: 0.18,
      fontSize: 7, bold: true, color: C.sub, charSpacing: 2, fontFace: "Inter",
    });
    y += 0.24;

    if (modules.length === 0) {
      slide.addText("—", {
        x: CX + COL_PAD, y, w: innerW, h: 0.30,
        fontSize: 10, color: C.sub, fontFace: "Inter",
      });
      y += 0.34;
    } else {
      const maxCount = modules[0].count;
      modules.slice(0, MAX_MODULES).forEach(({ module, count: mc, pct }) => {
        // Module name + pct
        slide.addText(module, {
          x: CX + COL_PAD, y, w: innerW - 0.45, h: 0.22,
          fontSize: 9.5, bold: true, color: C.white, fontFace: "Inter",
        });
        slide.addText(`${pct}%`, {
          x: CX + COL_PAD + innerW - 0.40, y, w: 0.40, h: 0.22,
          fontSize: 9, bold: true, color: IND_COLORS[colIdx] ?? C.accent, align: "right", fontFace: "Inter",
        });
        // Bar
        slide.addShape("roundRect", {
          x: CX + COL_PAD, y: y + 0.24, w: innerW, h: BAR_H,
          fill: { color: C.barTrack }, line: { type: "none" }, rectRadius: BAR_H / 2,
        });
        const fillW = Math.max(innerW * (mc / maxCount), 0.1);
        slide.addShape("roundRect", {
          x: CX + COL_PAD, y: y + 0.24, w: fillW, h: BAR_H,
          fill: { color: IND_COLORS[colIdx] ?? C.accent }, line: { type: "none" }, rectRadius: BAR_H / 2,
        });
        y += MOD_ROW_H;
      });
    }

    y += 0.10;

    // "TOP CLIENTS · RÉGION" section
    slide.addShape("rect", {
      x: CX + COL_PAD, y, w: innerW, h: 0.01,
      fill: { color: C.cardBorder }, line: { type: "none" },
    });
    y += 0.14;
    slide.addText("TOP CLIENTS · RÉGION", {
      x: CX + COL_PAD, y, w: innerW, h: 0.18,
      fontSize: 7, bold: true, color: C.sub, charSpacing: 2, fontFace: "Inter",
    });
    y += 0.26;

    // 3 logos in a row
    clients.slice(0, 3).forEach((client, li) => {
      const lx = CX + COL_PAD + li * (LOGO_SZ + LOGO_GAP);
      const domain = enrichStore?.[client.companyId]?.domain ?? "";
      const dataUrl = domain ? (logoCache[domain] ?? "") : "";

      if (dataUrl) {
        // White pill for logo
        slide.addShape("roundRect", {
          x: lx, y, w: LOGO_SZ, h: LOGO_SZ,
          fill: { color: "FFFFFF" }, line: { color: "E8E8EC", width: 0.5 }, rectRadius: 0.10,
        });
        const imgOff = (LOGO_SZ - LOGO_SZ * 0.78) / 2;
        slide.addImage({ data: dataUrl, x: lx + imgOff, y: y + imgOff, w: LOGO_SZ * 0.78, h: LOGO_SZ * 0.78 });
      } else {
        // Dark square with company name
        slide.addShape("roundRect", {
          x: lx, y, w: LOGO_SZ, h: LOGO_SZ,
          fill: { color: C.cardBorder }, line: { color: C.muted, width: 0.5 }, rectRadius: 0.10,
        });
        const label = shortCompanyName(client.name, 9);
        slide.addText(label, {
          x: lx + 0.04, y: y + 0.04, w: LOGO_SZ - 0.08, h: LOGO_SZ - 0.08,
          fontSize: label.length > 6 ? 7 : 9, bold: true, color: C.chipText,
          align: "center", valign: "middle", fontFace: "Inter",
        });
      }

      // Company name below
      slide.addText(shortCompanyName(client.name), {
        x: lx, y: y + LOGO_SZ + 0.05, w: LOGO_SZ, h: 0.18,
        fontSize: 6.5, color: C.sub, align: "center", fontFace: "Inter",
      });
    });
  });

  await pptx.writeFile({ fileName: `${name.replace(/\s+/g, "-")}-factorial.pptx` });

  const user = window.localStorage.getItem("factorial.session.email") ?? "unknown";
  recordPptDownload({
    timestamp: new Date().toISOString(), region: name, country, user,
    sections: ["industries", "modules", "clients"],
  });
}
