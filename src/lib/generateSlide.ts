import type PptxGenJSType from "pptxgenjs";
import { REGIONS, type RegionCode } from "@/data/mockData";
import { groupIndustry } from "@/lib/industryGroups";
import type { HubspotWonDeal, SyncResult } from "@/lib/hubspot.functions";
import type { SlideSection } from "@/components/dashboard/RegionLiveDetail";

const REGION_NAME: Record<string, string> = Object.fromEntries(
  REGIONS.map((r) => [r.code, r.name]),
);

// Factorial palette
const COLOR = {
  bg: "FFF5F7",
  card: "FFFFFF",
  ink: "1A1130",
  sub: "8A8295",
  subStrong: "6B6478",
  border: "F5E1E6",
  rowAlt: "FFFAFB",
  primary: "FD4F6B",
  primaryDark: "D63E58",
  primarySoft: "FFE3E9",
  accent: "FFB199",
};

// Industry → French label
const INDUSTRY_FR: Record<string, string> = {
  "Manufacturing & Industrial": "Industrie & Manufacture",
  "Transport & Logistics": "Transport & Logistique",
  "Media & Marketing": "Médias & Marketing",
  "Healthcare & Life Sciences": "Santé & Sciences du vivant",
  "Technology & Software": "Technologie & Logiciel",
  "Retail & E-commerce": "Commerce & E-commerce",
  "Construction & Real Estate": "Construction & Immobilier",
  "Hospitality & Tourism": "Hôtellerie & Tourisme",
  "Education": "Éducation",
  "Finance & Insurance": "Finance & Assurance",
  "Energy & Utilities": "Énergie & Utilités",
  "Professional Services": "Services professionnels",
  "Food & Beverage": "Agroalimentaire",
  "Agriculture": "Agriculture",
  "Other": "Autre",
  "Unknown": "Inconnu",
};
const trIndustry = (s: string) => INDUSTRY_FR[s] ?? s;

function getMapSvg(code: RegionCode): string | null {
  const node = document.querySelector<SVGSVGElement>("svg[data-france-map]");
  if (!node) return null;
  const clone = node.cloneNode(true) as SVGSVGElement;

  // Inject drop-shadow filter for the highlighted region
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
  let bbox: { x: number; y: number; width: number; height: number } | null = null;

  clonePaths.forEach((p, i) => {
    const o = originalPaths[i];
    p.removeAttribute("class");
    p.setAttribute("stroke", "#ffffff");
    p.setAttribute("stroke-width", "0.5");
    if (o) {
      if (o.getAttribute("data-code") === code) {
        try { bbox = o.getBBox(); } catch { /* ignore */ }
        p.setAttribute("stroke", "#ffffff");
        p.setAttribute("stroke-width", "1.2");
        p.setAttribute("fill", "url(#region-grad)");
        p.setAttribute("filter", "url(#region-shadow)");
      } else {
        p.setAttribute("fill", "#F5E1E6");
        p.setAttribute("opacity", "0.55");
      }
    }
  });

  if (bbox) {
    const bb = bbox as { x: number; y: number; width: number; height: number };
    const pad = Math.max(bb.width, bb.height) * 0.2;
    clone.setAttribute(
      "viewBox",
      `${bb.x - pad} ${bb.y - pad} ${bb.width + pad * 2} ${bb.height + pad * 2}`,
    );
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
      // Transparent background so the card behind shows through cleanly
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

export async function generateRegionSlide(
  code: RegionCode,
  sync: SyncResult,
  sections: SlideSection[],
) {
  const regionDeals = sync.deals.filter((d) => d.regionCode === code);
  const name = REGION_NAME[code] ?? code;

  const n = Math.max(1, sections.length);
  const maxRows = n === 1 ? 6 : n === 2 ? 4 : 3;

  const wonDeals = regionDeals.filter((d) => d.isWon);

  // Top clients by MRR, deduped by company so the same client never repeats
  const seenCompany = new Set<string>();
  const topDeals: HubspotWonDeal[] = [];
  for (const d of [...wonDeals].sort((a, b) => (b.mrr ?? 0) - (a.mrr ?? 0))) {
    const key = (d.companyName ?? d.dealname ?? d.dealId).trim().toLowerCase();
    if (seenCompany.has(key)) continue;
    seenCompany.add(key);
    topDeals.push(d);
    if (topDeals.length >= maxRows) break;
  }

  const industryMap = new Map<string, { count: number; biggest: HubspotWonDeal | null }>();
  for (const d of wonDeals) {
    const g = groupIndustry(d.industry);
    if (g === "Other" || g === "Unknown") continue;
    const cur = industryMap.get(g) ?? { count: 0, biggest: null };
    cur.count += 1;
    if (!cur.biggest || (d.mrr ?? 0) > (cur.biggest.mrr ?? 0)) cur.biggest = d;
    industryMap.set(g, cur);
  }
  const topIndustries = Array.from(industryMap.entries())
    .map(([industry, v]) => ({ industry, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, maxRows);

  const demoIndustryMap = new Map<string, { count: number; biggest: HubspotWonDeal | null }>();
  for (const d of regionDeals) {
    if (!d.dateEnteredDemoStage) continue;
    const g = groupIndustry(d.industry);
    if (g === "Other" || g === "Unknown") continue;
    const cur = demoIndustryMap.get(g) ?? { count: 0, biggest: null };
    cur.count += 1;
    if (!cur.biggest || (d.mrr ?? 0) > (cur.biggest.mrr ?? 0)) cur.biggest = d;
    demoIndustryMap.set(g, cur);
  }
  const topDemoIndustries = Array.from(demoIndustryMap.entries())
    .map(([industry, v]) => ({ industry, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, maxRows);

  const svg = getMapSvg(code);
  const mapPng = svg ? await svgToPngDataUrl(svg, 1000, 1000) : null;

  const PptxMod = (await import("pptxgenjs")).default as unknown as new () => PptxGenJSType;
  const pptx = new PptxMod();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  pptx.title = `${name} · Affaires gagnées`;

  const slide = pptx.addSlide();
  slide.background = { color: COLOR.bg };

  // Top accent bar
  slide.addShape("rect", {
    x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: COLOR.primary }, line: { type: "none" },
  });

  // Header
  slide.addText("AFFAIRES GAGNÉES · HUBSPOT", {
    x: 0.5, y: 0.35, w: 8, h: 0.3,
    fontSize: 10, bold: true, color: COLOR.primary, charSpacing: 3, fontFace: "Inter",
  });
  slide.addText(name, {
    x: 0.5, y: 0.6, w: 9, h: 0.85,
    fontSize: 40, bold: true, color: COLOR.ink, fontFace: "Inter",
  });
  // Subtitle
  slide.addText(
    `Factorial est présent en région ${name} avec ${regionDeals.length} client${regionDeals.length > 1 ? "s" : ""}.`,
    {
      x: 0.5, y: 1.5, w: 9, h: 0.35,
      fontSize: 13, color: COLOR.subStrong, fontFace: "Inter", italic: true,
    },
  );

  // Stat pill (top-right)
  slide.addShape("roundRect", {
    x: 11.1, y: 0.5, w: 1.8, h: 0.5, fill: { color: COLOR.primarySoft },
    line: { type: "none" }, rectRadius: 0.25,
  });
  slide.addText(`${regionDeals.length} client${regionDeals.length > 1 ? "s" : ""}`, {
    x: 11.1, y: 0.5, w: 1.8, h: 0.5,
    fontSize: 13, bold: true, color: COLOR.primaryDark, align: "center", valign: "middle", fontFace: "Inter",
  });

  // Map panel (left)
  slide.addShape("roundRect", {
    x: 0.5, y: 1.95, w: 4.2, h: 5.4, fill: { color: COLOR.card },
    line: { color: COLOR.border, width: 1 }, rectRadius: 0.2,
  });
  if (mapPng) {
    slide.addImage({ data: mapPng, x: 0.65, y: 2.1, w: 3.9, h: 5.1 });
  }

  const contentX = 5.0;
  const contentW = 7.83;
  const topY = 1.95;
  const bottomY = 7.35;
  const available = bottomY - topY;

  const blockGap = n === 1 ? 0 : n === 2 ? 0.25 : 0.14;
  const perBlockH = (available - blockGap * (n - 1)) / n;

  // Card paddings
  const padX = n === 3 ? 0.22 : 0.3;
  const padTop = n === 3 ? 0.1 : 0.25;
  const padBottom = n === 3 ? 0.1 : 0.3;
  // Header
  const headerH = n === 1 ? 0.65 : n === 2 ? 0.5 : 0.32;
  const headerFs = n === 1 ? 18 : n === 2 ? 15 : 12;
  // Table sizing
  const headerGap = n === 3 ? 0.03 : 0.1;
  const innerTableY = (blockY: number) => blockY + padTop + headerH + headerGap;
  const tableH = (blockH: number) => blockH - padTop - headerH - headerGap - padBottom;
  const dataRows = maxRows;
  const headLabelFs = n === 1 ? 10 : n === 3 ? 7 : 9;
  const cellFs = n === 1 ? 13 : n === 2 ? 12 : 9;
  const tableMargin = n === 3 ? 0.03 : 0.1;

  let blockY = topY;

  const drawCard = (h: number) => {
    slide.addShape("roundRect", {
      x: contentX, y: blockY, w: contentW, h,
      fill: { color: COLOR.card }, line: { color: COLOR.border, width: 1 },
      rectRadius: 0.16,
    });
  };

  const drawHeader = (title: string, subtitle?: string) => {
    slide.addShape("rect", {
      x: contentX + padX, y: blockY + padTop + 0.06, w: 0.14, h: headerH - 0.16,
      fill: { color: COLOR.primary }, line: { type: "none" },
    });
    slide.addText(title, {
      x: contentX + padX + 0.28, y: blockY + padTop - 0.02,
      w: contentW - padX * 2 - 0.28, h: headerH,
      fontSize: headerFs, bold: true, color: COLOR.ink, fontFace: "Inter",
    });
    if (subtitle && n === 1) {
      slide.addText(subtitle, {
        x: contentX + padX + 0.28, y: blockY + padTop + 0.38,
        w: contentW - padX * 2 - 0.28, h: 0.3,
        fontSize: 11, color: COLOR.sub, fontFace: "Inter", italic: true,
      });
    }
  };

  const padRows = <T,>(arr: T[], blank: T): T[] => {
    if (arr.length >= dataRows) return arr.slice(0, dataRows);
    return [...arr, ...Array(dataRows - arr.length).fill(blank)];
  };

  const drawTable = (rows: any[], colW: number[], blockH: number) => {
    const ty = innerTableY(blockY);
    const th = tableH(blockH);
    const rowH = th / (dataRows + 1); // +1 for header row
    slide.addTable(rows, {
      x: contentX + padX, y: ty, w: contentW - padX * 2,
      colW,
      fontFace: "Inter",
      border: [{ type: "none" }, { type: "none" }, { type: "none" }, { type: "none" }],
      rowH,
      margin: tableMargin,
    });
  };

  const dealsRows = (deals: HubspotWonDeal[]) => {
    const padded: (HubspotWonDeal | null)[] = padRows<HubspotWonDeal | null>(deals as (HubspotWonDeal | null)[], null);
    const headOpts = {
      bold: true, color: COLOR.subStrong, fontSize: headLabelFs,
      fill: { color: COLOR.primarySoft }, valign: "middle" as const, charSpacing: 1,
    };
    return [
      [
        { text: "ENTREPRISE", options: headOpts },
        { text: "VILLE", options: headOpts },
        { text: "SECTEUR", options: headOpts },
      ],
      ...padded.map((d, i): any => {
        const fill = i % 2 === 1 ? { color: COLOR.rowAlt } : { color: "FFFFFF" };
        const cellBase = { fontSize: cellFs, valign: "middle" as const, fill };
        if (!d) {
          return [
            { text: "", options: cellBase },
            { text: "", options: cellBase },
            { text: "", options: cellBase },
          ];
        }
        return [
          { text: d.companyName ?? d.dealname ?? "—", options: { ...cellBase, bold: true, color: COLOR.ink } },
          { text: d.city ?? "—", options: { ...cellBase, color: COLOR.subStrong } },
          { text: trIndustry(groupIndustry(d.industry)), options: { ...cellBase, color: COLOR.primaryDark, bold: true } },
        ];
      }),
    ];
  };

  const industriesRows = (rows: { industry: string; count: number; biggest: HubspotWonDeal | null }[], countLabel = "AFFAIRES") => {
    const blank = { industry: "", count: 0, biggest: null as HubspotWonDeal | null };
    const padded = padRows(rows, blank);
    const headOpts = {
      bold: true, color: COLOR.subStrong, fontSize: headLabelFs,
      fill: { color: COLOR.primarySoft }, valign: "middle" as const, charSpacing: 1,
    };
    return [
      [
        { text: "SECTEUR", options: headOpts },
        { text: countLabel, options: { ...headOpts, align: "right" as const } },
        { text: "ENTREPRISE PHARE", options: headOpts },
      ],
      ...padded.map((r, i): any => {
        const isEmpty = !r.industry;
        const fill = i % 2 === 1 ? { color: COLOR.rowAlt } : { color: "FFFFFF" };
        const cellBase = { fontSize: cellFs, valign: "middle" as const, fill };
        return [
          { text: isEmpty ? "" : trIndustry(r.industry), options: { ...cellBase, bold: true, color: COLOR.primaryDark } },
          { text: isEmpty ? "" : String(r.count), options: { ...cellBase, color: COLOR.ink, bold: true, align: "right" as const } },
          { text: isEmpty ? "" : (r.biggest?.companyName ?? r.biggest?.dealname ?? "—"), options: { ...cellBase, color: COLOR.subStrong } },
        ];
      }),
    ];
  };

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    drawCard(perBlockH);
    let title = "";
    let subtitle: string | undefined;
    let rows: any[] = [];
    let colW: number[] = [];
    if (s === "topMrr") {
      title = n === 1 ? `Top ${dataRows} Wons` : "Top Wons";
      subtitle = `Les ${dataRows} Wons principaux de la région ${name}.`;
      rows = dealsRows(topDeals);
      colW = [contentW - padX * 2 - 1.5 - 2.5, 1.5, 2.5];
    } else if (s === "topIndustries") {
      title = n === 1 ? `Top ${dataRows} secteurs` : "Top secteurs";
      subtitle = "Classés par nombre d'affaires.";
      rows = industriesRows(topIndustries, "AFFAIRES");
      colW = [2.6, 1.1, contentW - padX * 2 - 2.6 - 1.1];
    } else if (s === "recent") {
      title = n === 1 ? `Top ${dataRows} secteurs (démos)` : "Top secteurs · démos";
      subtitle = "Classés par nombre de démos dans la région.";
      rows = industriesRows(topDemoIndustries, "DÉMOS");
      colW = [2.6, 1.1, contentW - padX * 2 - 2.6 - 1.1];
    }
    drawHeader(title, subtitle);
    drawTable(rows, colW, perBlockH);
    blockY += perBlockH + blockGap;
  }

  await pptx.writeFile({ fileName: `${name.replace(/\s+/g, "-")}-affaires-gagnees.pptx` });
}
