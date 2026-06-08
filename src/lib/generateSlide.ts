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
        `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">` +
        `<div style="width:24px;height:24px;min-width:24px;border-radius:6px;background:${color};color:#fff;font-size:11px;font-weight:700;text-align:center;line-height:24px;">${mi + 1}</div>` +
        `<div style="font-size:13px;font-weight:600;color:#25253D;">${m.module}</div>` +
        `</div>`).join("")
      : `<div style="font-size:12px;color:#AEAEB8;">—</div>`;

    const clientsHtml = ind.clients.map((c, ci) =>
      `<div style="display:flex;align-items:baseline;gap:6px;margin-bottom:5px;">` +
      `<div style="font-size:12px;font-weight:700;color:${color};min-width:18px;">${ci + 1}.</div>` +
      `<div style="font-size:12px;font-weight:500;color:#25253D;word-break:break-word;">${c.name}</div>` +
      `</div>`).join("");

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
    `<div style="display:flex;align-items:center;gap:8px;">` +
      `<div style="width:22px;height:22px;border-radius:5px;background:rgba(255,255,255,0.25);display:flex;align-items:center;justify-content:center;">` +
        `<div style="color:#fff;font-size:13px;font-weight:800;line-height:1;">F</div>` +
      `</div>` +
      `<div style="font-size:16px;font-weight:800;color:#fff;letter-spacing:-0.3px;">factorial</div>` +
    `</div>` +
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
