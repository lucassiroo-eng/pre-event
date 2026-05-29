import type PptxGenJSType from "pptxgenjs";
import { REGIONS, type RegionCode, type WonDeal, regionName } from "@/lib/csvStore";
import { groupIndustry } from "@/lib/industryGroups";
import { recordPptDownload } from "@/lib/enrichmentStore";
import type { SlideSection } from "@/components/dashboard/RegionDetail";

const COLOR = {
  bg: "FFF5F7", card: "FFFFFF", ink: "1A1130", sub: "8A8295", subStrong: "6B6478",
  border: "F5E1E6", rowAlt: "FFFAFB", primary: "FD4F6B", primaryDark: "D63E58",
  primarySoft: "FFE3E9", accent: "FFB199",
};

const INDUSTRY_FR: Record<string, string> = {
  "Manufacturing & Industrial": "Industrie", "Transport & Logistics": "Transport",
  "Media & Marketing": "Médias", "Healthcare & Life Sciences": "Santé",
  "Technology & Software": "Technologie", "Software & IT": "Logiciel & IT",
  "Retail & E-commerce": "Commerce", "Construction & Real Estate": "Construction",
  "Hospitality & Food": "Hôtellerie", "Education": "Éducation",
  "Finance & Insurance": "Finance", "Energy & Utilities": "Énergie",
  "Professional Services": "Services pro", "Food & Beverage": "Agroalimentaire",
  "Agriculture": "Agriculture", "Other": "Autre", "Unknown": "Inconnu",
};
const trIndustry = (s: string) => INDUSTRY_FR[s] ?? s;

function getMapSvg(code: RegionCode): string | null {
  const node = document.querySelector<SVGSVGElement>("svg[data-france-map]");
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
      if (o.getAttribute("data-code") === code) {
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

export async function generateRegionSlide(code: RegionCode, deals: WonDeal[], sections: SlideSection[]) {
  const regionDeals = deals.filter((d) => d.regionCode === code);
  const name = regionName(code);
  const n = Math.max(1, sections.length);
  const maxRows = n === 1 ? 6 : n === 2 ? 4 : 3;

  const seenCompany = new Set<string>();
  const topDeals: WonDeal[] = [];
  for (const d of [...regionDeals].sort((a, b) => b.totalActualMrr - a.totalActualMrr)) {
    const key = d.companyName.trim().toLowerCase();
    if (seenCompany.has(key)) continue;
    seenCompany.add(key);
    topDeals.push(d);
    if (topDeals.length >= maxRows) break;
  }

  const industryMap = new Map<string, { count: number; biggest: WonDeal | null }>();
  for (const d of regionDeals) {
    const g = groupIndustry(d.sector);
    if (g === "Other" || g === "Unknown") continue;
    const cur = industryMap.get(g) ?? { count: 0, biggest: null };
    cur.count += 1;
    if (!cur.biggest || d.totalActualMrr > cur.biggest.totalActualMrr) cur.biggest = d;
    industryMap.set(g, cur);
  }
  const topIndustries = Array.from(industryMap.entries())
    .map(([industry, v]) => ({ industry, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, maxRows);

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
  slide.addText(`${regionDeals.length} client${regionDeals.length > 1 ? "s" : ""} en région ${name}.`, {
    x: 0.5, y: 1.5, w: 9, h: 0.35, fontSize: 13, color: COLOR.subStrong, fontFace: "Inter", italic: true,
  });

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
  const blockGap = n === 1 ? 0 : 0.25;
  const perBlockH = (available - blockGap * (n - 1)) / n;
  const padX = 0.3; const padTop = 0.25; const padBottom = 0.3;
  const headerH = n === 1 ? 0.65 : 0.5;
  const headerFs = n === 1 ? 18 : 15;
  const cellFs = n === 1 ? 13 : 12;
  const headLabelFs = n === 1 ? 10 : 9;

  let blockY = topY;

  const padRows = <T,>(arr: T[], blank: T): T[] => {
    if (arr.length >= maxRows) return arr.slice(0, maxRows);
    return [...arr, ...Array(maxRows - arr.length).fill(blank)];
  };

  for (const s of sections) {
    slide.addShape("roundRect", {
      x: contentX, y: blockY, w: contentW, h: perBlockH,
      fill: { color: COLOR.card }, line: { color: COLOR.border, width: 1 }, rectRadius: 0.16,
    });

    slide.addShape("rect", {
      x: contentX + padX, y: blockY + padTop + 0.06, w: 0.14, h: headerH - 0.16,
      fill: { color: COLOR.primary }, line: { type: "none" },
    });

    const headOpts = { bold: true, color: COLOR.subStrong, fontSize: headLabelFs, fill: { color: COLOR.primarySoft }, valign: "middle" as const, charSpacing: 1 };
    const rowH = (perBlockH - padTop - headerH - 0.1 - padBottom) / (maxRows + 1);

    if (s === "topMrr") {
      slide.addText("Top Wons", {
        x: contentX + padX + 0.28, y: blockY + padTop - 0.02, w: contentW - padX * 2 - 0.28, h: headerH,
        fontSize: headerFs, bold: true, color: COLOR.ink, fontFace: "Inter",
      });
      const padded = padRows<WonDeal | null>(topDeals, null);
      const rows = [
        [{ text: "ENTREPRISE", options: headOpts }, { text: "SECTEUR", options: headOpts }, { text: "MRR", options: { ...headOpts, align: "right" as const } }],
        ...padded.map((d, i) => {
          const fill = i % 2 === 1 ? { color: COLOR.rowAlt } : { color: "FFFFFF" };
          const base = { fontSize: cellFs, valign: "middle" as const, fill };
          if (!d) return [{ text: "", options: base }, { text: "", options: base }, { text: "", options: base }];
          return [
            { text: d.companyName, options: { ...base, bold: true, color: COLOR.ink } },
            { text: trIndustry(groupIndustry(d.sector)), options: { ...base, color: COLOR.primaryDark, bold: true } },
            { text: `€${Math.round(d.totalActualMrr)}`, options: { ...base, color: COLOR.ink, align: "right" as const } },
          ];
        }),
      ];
      slide.addTable(rows as any, {
        x: contentX + padX, y: blockY + padTop + headerH + 0.1, w: contentW - padX * 2,
        colW: [contentW - padX * 2 - 2.5 - 1.5, 2.5, 1.5],
        fontFace: "Inter", border: [{ type: "none" }, { type: "none" }, { type: "none" }, { type: "none" }], rowH, margin: 0.1,
      });
    } else if (s === "topIndustries") {
      slide.addText("Top secteurs", {
        x: contentX + padX + 0.28, y: blockY + padTop - 0.02, w: contentW - padX * 2 - 0.28, h: headerH,
        fontSize: headerFs, bold: true, color: COLOR.ink, fontFace: "Inter",
      });
      const blank = { industry: "", count: 0, biggest: null as WonDeal | null };
      const padded = padRows(topIndustries, blank);
      const rows = [
        [{ text: "SECTEUR", options: headOpts }, { text: "WONS", options: { ...headOpts, align: "right" as const } }, { text: "TOP CLIENT", options: headOpts }],
        ...padded.map((r, i) => {
          const fill = i % 2 === 1 ? { color: COLOR.rowAlt } : { color: "FFFFFF" };
          const base = { fontSize: cellFs, valign: "middle" as const, fill };
          if (!r.industry) return [{ text: "", options: base }, { text: "", options: base }, { text: "", options: base }];
          return [
            { text: trIndustry(r.industry), options: { ...base, bold: true, color: COLOR.primaryDark } },
            { text: String(r.count), options: { ...base, color: COLOR.ink, bold: true, align: "right" as const } },
            { text: r.biggest?.companyName ?? "—", options: { ...base, color: COLOR.subStrong } },
          ];
        }),
      ];
      slide.addTable(rows as any, {
        x: contentX + padX, y: blockY + padTop + headerH + 0.1, w: contentW - padX * 2,
        colW: [2.6, 1.1, contentW - padX * 2 - 2.6 - 1.1],
        fontFace: "Inter", border: [{ type: "none" }, { type: "none" }, { type: "none" }, { type: "none" }], rowH, margin: 0.1,
      });
    }

    blockY += perBlockH + blockGap;
  }

  await pptx.writeFile({ fileName: `${name.replace(/\s+/g, "-")}-wons.pptx` });

  const user = window.localStorage.getItem("factorial.session.email") ?? "unknown";
  const country = window.localStorage.getItem("pre-event-country") ?? "fr";
  recordPptDownload({ timestamp: new Date().toISOString(), region: name, country, user, sections });
}
