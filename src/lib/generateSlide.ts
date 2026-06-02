import type PptxGenJSType from "pptxgenjs";
import { geoMercator, geoPath } from "d3-geo";
import { type WonDeal } from "@/lib/csvStore";
import { groupIndustry } from "@/lib/industryGroups";
import { recordPptDownload, readEnrichmentStore, writeEnrichmentStore, type EnrichmentStore } from "@/lib/enrichmentStore";
import { fetchLogos } from "@/lib/logoStore";
import { lookupHubspotByName } from "@/lib/hubspotLookup";
import { countModulesForIndustry } from "@/lib/bundleModules";

import geoFR from "@/data/france-regions.geojson.json";
import geoES from "@/data/spain-regions.geojson.json";
import geoIT from "@/data/italy-regions.geojson.json";
import geoDE from "@/data/germany-regions.geojson.json";
import geoBR from "@/data/brazil-regions.geojson.json";
import geoPT from "@/data/portugal-regions.geojson.json";
import geoMX from "@/data/mexico-regions.geojson.json";

// ─── Palette (light theme) ────────────────────────────────────────────────────
const C = {
  bg:         "FFFFFF",
  headerBg:   "FFFFFF",
  card:       "FAFAFC",
  cardBorder: "E7E8EE",
  accent:     "FD4F6B",
  accentMid:  "8C1E30",
  accentDark: "1A090E",
  ink:        "1A1B2E", // primary text on white
  white:      "1A1B2E", // alias kept for existing references
  sub:        "6B6E85", // muted text
  muted:      "EEEFF3",
  sep:        "ECEDF1",
  barTrack:   "EEEFF3",
  chipText:   "1A1B2E",
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
    ctx.shadowColor = "rgba(253,79,107,0.45)";
    ctx.shadowBlur = size * 0.03;
    ctx.beginPath();
    pathGen(feature);
    ctx.fillStyle = "#FD4F6B";
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    pathGen(feature);
    ctx.fillStyle = "#FD4F6B";
    ctx.fill();
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = size * 0.0022;
    ctx.stroke();
  } else {
    ctx.beginPath();
    pathGen(feature);
    ctx.fillStyle = "#ECEDF1";
    ctx.fill();
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = size * 0.0014;
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
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, size, size);

  const pathGen = geoPath().projection(projection).context(ctx) as unknown as CanvasPathGen;

  // Draw mainland regions
  for (const f of mainlandFeatures) {
    drawRegion(ctx, pathGen, f, String(f.properties.code) === selectedCode, size);
  }

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
    ctx.fillStyle = "#F7F7FA";
    ctx.fill();
    ctx.strokeStyle = "#E7E8EE";
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
    ctx.fillStyle = "#9A9DB0";
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

  // For each industry: top 3 modules (country-wide) + top 3 clients (by seats in region).
  // A company may only appear in ONE vertical — globally dedupe across columns,
  // processing the largest verticals first so the biggest companies land in their top one.
  const usedCompanies = new Set<string>();
  const industryData = top3Industries.map(([industryName, { count }]) => {
    // Top 3 modules country-wide for this industry (names only, ranked)
    const modules = countModulesForIndustry(deals, industryName, country).slice(0, 3);

    // Top 3 clients in region by seats, with their real full name
    const clients: { name: string; companyId: string; seats: number }[] = [];
    for (const d of [...regionDeals.filter((x) => groupIndustry(x.sector) === industryName)]
      .sort((a, b) => b.seats - a.seats || b.totalActualMrr - a.totalActualMrr)) {
      const key = d.companyName.trim().toLowerCase();
      if (usedCompanies.has(key)) continue;
      usedCompanies.add(key);
      clients.push({ name: d.companyName, companyId: d.companyId, seats: d.seats });
      if (clients.length >= 3) break;
    }

    return { industry: industryName, count, modules, clients };
  });

  // ─── Resolve a domain for each client on the slide ──────────────────────────
  // Start from whatever the enrichment store already knows; for any client still
  // missing a domain, do a quick ad-hoc HubSpot lookup by name (no full sync).
  const slideClients = industryData.flatMap((ind) => ind.clients);
  const domainById = new Map<string, string>();
  for (const c of slideClients) {
    const d = enrichStore?.[c.companyId]?.domain;
    if (d) domainById.set(c.companyId, d);
  }

  const missing = slideClients.filter((c) => !domainById.has(c.companyId));
  if (missing.length > 0) {
    try {
      const hits = await lookupHubspotByName(missing.map((c) => c.name));
      if (hits.size > 0) {
        const persist = readEnrichmentStore();
        for (const c of missing) {
          const hit = hits.get(c.name.trim().toLowerCase());
          if (hit?.found && hit.domain) {
            domainById.set(c.companyId, hit.domain);
            // Cache it so future slides / the detail view reuse it.
            const prev = persist[c.companyId];
            persist[c.companyId] = {
              companyId: c.companyId,
              companyName: c.name,
              hubspotId: hit.hubspotId ?? prev?.hubspotId ?? null,
              hubspotCity: hit.city ?? prev?.hubspotCity ?? null,
              hubspotZip: hit.zip ?? prev?.hubspotZip ?? null,
              domain: hit.domain,
              sireneCity: prev?.sireneCity ?? null,
              sirenePostal: prev?.sirenePostal ?? null,
              sireneSiren: prev?.sireneSiren ?? null,
              regionCode: prev?.regionCode ?? "unknown",
              status: prev?.status ?? "hs-matched",
              enrichedAt: new Date().toISOString(),
              error: null,
              nps: prev?.nps,
            };
          }
        }
        writeEnrichmentStore(persist);
      }
    } catch { /* lookup is best-effort — fall back to initials */ }
  }

  // Collect all unique domains for logos
  const allDomains = [...new Set([...domainById.values()])].filter(Boolean);
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
  const MOD_ROW_H = 0.42;

  // ── HEADER ────────────────────────────────────────────────────────────────
  const verticalsSubtitle = top3Industries.length
    ? `Top verticales: ${top3Industries.map(([n]) => n).join("  ·  ")}`
    : "";

  slide.addShape("rect", { x: 0, y: 0, w: W, h: HEADER_H, fill: { color: C.headerBg }, line: { type: "none" } });
  slide.addShape("rect", { x: 0, y: HEADER_H - 0.03, w: W, h: 0.03, fill: { color: C.accent }, line: { type: "none" } });

  slide.addText("factorial", {
    x: 0.5, y: 0.22, w: 2, h: 0.22,
    fontSize: 11, bold: true, color: C.accent, fontFace: "Inter",
  });
  slide.addText(`Clientes de Factorial en ${name}`, {
    x: 0.5, y: 0.42, w: 9.8, h: 0.62,
    fontSize: 28, bold: true, color: C.ink, fontFace: "Inter",
  });
  slide.addText(verticalsSubtitle, {
    x: 0.5, y: 1.04, w: 9.8, h: 0.30,
    fontSize: 11, color: C.sub, fontFace: "Inter",
  });
  slide.addText(String(regionDeals.length), {
    x: 10.5, y: 0.10, w: 2.7, h: 0.80,
    fontSize: 52, bold: true, color: C.accent, align: "right", valign: "bottom", fontFace: "Inter",
  });
  slide.addText(regionDeals.length === 1 ? "CLIENTE" : "CLIENTES", {
    x: 10.5, y: 1.00, w: 2.7, h: 0.22,
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
    slide.addText("TOP MÓDULOS", {
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
      modules.slice(0, MAX_MODULES).forEach(({ module }, mi) => {
        // Rank badge
        slide.addShape("roundRect", {
          x: CX + COL_PAD, y, w: 0.26, h: 0.26,
          fill: { color: IND_COLORS[colIdx] ?? C.accent }, line: { type: "none" }, rectRadius: 0.06,
        });
        slide.addText(String(mi + 1), {
          x: CX + COL_PAD, y, w: 0.26, h: 0.26,
          fontSize: 9, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: "Inter",
        });
        // Module name
        slide.addText(module, {
          x: CX + COL_PAD + 0.36, y, w: innerW - 0.36, h: 0.26,
          fontSize: 10.5, bold: true, color: C.ink, valign: "middle", fontFace: "Inter",
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
    slide.addText("TOP CLIENTES · REGIÓN", {
      x: CX + COL_PAD, y, w: innerW, h: 0.18,
      fontSize: 7, bold: true, color: C.sub, charSpacing: 2, fontFace: "Inter",
    });
    y += 0.26;

    // 3 logos in a row
    clients.slice(0, 3).forEach((client, li) => {
      const lx = CX + COL_PAD + li * (LOGO_SZ + LOGO_GAP);
      const domain = domainById.get(client.companyId) ?? "";
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
        // Placeholder square with company initials
        slide.addShape("roundRect", {
          x: lx, y, w: LOGO_SZ, h: LOGO_SZ,
          fill: { color: C.muted }, line: { color: C.cardBorder, width: 0.5 }, rectRadius: 0.10,
        });
        const label = shortCompanyName(client.name, 9);
        slide.addText(label, {
          x: lx + 0.04, y: y + 0.04, w: LOGO_SZ - 0.08, h: LOGO_SZ - 0.08,
          fontSize: label.length > 6 ? 7 : 9, bold: true, color: C.sub,
          align: "center", valign: "middle", fontFace: "Inter",
        });
      }

      // Real full company name below
      slide.addText(client.name, {
        x: lx - LOGO_GAP / 2, y: y + LOGO_SZ + 0.05, w: LOGO_SZ + LOGO_GAP, h: 0.30,
        fontSize: 6.5, color: C.ink, align: "center", valign: "top", fontFace: "Inter",
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
