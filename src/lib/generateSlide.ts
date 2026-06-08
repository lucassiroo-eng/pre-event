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
    title: (n, r) => `Factorial cuenta con <span style="color:#FF355E;">${n}</span> clientes en ${r}`,
    subtitle: (r) => `Las 3 industrias más presentes en ${r} son:`,
    clients: "clientes",
    topModules: "TOP MÓDULOS",
    topClients: "TOP CLIENTES",
    brandLabel: "Pre-event · Factorial",
  },
  fr: {
    title: (n, r) => `Factorial compte <span style="color:#FF355E;">${n}</span> clients dans ${r}`,
    subtitle: (r) => `Les 3 industries les plus présentes dans ${r} sont :`,
    clients: "clients",
    topModules: "TOP MODULES",
    topClients: "TOP CLIENTS",
    brandLabel: "Pre-event · Factorial",
  },
  it: {
    title: (n, r) => `Factorial ha <span style="color:#FF355E;">${n}</span> clienti in ${r}`,
    subtitle: (r) => `Le 3 industrie più presenti in ${r} sono:`,
    clients: "clienti",
    topModules: "TOP MODULI",
    topClients: "TOP CLIENTI",
    brandLabel: "Pre-event · Factorial",
  },
  de: {
    title: (n, r) => `Factorial hat <span style="color:#FF355E;">${n}</span> Kunden in ${r}`,
    subtitle: (r) => `Die 3 wichtigsten Branchen in ${r} sind:`,
    clients: "Kunden",
    topModules: "TOP MODULE",
    topClients: "TOP KUNDEN",
    brandLabel: "Pre-event · Factorial",
  },
  pt: {
    title: (n, r) => `Factorial tem <span style="color:#FF355E;">${n}</span> clientes em ${r}`,
    subtitle: (r) => `As 3 indústrias mais presentes em ${r} são:`,
    clients: "clientes",
    topModules: "TOP MÓDULOS",
    topClients: "TOP CLIENTES",
    brandLabel: "Pre-event · Factorial",
  },
  en: {
    title: (n, r) => `Factorial has <span style="color:#FF355E;">${n}</span> clients in ${r}`,
    subtitle: (r) => `The top 3 industries in ${r} are:`,
    clients: "clients",
    topModules: "TOP MODULES",
    topClients: "TOP CLIENTS",
    brandLabel: "Pre-event · Factorial",
  },
};

// ─── Factorial logo (Brandfetch CDN, base64 fallback text) ──────────────────
const FACTORIAL_LOGO_URL = "https://cdn.brandfetch.io/factorial.co/w/512/h/100/theme/light/logo?c=1id_n1gqX639u9z8SB8";

async function loadFactorialLogo(): Promise<string> {
  try {
    const res = await fetch(FACTORIAL_LOGO_URL);
    if (!res.ok) return "";
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
  } catch { return ""; }
}

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
  logoDataUrl: string,
): string {
  const t = SLIDE_STRINGS[locale] ?? SLIDE_STRINGS.en;
  const industryNames = industryData.map((d) => d.industry).join(", ");

  const logoHtml = logoDataUrl
    ? `<img src="${logoDataUrl}" style="height:28px;width:auto;" />`
    : `<span style="font-size:18px;font-weight:800;color:#FF355E;letter-spacing:-0.5px;">factorial</span>`;

  const blocksHtml = industryData.map((ind, i) => {
    const color = BLOCK_COLORS[i] ?? "#6B7280";
    const bg = BLOCK_BG[i] ?? "#F9F9FB";

    const modulesHtml = ind.modules.length > 0
      ? ind.modules.map((m, mi) => `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <div style="width:26px;height:26px;border-radius:7px;background:${color};color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${mi + 1}</div>
          <span style="font-size:14px;font-weight:600;color:#25253D;">${m.module}</span>
        </div>`).join("")
      : `<span style="font-size:13px;color:#AEAEB8;">—</span>`;

    const clientsHtml = ind.clients.map((c, ci) => `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <span style="font-size:12px;font-weight:600;color:${color};min-width:14px;">${ci + 1}.</span>
        <span style="font-size:13px;font-weight:500;color:#25253D;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.name}</span>
      </div>`).join("");

    return `
      <div style="flex:1;background:#fff;border-radius:14px;border:1px solid #E9E9EC;display:flex;flex-direction:column;overflow:hidden;">
        <!-- Header -->
        <div style="padding:20px 20px 12px;border-bottom:1px solid #F3F3F6;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
            <div style="width:5px;height:32px;border-radius:3px;background:${color};flex-shrink:0;"></div>
            <div>
              <div style="font-size:15px;font-weight:700;color:#25253D;line-height:1.2;">${ind.industry}</div>
              <div style="font-size:11px;color:#AEAEB8;margin-top:2px;">${ind.count} ${t.clients}</div>
            </div>
          </div>
        </div>

        <!-- Modules -->
        <div style="padding:16px 20px;background:${bg};border-bottom:1px solid #F3F3F6;">
          <div style="font-size:9px;font-weight:700;color:#AEAEB8;letter-spacing:1.8px;margin-bottom:12px;">${t.topModules}</div>
          ${modulesHtml}
        </div>

        <!-- Clients -->
        <div style="padding:16px 20px;flex:1;">
          <div style="font-size:9px;font-weight:700;color:#AEAEB8;letter-spacing:1.8px;margin-bottom:10px;">${t.topClients}</div>
          ${clientsHtml}
        </div>
      </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @media print { .slide { page-break-after: always; } }
</style>
</head>
<body style="background:#E5E5E5;">
<div class="slide" id="slide-0" style="width:1280px;height:720px;position:relative;background:#F9F9FB;font-family:'DM Sans',sans-serif;overflow:hidden;">

  <!-- Top bar -->
  <div style="position:absolute;top:0;left:0;right:0;height:56px;display:flex;align-items:center;justify-content:space-between;padding:0 80px;">
    <div style="font-size:11px;font-weight:500;color:#AEAEB8;letter-spacing:0.5px;">${t.brandLabel}</div>
    ${logoHtml}
  </div>

  <!-- Coral accent line -->
  <div style="position:absolute;top:56px;left:0;right:0;height:3px;background:linear-gradient(90deg,#FF355E 0%,#FF355E 40%,#FB923C 70%,#14B8A6 100%);"></div>

  <!-- Title block -->
  <div style="position:absolute;top:76px;left:80px;right:80px;">
    <div style="font-size:28px;font-weight:800;color:#25253D;line-height:1.25;">
      ${t.title(totalClients, regionName)}
    </div>
    <div style="font-size:14px;font-weight:500;color:#6C6C7D;margin-top:6px;">
      ${t.subtitle(regionName)} <span style="font-weight:700;color:#25253D;">${industryNames}</span>
    </div>
  </div>

  <!-- 3 Industry blocks -->
  <div style="position:absolute;top:172px;left:80px;right:80px;bottom:28px;display:flex;gap:16px;">
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

  await new Promise((r) => setTimeout(r, 800));
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

  // Top 3 industries
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

    const clients: { name: string; companyId: string }[] = [];
    for (const d of [...regionDeals.filter((x) => groupIndustry(x.sector) === industryName)]
      .sort((a, b) => b.seats - a.seats || b.totalActualMrr - a.totalActualMrr)) {
      const key = d.companyName.trim().toLowerCase();
      if (usedCompanies.has(key)) continue;
      usedCompanies.add(key);
      clients.push({ name: d.companyName, companyId: d.companyId });
      if (clients.length >= 3) break;
    }

    return { industry: industryName, count, modules, clients };
  });

  const logoDataUrl = await loadFactorialLogo();

  const htmlData = industryData.map((ind) => ({
    ...ind,
    clients: ind.clients.map((c) => ({ name: c.name })),
  }));

  const html = buildSlideHtml(name, regionDeals.length, htmlData, locale, logoDataUrl);
  await downloadPdf(html, `${name.replace(/\s+/g, "-")}-factorial.pdf`);

  const user = window.localStorage.getItem("factorial.session.email") ?? "unknown";
  recordPptDownload({
    timestamp: new Date().toISOString(), region: name, country, user,
    sections: ["industries", "modules", "clients"],
  });
}
