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
  clients: string; topMod: string; topCli: string; avgSeats: string; ofTotal: string;
}> = {
  es: {
    title: (n, r) => `Factorial cuenta con <span style="color:${CORAL};font-weight:800;">${n}</span> clientes en ${r}`,
    subtitle: (r) => `Las 3 industrias m&aacute;s presentes en ${r} son:`,
    clients: "clientes", topMod: "TOP M&Oacute;DULOS", topCli: "TOP CLIENTES", avgSeats: "AVG SEATS", ofTotal: "del total",
  },
  fr: {
    title: (n, r) => `Factorial compte <span style="color:${CORAL};font-weight:800;">${n}</span> clients dans ${r}`,
    subtitle: (r) => `Les 3 industries les plus pr&eacute;sentes dans ${r} sont :`,
    clients: "clients", topMod: "TOP MODULES", topCli: "TOP CLIENTS", avgSeats: "MOY. EMPLOY&Eacute;S", ofTotal: "du total",
  },
  it: {
    title: (n, r) => `Factorial ha <span style="color:${CORAL};font-weight:800;">${n}</span> clienti in ${r}`,
    subtitle: (r) => `Le 3 industrie pi&ugrave; presenti in ${r} sono:`,
    clients: "clienti", topMod: "TOP MODULI", topCli: "TOP CLIENTI", avgSeats: "MEDIA DIPENDENTI", ofTotal: "del totale",
  },
  de: {
    title: (n, r) => `Factorial hat <span style="color:${CORAL};font-weight:800;">${n}</span> Kunden in ${r}`,
    subtitle: (r) => `Die 3 wichtigsten Branchen in ${r} sind:`,
    clients: "Kunden", topMod: "TOP MODULE", topCli: "TOP KUNDEN", avgSeats: "&Oslash; MITARBEITER", ofTotal: "vom Gesamt",
  },
  pt: {
    title: (n, r) => `Factorial tem <span style="color:${CORAL};font-weight:800;">${n}</span> clientes em ${r}`,
    subtitle: (r) => `As 3 ind&uacute;strias mais presentes em ${r} s&atilde;o:`,
    clients: "clientes", topMod: "TOP M&Oacute;DULOS", topCli: "TOP CLIENTES", avgSeats: "M&Eacute;DIA FUNCION&Aacute;RIOS", ofTotal: "do total",
  },
  en: {
    title: (n, r) => `Factorial has <span style="color:${CORAL};font-weight:800;">${n}</span> clients in ${r}`,
    subtitle: (r) => `The top 3 industries in ${r} are:`,
    clients: "clients", topMod: "TOP MODULES", topCli: "TOP CLIENTS", avgSeats: "AVG EMPLOYEES", ofTotal: "of total",
  },
};

function buildHtml(
  region: string, total: number,
  data: { industry: string; count: number; pct: number; avgSeats: number; modules: { module: string }[]; clients: { name: string; seats: number }[] }[],
  locale: Locale, flag: string,
): string {
  const t = T[locale] ?? T.en;
  const names = data.map(d => d.industry).join(", ");

  const W = 1280;
  const H = 720;
  const M = 56;
  const HERO = 140;
  const FOOT = 36;
  const GAP = 16;
  const CARD_TOP = HERO + 18;
  const CARD_H = H - CARD_TOP - FOOT - 10;
  const COL = Math.floor((W - M * 2 - GAP * 2) / 3);

  const cards = data.map((d, i) => {
    const cc = IND_COLORS[i] ?? CORAL;
    const cbg = IND_BG[i] ?? "#F9F9FB";
    const cbd = IND_BORDER[i] ?? BORDER;
    const x = M + i * (COL + GAP);
    const pctW = Math.max(6, Math.min(100, d.pct));
    const pad = 18;

    let y = 0;

    // — HEADER: industry name + count pill —
    const headerH = 56;
    const header = `
      <div style="position:absolute;left:0;top:${y}px;width:${COL}px;height:${headerH}px;padding:${pad}px ${pad}px 0;">
        <span style="position:absolute;left:${pad}px;top:16px;font-size:14px;font-weight:700;color:${NAVY};letter-spacing:-0.2px;">${d.industry}</span>
        <span style="position:absolute;right:${pad}px;top:14px;background:${cbg};border:1px solid ${cbd};border-radius:16px;padding:2px 11px;font-size:12px;font-weight:800;color:${cc};">${d.count}</span>
      </div>`;
    y += headerH;

    // — PROGRESS BAR + stats —
    const barH = 36;
    const barTrackW = COL - pad * 2;
    const barFillW = Math.round(barTrackW * pctW / 100);
    const progressSection = `
      <div style="position:absolute;left:${pad}px;top:${y}px;width:${barTrackW}px;height:${barH}px;">
        <div style="position:absolute;left:0;top:0;width:${barTrackW}px;height:5px;background:${BORDER};border-radius:3px;"></div>
        <div style="position:absolute;left:0;top:0;width:${barFillW}px;height:5px;background:${cc};border-radius:3px;"></div>
        <span style="position:absolute;left:0;top:10px;font-size:9px;font-weight:600;color:${GRAY2};">${Math.round(d.pct)}% ${t.ofTotal}</span>
        <span style="position:absolute;right:0;top:10px;font-size:9px;font-weight:600;color:${GRAY2};">${t.avgSeats}: ${Math.round(d.avgSeats)}</span>
      </div>`;
    y += barH;

    // — SEPARATOR —
    const sep1 = `<div style="position:absolute;left:0;top:${y}px;width:${COL}px;height:1px;background:${BORDER};"></div>`;
    y += 1;

    // — MODULES SECTION —
    const modSectionH = 14 + d.modules.length * 26 + 10;
    const modRows = d.modules.map((m, mi) => {
      const rowY = 14 + mi * 26;
      return `
        <div style="position:absolute;left:${pad}px;top:${rowY}px;width:${COL - pad * 2}px;height:24px;">
          <div style="position:absolute;left:0;top:1px;width:20px;height:20px;border-radius:5px;background:${cc};color:#FFF;font-size:9px;font-weight:700;text-align:center;line-height:20px;">${mi + 1}</div>
          <span style="position:absolute;left:28px;top:2px;font-size:11px;font-weight:600;color:${NAVY};">${m.module}</span>
        </div>`;
    }).join("");

    const modulesSection = `
      <div style="position:absolute;left:0;top:${y}px;width:${COL}px;height:${modSectionH}px;background:${cbg};">
        <span style="position:absolute;left:${pad}px;top:0;font-size:8px;font-weight:700;color:${GRAY3};letter-spacing:2px;text-transform:uppercase;line-height:14px;">${t.topMod}</span>
        ${modRows}
      </div>`;
    y += modSectionH;

    // — SEPARATOR —
    const sep2 = `<div style="position:absolute;left:0;top:${y}px;width:${COL}px;height:1px;background:${BORDER};"></div>`;
    y += 1;

    // — CLIENTS SECTION —
    const cliRows = d.clients.map((cl, ci) => {
      const rowY = 14 + ci * 22;
      return `
        <div style="position:absolute;left:${pad}px;top:${rowY}px;width:${COL - pad * 2}px;height:20px;">
          <span style="position:absolute;left:0;top:0;font-size:10px;font-weight:700;color:${GRAY3};">${ci + 1}.</span>
          <span style="position:absolute;left:16px;top:0;font-size:11px;font-weight:500;color:${GRAY1};">${cl.name}</span>
          ${cl.seats > 0 ? `<span style="position:absolute;right:0;top:1px;font-size:9px;font-weight:600;color:${GRAY3};">${cl.seats} emp</span>` : ""}
        </div>`;
    }).join("");

    const clientsSection = `
      <div style="position:absolute;left:0;top:${y}px;width:${COL}px;height:${14 + d.clients.length * 22 + 8}px;">
        <span style="position:absolute;left:${pad}px;top:0;font-size:8px;font-weight:700;color:${GRAY3};letter-spacing:2px;text-transform:uppercase;line-height:14px;">${t.topCli}</span>
        ${cliRows}
      </div>`;

    return `
      <div style="position:absolute;left:${x}px;top:${CARD_TOP}px;width:${COL}px;height:${CARD_H}px;background:${BGCARD};border-radius:12px;border:1px solid ${BORDER};overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.04),0 4px 16px rgba(0,0,0,0.02);">
        ${header}${progressSection}${sep1}${modulesSection}${sep2}${clientsSection}
      </div>`;
  }).join("");

  // Hero — all absolute, no table layout
  const hero = `
  <div style="position:absolute;top:0;left:0;width:${W}px;height:${HERO}px;background:linear-gradient(135deg,#FF506B 0%,#E8294F 50%,#C41E3A 100%);overflow:hidden;">
    <div style="position:absolute;top:-60px;right:-20px;width:450px;height:300px;background:radial-gradient(ellipse,rgba(255,255,255,0.12),transparent 65%);"></div>
    <div style="position:absolute;bottom:-80px;left:-60px;width:350px;height:250px;background:radial-gradient(ellipse,rgba(0,0,0,0.1),transparent 65%);"></div>

    <div style="position:absolute;top:12px;left:${M}px;">
      <div style="display:inline-block;background:rgba(255,255,255,0.18);border-radius:7px;padding:4px 6px;">
        ${ISO_SVG.replace('fill="#FF355E"','fill="rgba(255,255,255,0.95)"').replace('width="36" height="36"','width="24" height="24"').replace('viewBox="0 0 36 36"','viewBox="0 0 36 36"')}
      </div>
    </div>
    <span style="position:absolute;top:20px;left:${M + 44}px;font-size:11px;font-weight:600;color:rgba(255,255,255,0.6);letter-spacing:0.3px;">Factorial Map</span>
    <span style="position:absolute;top:14px;right:${M}px;font-size:22px;">${flag}</span>

    <div style="position:absolute;bottom:20px;left:${M}px;right:${M}px;">
      <div style="font-size:28px;font-weight:800;color:#FFF;line-height:1.2;letter-spacing:-0.5px;">
        ${t.title(total, region).replace(`color:${CORAL}`, "color:#FFF;text-decoration:underline;text-decoration-color:rgba(255,255,255,0.35);text-underline-offset:4px")}
      </div>
      <div style="font-size:11px;font-weight:400;color:rgba(255,255,255,0.6);margin-top:4px;">
        ${t.subtitle(region)}&ensp;<strong style="color:#FFF;font-weight:600;">${names}</strong>
      </div>
    </div>
  </div>`;

  // Footer — all absolute
  const footer = `
  <div style="position:absolute;bottom:0;left:0;width:${W}px;height:${FOOT}px;background:${NAVY};">
    <span style="position:absolute;left:${M}px;top:50%;transform:translateY(-50%);font-size:10px;font-weight:600;color:rgba(255,255,255,0.4);letter-spacing:0.5px;">factorial.com</span>
    <span style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:9px;font-weight:500;color:rgba(255,255,255,0.25);letter-spacing:1.5px;text-transform:uppercase;">Confidential</span>
    <span style="position:absolute;right:${M}px;top:50%;transform:translateY(-50%);font-size:10px;font-weight:500;color:rgba(255,255,255,0.3);">${region} · ${total} ${t.clients}</span>
  </div>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body,div,span{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;-webkit-font-smoothing:antialiased;}
</style>
</head>
<body>
<div class="slide" id="slide-0" style="width:${W}px;height:${H}px;position:relative;background:${BGSLIDE};overflow:hidden;">
  ${hero}
  ${cards}
  ${footer}
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
  const industryData = top3.map(([indName, { count, deals: indDeals }]) => {
    const modules = countModulesForIndustry(deals, indName, country).slice(0, 3);
    const pct = regionDeals.length > 0 ? (count / regionDeals.length) * 100 : 0;
    const totalSeats = indDeals.reduce((s, d) => s + (d.seats || 0), 0);
    const avgSeats = indDeals.length > 0 ? totalSeats / indDeals.length : 0;
    const clients: { name: string; seats: number }[] = [];
    for (const d of [...regionDeals.filter(x => groupIndustry(x.sector) === indName)]
      .sort((a, b) => b.seats - a.seats || b.totalActualMrr - a.totalActualMrr)) {
      const key = d.companyName.trim().toLowerCase();
      if (used.has(key)) continue;
      used.add(key);
      clients.push({ name: d.companyName, seats: d.seats || 0 });
      if (clients.length >= 3) break;
    }
    return { industry: indName, count, pct, avgSeats, modules, clients };
  });

  const html = buildHtml(name, regionDeals.length, industryData, locale, flag);
  await downloadPdf(html, name.replace(/\s+/g, "-") + "-factorial.pdf");

  const user = window.localStorage.getItem("factorial.session.email") ?? "unknown";
  recordPptDownload({
    timestamp: new Date().toISOString(), region: name, country, user,
    sections: ["industries", "modules", "clients"],
  });
}
