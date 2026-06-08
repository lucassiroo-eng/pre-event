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

const F = "-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif";

const LOGO_B64 = "data:image/png;base64,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";

const SLIDE_STRINGS: Record<Locale, {
  title: (count: number, region: string) => string;
  subtitle: (region: string) => string;
  clients: string;
  topModules: string;
  topClients: string;
}> = {
  es: {
    title: (n, r) => `Factorial cuenta con <span style="color:#FF355E;">${n}</span> clientes en ${r}`,
    subtitle: (r) => `Las 3 industrias m&aacute;s presentes en ${r} son:`,
    clients: "clientes", topModules: "TOP M&Oacute;DULOS", topClients: "TOP CLIENTES",
  },
  fr: {
    title: (n, r) => `Factorial compte <span style="color:#FF355E;">${n}</span> clients dans ${r}`,
    subtitle: (r) => `Les 3 industries les plus pr&eacute;sentes dans ${r} sont :`,
    clients: "clients", topModules: "TOP MODULES", topClients: "TOP CLIENTS",
  },
  it: {
    title: (n, r) => `Factorial ha <span style="color:#FF355E;">${n}</span> clienti in ${r}`,
    subtitle: (r) => `Le 3 industrie pi&ugrave; presenti in ${r} sono:`,
    clients: "clienti", topModules: "TOP MODULI", topClients: "TOP CLIENTI",
  },
  de: {
    title: (n, r) => `Factorial hat <span style="color:#FF355E;">${n}</span> Kunden in ${r}`,
    subtitle: (r) => `Die 3 wichtigsten Branchen in ${r} sind:`,
    clients: "Kunden", topModules: "TOP MODULE", topClients: "TOP KUNDEN",
  },
  pt: {
    title: (n, r) => `Factorial tem <span style="color:#FF355E;">${n}</span> clientes em ${r}`,
    subtitle: (r) => `As 3 ind&uacute;strias mais presentes em ${r} s&atilde;o:`,
    clients: "clientes", topModules: "TOP M&Oacute;DULOS", topClients: "TOP CLIENTES",
  },
  en: {
    title: (n, r) => `Factorial has <span style="color:#FF355E;">${n}</span> clients in ${r}`,
    subtitle: (r) => `The top 3 industries in ${r} are:`,
    clients: "clients", topModules: "TOP MODULES", topClients: "TOP CLIENTS",
  },
};

const COLORS = ["#FF355E", "#FB923C", "#14B8A6"];
const BG = ["#FFF1F3", "#FFF7ED", "#F0FDFA"];

function buildSlideHtml(
  regionName: string,
  totalClients: number,
  industryData: { industry: string; count: number; modules: { module: string }[]; clients: { name: string }[] }[],
  locale: Locale,
  flag: string,
): string {
  const t = SLIDE_STRINGS[locale] ?? SLIDE_STRINGS.en;
  const industryNames = industryData.map((d) => d.industry).join(", ");
  const colW = Math.floor((1280 - 160 - 28) / 3);

  const cols = industryData.map((ind, i) => {
    const c = COLORS[i] ?? "#6B7280";
    const bg = BG[i] ?? "#F9F9FB";

    const modRows = ind.modules.length > 0
      ? ind.modules.map((m, mi) =>
        "<tr>" +
        '<td style="width:20px;font-size:13px;font-weight:700;color:' + c + ';vertical-align:top;">' + (mi + 1) + ".</td>" +
        '<td style="font-size:13px;font-weight:600;color:#25253D;vertical-align:top;padding-left:4px;">' + m.module + "</td>" +
        "</tr>").join("")
      : '<tr><td style="font-size:12px;color:#AEAEB8;">&mdash;</td></tr>';

    const cliRows = ind.clients.map((cl, ci) =>
      "<tr>" +
      '<td style="width:20px;font-size:12px;font-weight:700;color:' + c + ';vertical-align:top;">' + (ci + 1) + ".</td>" +
      '<td style="font-size:12px;font-weight:500;color:#25253D;vertical-align:top;padding-left:4px;">' + cl.name + "</td>" +
      "</tr>").join("");

    return '<td style="width:' + colW + "px;vertical-align:top;background:#fff;border-radius:12px;border:1px solid #E9E9EC;padding:0;\">" +
      '<table style="border-collapse:collapse;width:100%;"><tr><td style="padding:16px 16px 10px;border-bottom:1px solid #F0F0F4;">' +
        '<table style="border-collapse:collapse;"><tr>' +
          '<td style="width:4px;height:30px;background:' + c + ';border-radius:2px;vertical-align:top;"></td>' +
          '<td style="padding-left:8px;vertical-align:top;">' +
            '<span style="font-size:14px;font-weight:700;color:#25253D;">' + ind.industry + "</span><br/>" +
            '<span style="font-size:11px;color:#AEAEB8;">' + ind.count + " " + t.clients + "</span>" +
          "</td></tr></table>" +
      "</td></tr>" +
      '<tr><td style="padding:14px 16px;background:' + bg + ';border-bottom:1px solid #F0F0F4;">' +
        '<div style="font-size:9px;font-weight:700;color:#AEAEB8;letter-spacing:1.5px;margin-bottom:10px;">' + t.topModules + "</div>" +
        '<table style="border-collapse:collapse;width:100%;">' + modRows + "</table>" +
      "</td></tr>" +
      '<tr><td style="padding:14px 16px;">' +
        '<div style="font-size:9px;font-weight:700;color:#AEAEB8;letter-spacing:1.5px;margin-bottom:8px;">' + t.topClients + "</div>" +
        '<table style="border-collapse:collapse;width:100%;">' + cliRows + "</table>" +
      "</td></tr></table>" +
    "</td>";
  }).join('<td style="width:14px;"></td>');

  return "<!DOCTYPE html><html><head><meta charset=\"utf-8\">" +
"<style>*{margin:0;padding:0;box-sizing:border-box;}td{padding:0;}</style>" +
"</head><body>" +
'<div id="slide-0" style="width:1280px;height:720px;position:relative;background:#F9F9FB;font-family:' + F + ';overflow:hidden;">' +

  '<table style="border-collapse:collapse;position:absolute;top:0;left:0;width:1280px;height:52px;background:#FF355E;"><tr>' +
    '<td style="padding-left:80px;vertical-align:middle;">' +
      '<table style="border-collapse:collapse;"><tr>' +
        '<td style="font-size:22px;vertical-align:middle;padding-right:8px;">' + flag + "</td>" +
        '<td style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.8);vertical-align:middle;">Pre-event &middot; Factorial</td>' +
      "</tr></table>" +
    "</td>" +
    '<td style="padding-right:80px;vertical-align:middle;text-align:right;"><img src="' + LOGO_B64 + '" style="height:26px;" /></td>' +
  "</tr></table>" +

  '<div style="position:absolute;top:68px;left:80px;right:80px;">' +
    '<div style="font-size:26px;font-weight:800;color:#25253D;line-height:1.3;">' + t.title(totalClients, regionName) + "</div>" +
    '<div style="font-size:13px;font-weight:500;color:#6C6C7D;margin-top:6px;">' + t.subtitle(regionName) + ' <span style="font-weight:700;color:#25253D;">' + industryNames + "</span></div>" +
  "</div>" +

  '<div style="position:absolute;top:156px;left:80px;right:80px;height:1px;background:#E9E9EC;"></div>' +

  '<table style="border-collapse:collapse;position:absolute;top:170px;left:80px;"><tr>' +
    cols +
  "</tr></table>" +

"</div>" +
"</body></html>";
}

async function downloadPdf(html: string, fileName: string) {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-9999px;top:0;width:1280px;height:720px;border:none;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();

  await new Promise((r) => setTimeout(r, 600));

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
