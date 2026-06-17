import { type WonDeal } from "@/lib/csvStore";
import { groupIndustry } from "@/lib/industryGroups";
import { recordPptDownload, type EnrichmentStore } from "@/lib/enrichmentStore";
import { countModulesForIndustry } from "@/lib/bundleModules";
import { localeForCountry, type Locale } from "@/lib/i18n";

import geoFR from "@/data/france-regions.geojson.json";
import geoES from "@/data/spain-regions.geojson.json";
import geoIT from "@/data/italy-regions.geojson.json";
import geoDE from "@/data/germany-regions.geojson.json";
import geoBR from "@/data/brazil-regions.geojson.json";
import geoPT from "@/data/portugal-regions.geojson.json";
import geoMX from "@/data/mexico-regions.geojson.json";

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

const FLAGS: Record<string, string> = {
  fr: "\u{1F1EB}\u{1F1F7}", es: "\u{1F1EA}\u{1F1F8}", it: "\u{1F1EE}\u{1F1F9}",
  de: "\u{1F1E9}\u{1F1EA}", pt: "\u{1F1F5}\u{1F1F9}", br: "\u{1F1E7}\u{1F1F7}",
  mx: "\u{1F1F2}\u{1F1FD}",
};

// Factorial isotype SVG (the person/circle mark)
const ISO_SVG = `<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="36" height="36" rx="8" fill="#FF355E"/>
  <circle cx="18" cy="13" r="5" fill="white"/>
  <path d="M6 30c0-6.627 5.373-12 12-12s12 5.373 12 12" stroke="white" stroke-width="2.5" stroke-linecap="round" fill="none"/>
</svg>`;

// Brand colors — Factorial design system
const CORAL  = "#FF355E";
const CORAL2 = "#E8294F";
const NAVY   = "#1A1A2E";
const GRAY1  = "#4A4A5C";
const GRAY2  = "#6C6C7D";
const GRAY3  = "#A0A0B0";
const BORDER = "#EDEDF0";
const BGSLIDE = "#FAFAFA";
const BGCARD = "#FFFFFF";

// Industry accent colors (warm palette)
const IND_COLORS = ["#FF355E", "#FF6B35", "#00B4A0"];
const IND_BG     = ["#FFF0F3", "#FFF4ED", "#EDFAF8"];
const IND_BORDER = ["#FFD4DD", "#FFDBC8", "#B8EDE6"];

const T: Record<Locale, {
  title: (n: number, r: string) => string;
  subtitle: (r: string) => string;
  clients: string; topMod: string; topCli: string;
}> = {
  es: {
    title: (n, r) => `Factorial cuenta con <span style="color:${CORAL};font-weight:800;">${n}</span> clientes en ${r}`,
    subtitle: (r) => `Las 3 industrias m&aacute;s presentes en ${r} son:`,
    clients: "clientes", topMod: "TOP M&Oacute;DULOS", topCli: "TOP CLIENTES",
  },
  fr: {
    title: (n, r) => `Factorial compte <span style="color:${CORAL};font-weight:800;">${n}</span> clients dans ${r}`,
    subtitle: (r) => `Les 3 industries les plus pr&eacute;sentes dans ${r} sont :`,
    clients: "clients", topMod: "TOP MODULES", topCli: "TOP CLIENTS",
  },
  it: {
    title: (n, r) => `Factorial ha <span style="color:${CORAL};font-weight:800;">${n}</span> clienti in ${r}`,
    subtitle: (r) => `Le 3 industrie pi&ugrave; presenti in ${r} sono:`,
    clients: "clienti", topMod: "TOP MODULI", topCli: "TOP CLIENTI",
  },
  de: {
    title: (n, r) => `Factorial hat <span style="color:${CORAL};font-weight:800;">${n}</span> Kunden in ${r}`,
    subtitle: (r) => `Die 3 wichtigsten Branchen in ${r} sind:`,
    clients: "Kunden", topMod: "TOP MODULE", topCli: "TOP KUNDEN",
  },
  pt: {
    title: (n, r) => `Factorial tem <span style="color:${CORAL};font-weight:800;">${n}</span> clientes em ${r}`,
    subtitle: (r) => `As 3 ind&uacute;strias mais presentes em ${r} s&atilde;o:`,
    clients: "clientes", topMod: "TOP M&Oacute;DULOS", topCli: "TOP CLIENTES",
  },
  en: {
    title: (n, r) => `Factorial has <span style="color:${CORAL};font-weight:800;">${n}</span> clients in ${r}`,
    subtitle: (r) => `The top 3 industries in ${r} are:`,
    clients: "clients", topMod: "TOP MODULES", topCli: "TOP CLIENTS",
  },
};

function buildHtml(
  region: string, total: number,
  data: { industry: string; count: number; modules: { module: string }[]; clients: { name: string }[] }[],
  locale: Locale, flag: string,
): string {
  const t = T[locale] ?? T.en;
  const names = data.map(d => d.industry).join(", ");

  const SLIDE_W = 1280;
  const SLIDE_H = 720;
  const MARGIN  = 64;
  const HERO_H  = 160;
  const FOOTER_H = 44;
  const CARDS_TOP = HERO_H + 24;
  const CARDS_H   = SLIDE_H - CARDS_TOP - FOOTER_H - 16;
  const CONTENT_W = SLIDE_W - MARGIN * 2;
  const GAP       = 20;
  const COL_W     = Math.floor((CONTENT_W - GAP * 2) / 3);

  const cards = data.map((d, i) => {
    const cc  = IND_COLORS[i] ?? CORAL;
    const cbg = IND_BG[i] ?? "#F9F9FB";
    const cbd = IND_BORDER[i] ?? BORDER;
    const left = MARGIN + i * (COL_W + GAP);

    const header = `
      <div style="padding:18px 20px 14px;border-bottom:1px solid ${BORDER};">
        <div style="display:table;width:100%;">
          <div style="display:table-cell;vertical-align:middle;">
            <div style="font-size:16px;font-weight:700;color:${NAVY};line-height:1.2;letter-spacing:-0.2px;">${d.industry}</div>
          </div>
          <div style="display:table-cell;vertical-align:middle;text-align:right;">
            <div style="display:inline-block;background:${cbg};border:1px solid ${cbd};border-radius:20px;padding:3px 12px;font-size:12px;font-weight:700;color:${cc};font-variant-numeric:tabular-nums;">${d.count}</div>
          </div>
        </div>
      </div>`;

    const modRows = d.modules.map((m, mi) => `
      <div style="display:table;width:100%;margin-bottom:6px;">
        <div style="display:table-cell;width:24px;vertical-align:top;">
          <div style="width:22px;height:22px;border-radius:6px;background:${cc};color:#FFFFFF;font-size:10px;font-weight:700;text-align:center;line-height:22px;">${mi + 1}</div>
        </div>
        <div style="display:table-cell;vertical-align:middle;padding-left:8px;font-size:12px;font-weight:600;color:${NAVY};">${m.module}</div>
      </div>`).join("");

    const modulesSection = `
      <div style="background:${cbg};padding:14px 20px;border-bottom:1px solid ${BORDER};">
        <div style="font-size:9px;font-weight:700;color:${GRAY3};letter-spacing:2px;text-transform:uppercase;margin-bottom:10px;">${t.topMod}</div>
        ${modRows || `<div style="font-size:12px;color:${GRAY3};">&mdash;</div>`}
      </div>`;

    const cliRows = d.clients.map((cl, ci) => `
      <div style="display:table;width:100%;margin-bottom:4px;">
        <div style="display:table-cell;width:20px;vertical-align:top;font-size:11px;font-weight:700;color:${GRAY3};font-variant-numeric:tabular-nums;">${ci + 1}.</div>
        <div style="display:table-cell;vertical-align:top;font-size:12px;font-weight:500;color:${GRAY1};padding-left:2px;line-height:1.3;">${cl.name}</div>
      </div>`).join("");

    const clientsSection = `
      <div style="padding:14px 20px;">
        <div style="font-size:9px;font-weight:700;color:${GRAY3};letter-spacing:2px;text-transform:uppercase;margin-bottom:10px;">${t.topCli}</div>
        ${cliRows}
      </div>`;

    return `
      <div style="position:absolute;left:${left}px;top:${CARDS_TOP}px;width:${COL_W}px;height:${CARDS_H}px;background:${BGCARD};border-radius:14px;border:1px solid ${BORDER};overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.04),0 8px 24px rgba(0,0,0,0.03);">
        ${header}
        ${modulesSection}
        ${clientsSection}
      </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  @media print { .slide { page-break-after: always; } }
</style>
</head>
<body>
<div class="slide" id="slide-0" style="width:${SLIDE_W}px;height:${SLIDE_H}px;position:relative;background:${BGSLIDE};overflow:hidden;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">

  <!-- Hero banner with gradient -->
  <div style="position:absolute;top:0;left:0;width:${SLIDE_W}px;height:${HERO_H}px;background:linear-gradient(135deg, #FF506B 0%, #E8294F 60%, #C41E3A 100%);overflow:hidden;">
    <!-- Decorative glow -->
    <div style="position:absolute;top:-60px;right:-40px;width:400px;height:300px;background:radial-gradient(ellipse, rgba(255,255,255,0.15), transparent 70%);"></div>
    <div style="position:absolute;bottom:-80px;left:-60px;width:350px;height:250px;background:radial-gradient(ellipse, rgba(0,0,0,0.12), transparent 70%);"></div>

    <!-- Header row -->
    <div style="position:absolute;top:0;left:0;right:0;height:44px;display:table;table-layout:fixed;width:${SLIDE_W}px;">
      <div style="display:table-cell;vertical-align:middle;padding-left:${MARGIN}px;">
        <div style="display:inline-block;background:rgba(255,255,255,0.2);border-radius:8px;padding:5px 8px;">
          ${ISO_SVG.replace('fill="#FF355E"', 'fill="rgba(255,255,255,0.95)"')}
        </div>
        <span style="font-size:12px;font-weight:600;color:rgba(255,255,255,0.75);margin-left:10px;letter-spacing:0.3px;">Factorial Map</span>
      </div>
      <div style="display:table-cell;vertical-align:middle;padding-right:${MARGIN}px;text-align:right;">
        <span style="font-size:24px;">${flag}</span>
      </div>
    </div>

    <!-- Title -->
    <div style="position:absolute;bottom:28px;left:${MARGIN}px;right:${MARGIN}px;">
      <div style="font-size:32px;font-weight:800;color:#FFFFFF;line-height:1.2;letter-spacing:-0.5px;">
        ${t.title(total, region).replace(`color:${CORAL}`, "color:#FFFFFF;text-decoration:underline;text-decoration-color:rgba(255,255,255,0.4);text-underline-offset:4px")}
      </div>
      <div style="font-size:13px;font-weight:400;color:rgba(255,255,255,0.7);margin-top:6px;">
        ${t.subtitle(region)}&nbsp;<strong style="color:#FFFFFF;font-weight:600;">${names}</strong>
      </div>
    </div>
  </div>

  ${cards}

  <!-- Footer -->
  <div style="position:absolute;bottom:0;left:0;width:${SLIDE_W}px;height:${FOOTER_H}px;background:${NAVY};display:table;table-layout:fixed;">
    <div style="display:table-cell;vertical-align:middle;padding-left:${MARGIN}px;">
      <span style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.45);letter-spacing:0.5px;">factorial.com</span>
    </div>
    <div style="display:table-cell;vertical-align:middle;text-align:center;">
      <span style="font-size:10px;font-weight:500;color:rgba(255,255,255,0.3);letter-spacing:1.5px;text-transform:uppercase;">Confidential</span>
    </div>
    <div style="display:table-cell;vertical-align:middle;padding-right:${MARGIN}px;text-align:right;">
      <span style="font-size:11px;font-weight:500;color:rgba(255,255,255,0.35);font-variant-numeric:tabular-nums;">${region} &middot; ${total} ${t.clients}</span>
    </div>
  </div>

</div>
</body>
</html>`;
}

async function downloadPdf(html: string, fileName: string) {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-9999px;top:0;width:1280px;height:720px;border:none;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();

  // Wait for Inter to load inside the iframe
  await new Promise(r => setTimeout(r, 1200));
  try { await (doc as any).fonts?.ready; } catch { /* ignore */ }

  const el = doc.getElementById("slide-0");
  if (!el) { document.body.removeChild(iframe); return; }

  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(el, {
    scale: 2, useCORS: true, backgroundColor: BGSLIDE,
    width: 1280, height: 720,
  });

  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [1280, 720] });
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 1280, 720);
  pdf.save(fileName);

  document.body.removeChild(iframe);
}

export async function generateRegionSlide(
  code: string,
  deals: WonDeal[],
  country: string,
  _enrichStore?: EnrichmentStore,
) {
  const regionDeals = deals.filter(d => d.regionCode === code);
  const name = getRegionName(country, code);
  const locale = localeForCountry(country);
  const flag = FLAGS[country] ?? "";

  type IndAcc = { count: number; deals: WonDeal[] };
  const industryMap = new Map<string, IndAcc>();
  for (const d of regionDeals) {
    const g = groupIndustry(d.sector);
    if (g === "Other" || g === "Unknown") continue;
    const cur = industryMap.get(g) ?? { count: 0, deals: [] };
    cur.count++; cur.deals.push(d);
    industryMap.set(g, cur);
  }
  const top3 = Array.from(industryMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 3);

  const used = new Set<string>();
  const industryData = top3.map(([indName, { count }]) => {
    const modules = countModulesForIndustry(deals, indName, country).slice(0, 3);
    const clients: { name: string }[] = [];
    for (const d of [...regionDeals.filter(x => groupIndustry(x.sector) === indName)]
      .sort((a, b) => b.seats - a.seats || b.totalActualMrr - a.totalActualMrr)) {
      const key = d.companyName.trim().toLowerCase();
      if (used.has(key)) continue;
      used.add(key);
      clients.push({ name: d.companyName });
      if (clients.length >= 3) break;
    }
    return { industry: indName, count, modules, clients };
  });

  const html = buildHtml(name, regionDeals.length, industryData, locale, flag);
  await downloadPdf(html, name.replace(/\s+/g, "-") + "-factorial.pdf");

  const user = window.localStorage.getItem("factorial.session.email") ?? "unknown";
  recordPptDownload({
    timestamp: new Date().toISOString(), region: name, country, user,
    sections: ["industries", "modules", "clients"],
  });
}
