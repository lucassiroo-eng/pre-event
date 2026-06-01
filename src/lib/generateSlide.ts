import type PptxGenJSType from "pptxgenjs";
import { type WonDeal, formatEUR } from "@/lib/csvStore";
import { groupIndustry } from "@/lib/industryGroups";
import { recordPptDownload } from "@/lib/enrichmentStore";

import geoFR from "@/data/france-regions.geojson.json";
import geoES from "@/data/spain-regions.geojson.json";
import geoIT from "@/data/italy-regions.geojson.json";
import geoDE from "@/data/germany-regions.geojson.json";
import geoBR from "@/data/brazil-regions.geojson.json";
import geoPT from "@/data/portugal-regions.geojson.json";
import geoMX from "@/data/mexico-regions.geojson.json";

type GeoCollection = { features: { properties: { code: unknown; nom: string } }[] };

const GEO_NAMES: Record<string, Record<string, string>> = {};
for (const [c, geo] of Object.entries<GeoCollection>({ fr: geoFR as GeoCollection, es: geoES as GeoCollection, it: geoIT as GeoCollection, de: geoDE as GeoCollection, br: geoBR as GeoCollection, pt: geoPT as GeoCollection, mx: geoMX as GeoCollection })) {
  GEO_NAMES[c] = {};
  for (const f of geo.features) GEO_NAMES[c][String(f.properties.code)] = f.properties.nom;
}

function getRegionName(country: string, code: string): string {
  return GEO_NAMES[country]?.[code] ?? code;
}

const COLOR = {
  bg: "FFF5F7", card: "FFFFFF", ink: "1A1130", sub: "8A8295", subStrong: "6B6478",
  border: "F5E1E6", rowAlt: "FFFAFB", primary: "FD4F6B", primaryDark: "D63E58",
  primarySoft: "FFE3E9", accent: "FFB199",
};

function simplifyPlan(plan: string): string {
  if (!plan) return "";
  return plan
    .replace(/^f25_/i, "")
    .replace(/_(e|b)-(month|year).*$/i, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function getMapSvg(code: string): string | null {
  const node = document.querySelector<SVGSVGElement>("svg[data-country-map]");
  if (!node) return null;
  const clone = node.cloneNode(true) as SVGSVGElement;
  const svgNS = "http://www.w3.org/2000/svg";
  const defs = document.createElementNS(svgNS, "defs");
  defs.innerHTML = `
    <filter id="region-shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
      <feOffset dx="0" dy="2" result="off"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.35"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <linearGradient id="region-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FF7088"/>
      <stop offset="100%" stop-color="#FD4F6B"/>
    </linearGradient>`;
  clone.insertBefore(defs, clone.firstChild);
  const originalPaths = node.querySelectorAll<SVGPathElement>("path");
  const clonePaths = clone.querySelectorAll<SVGPathElement>("path");
  let bbox: DOMRect | null = null;
  clonePaths.forEach((p, i) => {
    const o = originalPaths[i];
    p.removeAttribute("class");
    p.setAttribute("stroke", "#ffffff");
    p.setAttribute("stroke-width", "0.5");
    if (o) {
      if (String(o.getAttribute("data-code")) === code) {
        try { bbox = o.getBBox(); } catch { /* ignore */ }
        p.setAttribute("stroke", "#ffffff"); p.setAttribute("stroke-width", "1.2");
        p.setAttribute("fill", "url(#region-grad)"); p.setAttribute("filter", "url(#region-shadow)");
      } else {
        p.setAttribute("fill", "#F5E1E6"); p.setAttribute("opacity", "0.55");
      }
    }
  });
  if (bbox) {
    const bb = bbox as DOMRect;
    const pad = Math.max(bb.width, bb.height) * 0.2;
    clone.setAttribute("viewBox", `${bb.x - pad} ${bb.y - pad} ${bb.width + pad * 2} ${bb.height + pad * 2}`);
  }
  clone.setAttribute("preserveAspectRatio", "xMidYMid meet");
  return new XMLSerializer().serializeToString(clone);
}

async function svgToPngDataUrl(svg: string, w = 800, h = 800): Promise<string | null> {
  return new Promise((resolve) => {
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(null); return; }
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

export async function generateRegionSlide(code: string, deals: WonDeal[], country: string) {
  const regionDeals = deals.filter((d) => d.regionCode === code);
  const name = getRegionName(country, code);
  const totalMrr = regionDeals.reduce((s, d) => s + d.totalActualMrr, 0);

  // Top 3 industries from the region
  type IndAcc = { count: number; deals: WonDeal[] };
  const industryMap = new Map<string, IndAcc>();
  for (const d of regionDeals) {
    const g = groupIndustry(d.sector);
    if (g === "Other" || g === "Unknown") continue;
    const cur: IndAcc = industryMap.get(g) ?? { count: 0, deals: [] };
    cur.count += 1;
    cur.deals.push(d);
    industryMap.set(g, cur);
  }
  const top3Industries = Array.from(industryMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 3);

  const top3Names = new Set(top3Industries.map(([name]) => name));

  // Top modules from the WHOLE COUNTRY for those top 3 industries
  const moduleCount = new Map<string, number>();
  for (const d of deals) {
    const g = groupIndustry(d.sector);
    if (!top3Names.has(g)) continue;
    const mod = simplifyPlan(d.planName);
    if (mod) moduleCount.set(mod, (moduleCount.get(mod) ?? 0) + 1);
  }
  const topModules = Array.from(moduleCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  // Top 3 companies from region (across top 3 industries), sorted by MRR
  const allDealsFrom3 = top3Industries.flatMap(([, v]) => v.deals);
  const seenCompany = new Set<string>();
  const topCompanies: { name: string; industry: string; mrr: number }[] = [];
  for (const d of [...allDealsFrom3].sort((a, b) => b.totalActualMrr - a.totalActualMrr)) {
    const key = d.companyName.trim().toLowerCase();
    if (seenCompany.has(key)) continue;
    seenCompany.add(key);
    topCompanies.push({ name: d.companyName, industry: groupIndustry(d.sector), mrr: d.totalActualMrr });
    if (topCompanies.length >= 3) break;
  }

  // --- Slide ---

  const svg = getMapSvg(code);
  const mapPng = svg ? await svgToPngDataUrl(svg, 1000, 1000) : null;

  const PptxMod = (await import("pptxgenjs")).default as unknown as new () => PptxGenJSType;
  const pptx = new PptxMod();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = `${name} · Wons`;

  const slide = pptx.addSlide();
  slide.background = { color: COLOR.bg };

  slide.addShape("rect", { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: COLOR.primary }, line: { type: "none" } });

  slide.addText("WONS · PRE-EVENT", {
    x: 0.5, y: 0.35, w: 8, h: 0.3, fontSize: 10, bold: true, color: COLOR.primary, charSpacing: 3, fontFace: "Inter",
  });
  slide.addText(name, {
    x: 0.5, y: 0.6, w: 9, h: 0.85, fontSize: 40, bold: true, color: COLOR.ink, fontFace: "Inter",
  });
  slide.addText(
    `${regionDeals.length} client${regionDeals.length > 1 ? "s" : ""} · MRR ${formatEUR(totalMrr)}`,
    { x: 0.5, y: 1.5, w: 9, h: 0.35, fontSize: 13, color: COLOR.subStrong, fontFace: "Inter", italic: true },
  );

  slide.addShape("roundRect", {
    x: 11.1, y: 0.5, w: 1.8, h: 0.5, fill: { color: COLOR.primarySoft }, line: { type: "none" }, rectRadius: 0.25,
  });
  slide.addText(`${regionDeals.length} client${regionDeals.length > 1 ? "s" : ""}`, {
    x: 11.1, y: 0.5, w: 1.8, h: 0.5, fontSize: 13, bold: true, color: COLOR.primaryDark, align: "center", valign: "middle", fontFace: "Inter",
  });

  slide.addShape("roundRect", {
    x: 0.5, y: 1.95, w: 4.2, h: 5.4, fill: { color: COLOR.card }, line: { color: COLOR.border, width: 1 }, rectRadius: 0.2,
  });
  if (mapPng) slide.addImage({ data: mapPng, x: 0.65, y: 2.1, w: 3.9, h: 5.1 });

  const contentX = 5.0;
  const contentW = 7.83;
  const topY = 1.95;
  const bottomY = 7.35;
  const available = bottomY - topY;
  const blockGap = 0.18;
  const perBlockH = (available - blockGap * 2) / 3;
  const padX = 0.25;
  const padTop = 0.18;
  const headerH = 0.4;
  const headerFs = 13;
  const cellFs = 11;
  const headLabelFs = 8;
  const headOpts = { bold: true, color: COLOR.subStrong, fontSize: headLabelFs, fill: { color: COLOR.primarySoft }, valign: "middle" as const, charSpacing: 1 };

  const drawCard = (y: number) => {
    slide.addShape("roundRect", {
      x: contentX, y, w: contentW, h: perBlockH,
      fill: { color: COLOR.card }, line: { color: COLOR.border, width: 1 }, rectRadius: 0.14,
    });
  };
  const drawAccent = (y: number) => {
    slide.addShape("rect", {
      x: contentX + padX, y: y + padTop + 0.04, w: 0.12, h: headerH - 0.12,
      fill: { color: COLOR.primary }, line: { type: "none" },
    });
  };
  const drawTitle = (y: number, title: string) => {
    slide.addText(title, {
      x: contentX + padX + 0.22, y: y + padTop - 0.02, w: contentW - padX * 2 - 0.22, h: headerH,
      fontSize: headerFs, bold: true, color: COLOR.ink, fontFace: "Inter",
    });
  };

  const tableY = (blockY: number) => blockY + padTop + headerH + 0.06;
  const rowH = (perBlockH - padTop - headerH - 0.06 - 0.15) / 4;
  const innerW = contentW - padX * 2;

  // Block 1: Top 3 Industries (region)
  let y = topY;
  drawCard(y); drawAccent(y); drawTitle(y, "Top 3 Sectors");

  const indRows: any[][] = [
    [
      { text: "SECTOR", options: headOpts },
      { text: "WONS", options: { ...headOpts, align: "right" as const } },
      { text: "MRR", options: { ...headOpts, align: "right" as const } },
    ],
    ...top3Industries.map(([ind, v], i) => {
      const fill = i % 2 === 1 ? { color: COLOR.rowAlt } : { color: "FFFFFF" };
      const base = { fontSize: cellFs, valign: "middle" as const, fill };
      const mrr = v.deals.reduce((s: number, d: WonDeal) => s + d.totalActualMrr, 0);
      return [
        { text: ind, options: { ...base, bold: true, color: COLOR.primaryDark } },
        { text: String(v.count), options: { ...base, color: COLOR.ink, bold: true, align: "right" as const } },
        { text: formatEUR(mrr), options: { ...base, color: COLOR.ink, align: "right" as const } },
      ];
    }),
  ];
  while (indRows.length < 4) {
    const fill = (indRows.length - 1) % 2 === 1 ? { color: COLOR.rowAlt } : { color: "FFFFFF" };
    const base = { fontSize: cellFs, valign: "middle" as const, fill };
    indRows.push([{ text: "", options: base }, { text: "", options: base }, { text: "", options: base }]);
  }
  slide.addTable(indRows, {
    x: contentX + padX, y: tableY(y), w: innerW,
    colW: [innerW - 1.2 - 1.5, 1.2, 1.5],
    fontFace: "Inter", border: [{ type: "none" }, { type: "none" }, { type: "none" }, { type: "none" }], rowH, margin: 0.08,
  });

  // Block 2: Top Modules (country-wide, for the top 3 industries of this region)
  y += perBlockH + blockGap;
  drawCard(y); drawAccent(y); drawTitle(y, "Top Modules · Country");

  const countryTotalForIndustries = deals.filter((d) => top3Names.has(groupIndustry(d.sector))).length;

  const modRows: any[][] = [
    [
      { text: "MODULE", options: headOpts },
      { text: "CONTRACTS", options: { ...headOpts, align: "right" as const } },
      { text: "% COUNTRY", options: { ...headOpts, align: "right" as const } },
    ],
    ...topModules.map(([mod, cnt], i) => {
      const fill = i % 2 === 1 ? { color: COLOR.rowAlt } : { color: "FFFFFF" };
      const base = { fontSize: cellFs, valign: "middle" as const, fill };
      const pct = countryTotalForIndustries > 0 ? ((cnt / countryTotalForIndustries) * 100).toFixed(0) + "%" : "—";
      return [
        { text: mod, options: { ...base, bold: true, color: COLOR.ink } },
        { text: String(cnt), options: { ...base, color: COLOR.ink, bold: true, align: "right" as const } },
        { text: pct, options: { ...base, color: COLOR.subStrong, align: "right" as const } },
      ];
    }),
  ];
  while (modRows.length < 4) {
    const fill = (modRows.length - 1) % 2 === 1 ? { color: COLOR.rowAlt } : { color: "FFFFFF" };
    const base = { fontSize: cellFs, valign: "middle" as const, fill };
    modRows.push([{ text: "", options: base }, { text: "", options: base }, { text: "", options: base }]);
  }
  slide.addTable(modRows, {
    x: contentX + padX, y: tableY(y), w: innerW,
    colW: [innerW - 1.4 - 1.4, 1.4, 1.4],
    fontFace: "Inter", border: [{ type: "none" }, { type: "none" }, { type: "none" }, { type: "none" }], rowH, margin: 0.08,
  });

  // Block 3: Top 3 Companies (region)
  y += perBlockH + blockGap;
  drawCard(y); drawAccent(y); drawTitle(y, "Top 3 Companies");

  const compRows: any[][] = [
    [
      { text: "COMPANY", options: headOpts },
      { text: "SECTOR", options: headOpts },
      { text: "MRR", options: { ...headOpts, align: "right" as const } },
    ],
    ...topCompanies.map((c, i) => {
      const fill = i % 2 === 1 ? { color: COLOR.rowAlt } : { color: "FFFFFF" };
      const base = { fontSize: cellFs, valign: "middle" as const, fill };
      return [
        { text: c.name, options: { ...base, bold: true, color: COLOR.ink } },
        { text: c.industry, options: { ...base, color: COLOR.primaryDark, bold: true } },
        { text: formatEUR(c.mrr), options: { ...base, color: COLOR.ink, align: "right" as const } },
      ];
    }),
  ];
  while (compRows.length < 4) {
    const fill = (compRows.length - 1) % 2 === 1 ? { color: COLOR.rowAlt } : { color: "FFFFFF" };
    const base = { fontSize: cellFs, valign: "middle" as const, fill };
    compRows.push([{ text: "", options: base }, { text: "", options: base }, { text: "", options: base }]);
  }
  slide.addTable(compRows, {
    x: contentX + padX, y: tableY(y), w: innerW,
    colW: [innerW - 2.2 - 1.5, 2.2, 1.5],
    fontFace: "Inter", border: [{ type: "none" }, { type: "none" }, { type: "none" }, { type: "none" }], rowH, margin: 0.08,
  });

  await pptx.writeFile({ fileName: `${name.replace(/\s+/g, "-")}-wons.pptx` });

  const user = window.localStorage.getItem("factorial.session.email") ?? "unknown";
  recordPptDownload({ timestamp: new Date().toISOString(), region: name, country, user, sections: ["industries", "modules-country", "companies"] });
}
