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

const COUNTRY_FLAGS: Record<string, string> = {
  fr: "\u{1F1EB}\u{1F1F7}", es: "\u{1F1EA}\u{1F1F8}", it: "\u{1F1EE}\u{1F1F9}",
  de: "\u{1F1E9}\u{1F1EA}", pt: "\u{1F1F5}\u{1F1F9}", br: "\u{1F1E7}\u{1F1F7}",
  mx: "\u{1F1F2}\u{1F1FD}",
};

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

const FACTORIAL_LOGO_WHITE = "data:image/png;base64,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";

const SLIDE_STRINGS: Record<Locale, {
  title: (count: number, region: string) => string;
  subtitle: (region: string) => string;
  clients: string;
  topModules: string;
  topClients: string;
}> = {
  es: {
    title: (n, r) => `Factorial cuenta con <span style="color:#FF355E;">${n}</span> clientes en ${r}`,
    subtitle: (r) => `Las 3 industrias más presentes en ${r} son:`,
    clients: "clientes", topModules: "TOP MÓDULOS", topClients: "TOP CLIENTES",
  },
  fr: {
    title: (n, r) => `Factorial compte <span style="color:#FF355E;">${n}</span> clients dans ${r}`,
    subtitle: (r) => `Les 3 industries les plus présentes dans ${r} sont :`,
    clients: "clients", topModules: "TOP MODULES", topClients: "TOP CLIENTS",
  },
  it: {
    title: (n, r) => `Factorial ha <span style="color:#FF355E;">${n}</span> clienti in ${r}`,
    subtitle: (r) => `Le 3 industrie più presenti in ${r} sono:`,
    clients: "clienti", topModules: "TOP MODULI", topClients: "TOP CLIENTI",
  },
  de: {
    title: (n, r) => `Factorial hat <span style="color:#FF355E;">${n}</span> Kunden in ${r}`,
    subtitle: (r) => `Die 3 wichtigsten Branchen in ${r} sind:`,
    clients: "Kunden", topModules: "TOP MODULE", topClients: "TOP KUNDEN",
  },
  pt: {
    title: (n, r) => `Factorial tem <span style="color:#FF355E;">${n}</span> clientes em ${r}`,
    subtitle: (r) => `As 3 indústrias mais presentes em ${r} são:`,
    clients: "clientes", topModules: "TOP MÓDULOS", topClients: "TOP CLIENTES",
  },
  en: {
    title: (n, r) => `Factorial has <span style="color:#FF355E;">${n}</span> clients in ${r}`,
    subtitle: (r) => `The top 3 industries in ${r} are:`,
    clients: "clients", topModules: "TOP MODULES", topClients: "TOP CLIENTS",
  },
};

const BLOCK_COLORS = ["#FF355E", "#FB923C", "#14B8A6"];
const BLOCK_BG     = ["#FFF1F3", "#FFF7ED", "#F0FDFA"];

function buildSlideHtml(
  regionName: string,
  totalClients: number,
  industryData: { industry: string; count: number; modules: { module: string }[]; clients: { name: string }[] }[],
  locale: Locale,
  flag: string,
): string {
  const t = SLIDE_STRINGS[locale] ?? SLIDE_STRINGS.en;
  const industryNames = industryData.map((d) => d.industry).join(", ");

  const blocksHtml = industryData.map((ind, i) => {
    const color = BLOCK_COLORS[i] ?? "#6B7280";
    const bg = BLOCK_BG[i] ?? "#F9F9FB";

    const modulesHtml = ind.modules.length > 0
      ? ind.modules.map((m, mi) =>
        `<table style="border-collapse:collapse;margin-bottom:8px;"><tr>` +
        `<td style="width:24px;height:24px;border-radius:6px;background:${color};color:#fff;font-size:11px;font-weight:700;text-align:center;vertical-align:middle;">${mi + 1}</td>` +
        `<td style="padding-left:8px;font-size:13px;font-weight:600;color:#25253D;vertical-align:middle;">${m.module}</td>` +
        `</tr></table>`).join("")
      : `<div style="font-size:12px;color:#AEAEB8;">—</div>`;

    const clientsHtml = ind.clients.map((c, ci) =>
      `<table style="border-collapse:collapse;margin-bottom:4px;width:100%;"><tr>` +
      `<td style="width:20px;font-size:12px;font-weight:700;color:${color};vertical-align:top;padding-right:4px;">${ci + 1}.</td>` +
      `<td style="font-size:12px;font-weight:500;color:#25253D;vertical-align:top;word-break:break-word;">${c.name}</td>` +
      `</tr></table>`).join("");

    return `<div style="flex:1;min-width:0;background:#fff;border-radius:12px;border:1px solid #E9E9EC;display:flex;flex-direction:column;overflow:hidden;">` +
      `<div style="padding:16px 16px 10px;border-bottom:1px solid #F0F0F4;">` +
        `<div style="display:flex;align-items:center;gap:8px;">` +
          `<div style="width:4px;height:28px;border-radius:2px;background:${color};"></div>` +
          `<div>` +
            `<div style="font-size:14px;font-weight:700;color:#25253D;">${ind.industry}</div>` +
            `<div style="font-size:11px;color:#AEAEB8;margin-top:2px;">${ind.count} ${t.clients}</div>` +
          `</div>` +
        `</div>` +
      `</div>` +
      `<div style="padding:14px 16px;background:${bg};border-bottom:1px solid #F0F0F4;">` +
        `<div style="font-size:9px;font-weight:700;color:#AEAEB8;letter-spacing:1.5px;margin-bottom:10px;">${t.topModules}</div>` +
        modulesHtml +
      `</div>` +
      `<div style="padding:14px 16px;">` +
        `<div style="font-size:9px;font-weight:700;color:#AEAEB8;letter-spacing:1.5px;margin-bottom:8px;">${t.topClients}</div>` +
        clientsHtml +
      `</div>` +
    `</div>`;
  }).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8">` +
`<style>*{margin:0;padding:0;box-sizing:border-box;}</style>` +
`</head><body>` +
`<div id="slide-0" style="width:1280px;height:720px;position:relative;background:#F9F9FB;font-family:${FONT};overflow:hidden;">` +

  `<div style="position:absolute;top:0;left:0;right:0;height:52px;background:#FF355E;display:flex;align-items:center;justify-content:space-between;padding:0 80px;">` +
    `<div style="display:flex;align-items:center;gap:8px;">` +
      `<span style="font-size:22px;">${flag}</span>` +
      `<span style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.8);">Pre-event · Factorial</span>` +
    `</div>` +
    `<img src="${FACTORIAL_LOGO_WHITE}" style="height:26px;width:auto;" />` +
  `</div>` +

  `<div style="position:absolute;top:68px;left:80px;right:80px;">` +
    `<div style="font-size:26px;font-weight:800;color:#25253D;line-height:1.3;">${t.title(totalClients, regionName)}</div>` +
    `<div style="font-size:13px;font-weight:500;color:#6C6C7D;margin-top:6px;">${t.subtitle(regionName)} <span style="font-weight:700;color:#25253D;">${industryNames}</span></div>` +
  `</div>` +

  `<div style="position:absolute;top:156px;left:80px;right:80px;height:1px;background:#E9E9EC;"></div>` +

  `<div style="position:absolute;top:170px;left:80px;right:80px;display:flex;gap:14px;">` +
    blocksHtml +
  `</div>` +

`</div>` +
`</body></html>`;
}

async function downloadPdf(html: string, fileName: string) {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-9999px;top:0;width:1280px;height:720px;border:none;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();

  await new Promise((r) => setTimeout(r, 500));

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

export async function generateRegionSlide(
  code: string,
  deals: WonDeal[],
  country: string,
  _enrichStore?: EnrichmentStore,
) {
  const regionDeals = deals.filter((d) => d.regionCode === code);
  const name = getRegionName(country, code);
  const locale = localeForCountry(country);
  const flag = COUNTRY_FLAGS[country] ?? "";

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

  const html = buildSlideHtml(name, regionDeals.length, industryData, locale, flag);
  await downloadPdf(html, `${name.replace(/\s+/g, "-")}-factorial.pdf`);

  const user = window.localStorage.getItem("factorial.session.email") ?? "unknown";
  recordPptDownload({
    timestamp: new Date().toISOString(), region: name, country, user,
    sections: ["industries", "modules", "clients"],
  });
}
