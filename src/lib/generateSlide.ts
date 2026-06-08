import { type WonDeal } from "@/lib/csvStore";
import { groupIndustry } from "@/lib/industryGroups";
import { recordPptDownload, readEnrichmentStore, writeEnrichmentStore, type EnrichmentStore } from "@/lib/enrichmentStore";
import { lookupHubspotByName } from "@/lib/hubspotLookup";
import { countModulesForIndustry } from "@/lib/bundleModules";
import { localeForCountry, type Locale } from "@/lib/i18n";

import geoFR from "@/data/france-regions.geojson.json";
import geoES from "@/data/spain-regions.geojson.json";
import geoIT from "@/data/italy-regions.geojson.json";
import geoDE from "@/data/germany-regions.geojson.json";
import geoBR from "@/data/brazil-regions.geojson.json";
import geoPT from "@/data/portugal-regions.geojson.json";
import geoMX from "@/data/mexico-regions.geojson.json";

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

// ─── Factorial logo SVG wordmark ─────────────────────────────────────────────
const FACTORIAL_LOGO_SVG = `<svg width="120" height="24" viewBox="0 0 120 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="24" height="24" rx="6" fill="#FF355E"/>
  <path d="M7 7h10v2.2H9.5v2h7v2.2h-7V18H7V7z" fill="#fff"/>
  <text x="30" y="17.5" font-family="DM Sans,sans-serif" font-size="16" font-weight="800" fill="#25253D" letter-spacing="-0.3">factorial</text>
</svg>`;

// ─── i18n for slides ────────────────────────────────────────────────────────
const SLIDE_STRINGS: Record<Locale, {
  title: (count: number, region: string) => string;
  subtitle: (region: string) => string;
  clients: string;
  topModules: string;
  topClients: string;
  brandLabel: string;
}> = {
  es: {
    title: (n, r) => `Factorial cuenta con <span style="color:#FF355E;font-weight:800;">${n}</span> clientes en ${r}`,
    subtitle: (r) => `Las 3 industrias más presentes en ${r} son:`,
    clients: "clientes",
    topModules: "TOP MÓDULOS",
    topClients: "TOP CLIENTES",
    brandLabel: "Pre-event · Factorial",
  },
  fr: {
    title: (n, r) => `Factorial compte <span style="color:#FF355E;font-weight:800;">${n}</span> clients dans ${r}`,
    subtitle: (r) => `Les 3 industries les plus présentes dans ${r} sont :`,
    clients: "clients",
    topModules: "TOP MODULES",
    topClients: "TOP CLIENTS",
    brandLabel: "Pre-event · Factorial",
  },
  it: {
    title: (n, r) => `Factorial ha <span style="color:#FF355E;font-weight:800;">${n}</span> clienti in ${r}`,
    subtitle: (r) => `Le 3 industrie più presenti in ${r} sono:`,
    clients: "clienti",
    topModules: "TOP MODULI",
    topClients: "TOP CLIENTI",
    brandLabel: "Pre-event · Factorial",
  },
  de: {
    title: (n, r) => `Factorial hat <span style="color:#FF355E;font-weight:800;">${n}</span> Kunden in ${r}`,
    subtitle: (r) => `Die 3 wichtigsten Branchen in ${r} sind:`,
    clients: "Kunden",
    topModules: "TOP MODULE",
    topClients: "TOP KUNDEN",
    brandLabel: "Pre-event · Factorial",
  },
  pt: {
    title: (n, r) => `Factorial tem <span style="color:#FF355E;font-weight:800;">${n}</span> clientes em ${r}`,
    subtitle: (r) => `As 3 indústrias mais presentes em ${r} são:`,
    clients: "clientes",
    topModules: "TOP MÓDULOS",
    topClients: "TOP CLIENTES",
    brandLabel: "Pre-event · Factorial",
  },
  en: {
    title: (n, r) => `Factorial has <span style="color:#FF355E;font-weight:800;">${n}</span> clients in ${r}`,
    subtitle: (r) => `The top 3 industries in ${r} are:`,
    clients: "clients",
    topModules: "TOP MODULES",
    topClients: "TOP CLIENTS",
    brandLabel: "Pre-event · Factorial",
  },
};

// ─── Colors ──────────────────────────────────────────────────────────────────
const BLOCK_COLORS = ["#FF355E", "#FB923C", "#14B8A6"];
const BLOCK_BG     = ["#FFF1F3", "#FFF7ED", "#F0FDFA"];

// ─── HTML slide builder ─────────────────────────────────────────────────────
function buildSlideHtml(
  regionName: string,
  totalClients: number,
  industryData: {
    industry: string;
    count: number;
    modules: { module: string }[];
    clients: { name: string }[];
  }[],
  locale: Locale,
): string {
  const t = SLIDE_STRINGS[locale] ?? SLIDE_STRINGS.en;
  const industryNames = industryData.map((d) => d.industry).join(", ");

  const blocksHtml = industryData.map((ind, i) => {
    const color = BLOCK_COLORS[i] ?? "#6B7280";
    const bg = BLOCK_BG[i] ?? "#F9F9FB";

    const modulesHtml = ind.modules.length > 0
      ? ind.modules.map((m, mi) => `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <div style="width:24px;height:24px;min-width:24px;border-radius:6px;background:${color};color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;">${mi + 1}</div>
          <span style="font-size:13px;font-weight:600;color:#25253D;white-space:nowrap;">${m.module}</span>
        </div>`).join("")
      : `<span style="font-size:12px;color:#AEAEB8;">—</span>`;

    const clientsHtml = ind.clients.map((c, ci) => `
      <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:5px;line-height:1.3;">
        <span style="font-size:12px;font-weight:700;color:${color};min-width:16px;flex-shrink:0;">${ci + 1}.</span>
        <span style="font-size:12px;font-weight:500;color:#25253D;word-break:break-word;overflow-wrap:break-word;">${c.name}</span>
      </div>`).join("");

    return `
      <div style="flex:1;min-width:0;background:#fff;border-radius:12px;border:1px solid #E9E9EC;display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:16px 16px 10px;border-bottom:1px solid #F0F0F4;">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:4px;height:28px;border-radius:2px;background:${color};flex-shrink:0;"></div>
            <div style="min-width:0;">
              <div style="font-size:14px;font-weight:700;color:#25253D;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${ind.industry}</div>
              <div style="font-size:11px;color:#AEAEB8;margin-top:2px;">${ind.count} ${t.clients}</div>
            </div>
          </div>
        </div>

        <div style="padding:14px 16px;background:${bg};border-bottom:1px solid #F0F0F4;">
          <div style="font-size:9px;font-weight:700;color:#AEAEB8;letter-spacing:1.5px;margin-bottom:10px;">${t.topModules}</div>
          ${modulesHtml}
        </div>

        <div style="padding:14px 16px;flex:1;">
          <div style="font-size:9px;font-weight:700;color:#AEAEB8;letter-spacing:1.5px;margin-bottom:8px;">${t.topClients}</div>
          ${clientsHtml}
        </div>
      </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>* { margin:0; padding:0; box-sizing:border-box; } @media print { .slide { page-break-after:always; } }</style>
</head>
<body style="background:#ccc;">
<div class="slide" id="slide-0" style="width:1280px;height:720px;position:relative;background:#F9F9FB;font-family:'DM Sans',sans-serif;overflow:hidden;">

  <!-- Header bar (coral) -->
  <div style="position:absolute;top:0;left:0;right:0;height:52px;background:#FF355E;display:flex;align-items:center;justify-content:space-between;padding:0 80px;">
    <div style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.8);letter-spacing:0.3px;">${t.brandLabel}</div>
    <svg width="100" height="20" viewBox="0 0 100 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="20" height="20" rx="5" fill="#fff" fill-opacity="0.25"/>
      <path d="M5.5 6h9v2H7.8v1.8h5.5v2H7.8V16H5.5V6z" fill="#fff"/>
      <text x="25" y="15" font-family="DM Sans,sans-serif" font-size="14" font-weight="800" fill="#fff" letter-spacing="-0.2">factorial</text>
    </svg>
  </div>

  <!-- Title block -->
  <div style="position:absolute;top:68px;left:80px;right:80px;">
    <div style="font-size:26px;font-weight:800;color:#25253D;line-height:1.3;">
      ${t.title(totalClients, regionName)}
    </div>
    <div style="font-size:13px;font-weight:500;color:#6C6C7D;margin-top:6px;">
      ${t.subtitle(regionName)} <span style="font-weight:700;color:#25253D;">${industryNames}</span>
    </div>
  </div>

  <!-- Thin separator -->
  <div style="position:absolute;top:156px;left:80px;right:80px;height:1px;background:#E9E9EC;"></div>

  <!-- 3 Industry blocks -->
  <div style="position:absolute;top:170px;left:80px;right:80px;bottom:24px;display:flex;gap:14px;">
    ${blocksHtml}
  </div>

</div>
</body>
</html>`;
}

// ─── PDF export via html2canvas + jsPDF ─────────────────────────────────────
async function downloadPdf(html: string, fileName: string) {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-9999px;top:0;width:1280px;height:720px;border:none;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();

  await new Promise((r) => setTimeout(r, 1000));
  await (doc as any).fonts?.ready?.catch?.(() => {});

  const slideEl = doc.getElementById("slide-0");
  if (!slideEl) { document.body.removeChild(iframe); return; }

  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(slideEl, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#F9F9FB",
    width: 1280,
    height: 720,
  });

  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [1280, 720] });
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 1280, 720);
  pdf.save(fileName);

  document.body.removeChild(iframe);
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
  const locale = localeForCountry(country);

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

  const usedCompanies = new Set<string>();
  const industryData = top3Industries.map(([industryName, { count }]) => {
    const modules = countModulesForIndustry(deals, industryName, country).slice(0, 3);
    const clients: { name: string }[] = [];
    for (const d of [...regionDeals.filter((x) => groupIndustry(x.sector) === industryName)]
      .sort((a, b) => b.seats - a.seats || b.totalActualMrr - a.totalActualMrr)) {
      const key = d.companyName.trim().toLowerCase();
      if (usedCompanies.has(key)) continue;
      usedCompanies.add(key);
      clients.push({ name: d.companyName });
      if (clients.length >= 3) break;
    }
    return { industry: industryName, count, modules, clients };
  });

  const html = buildSlideHtml(name, regionDeals.length, industryData, locale);
  await downloadPdf(html, `${name.replace(/\s+/g, "-")}-factorial.pdf`);

  const user = window.localStorage.getItem("factorial.session.email") ?? "unknown";
  recordPptDownload({
    timestamp: new Date().toISOString(), region: name, country, user,
    sections: ["industries", "modules", "clients"],
  });
}
