import { type WonDeal } from "@/lib/csvStore";
import { groupIndustry } from "@/lib/industryGroups";
import { recordPptDownload, readEnrichmentStore, writeEnrichmentStore, type EnrichmentStore } from "@/lib/enrichmentStore";
import { fetchLogos } from "@/lib/logoStore";
import { lookupHubspotByName } from "@/lib/hubspotLookup";
import { countModulesForIndustry } from "@/lib/bundleModules";

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

// ─── Factorial isotype SVG (inline) ──────────────────────────────────────────
const FACTORIAL_ISO = `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="32" height="32" rx="8" fill="#FF355E"/><path d="M9 10h14v3H12.5v2.5H21v3h-8.5V24H9V10z" fill="#fff"/></svg>`;

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
    clients: { name: string; companyId: string; logoDataUrl: string }[];
  }[],
): string {
  const industryNames = industryData.map((d) => d.industry).join(", ");

  const blocksHtml = industryData.map((ind, i) => {
    const color = BLOCK_COLORS[i] ?? "#6B7280";
    const bg = BLOCK_BG[i] ?? "#F9F9FB";

    const modulesHtml = ind.modules.length > 0
      ? ind.modules.map((m, mi) => `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <div style="width:24px;height:24px;border-radius:6px;background:${color};color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${mi + 1}</div>
          <span style="font-size:14px;font-weight:600;color:#25253D;">${m.module}</span>
        </div>`).join("")
      : `<span style="font-size:13px;color:#AEAEB8;">—</span>`;

    const clientsHtml = ind.clients.map((c) => {
      const logoOrInitial = c.logoDataUrl
        ? `<img src="${c.logoDataUrl}" style="width:40px;height:40px;border-radius:8px;object-fit:contain;background:#fff;border:1px solid #E9E9EC;" />`
        : `<div style="width:40px;height:40px;border-radius:8px;background:#E9E9EC;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#6C6C7D;">${c.name.charAt(0)}</div>`;
      return `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
          ${logoOrInitial}
          <span style="font-size:13px;font-weight:500;color:#25253D;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px;">${c.name}</span>
        </div>`;
    }).join("");

    return `
      <div style="flex:1;background:#fff;border-radius:12px;border:1px solid #E9E9EC;padding:24px 20px;display:flex;flex-direction:column;gap:0;overflow:hidden;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
          <div style="width:6px;height:28px;border-radius:3px;background:${color};flex-shrink:0;"></div>
          <span style="font-size:16px;font-weight:700;color:#25253D;">${ind.industry}</span>
        </div>
        <div style="font-size:12px;color:#6C6C7D;margin-bottom:16px;padding-left:16px;">${ind.count} clientes</div>

        <div style="background:${bg};border-radius:8px;padding:14px 12px;margin-bottom:14px;">
          <div style="font-size:10px;font-weight:700;color:#AEAEB8;letter-spacing:1.5px;margin-bottom:10px;">TOP MÓDULOS</div>
          ${modulesHtml}
        </div>

        <div style="padding:0 2px;">
          <div style="font-size:10px;font-weight:700;color:#AEAEB8;letter-spacing:1.5px;margin-bottom:10px;">TOP CLIENTES</div>
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

  <!-- Brand label -->
  <div style="position:absolute;top:24px;left:80px;font-size:12px;font-weight:500;color:#6C6C7D;">
    Pre-event · Factorial
  </div>

  <!-- Isotype -->
  <div style="position:absolute;top:20px;right:80px;">
    ${FACTORIAL_ISO}
  </div>

  <!-- Title block -->
  <div style="position:absolute;top:72px;left:80px;right:80px;">
    <div style="font-size:30px;font-weight:800;color:#25253D;line-height:1.2;">
      Factorial cuenta con <span style="color:#FF355E;">${totalClients}</span> clientes en ${regionName}
    </div>
    <div style="font-size:15px;font-weight:500;color:#6C6C7D;margin-top:8px;">
      Las 3 industrias más presentes en ${regionName} son: <span style="font-weight:700;color:#25253D;">${industryNames}</span>
    </div>
  </div>

  <!-- Separator -->
  <div style="position:absolute;top:168px;left:80px;right:80px;height:1px;background:#E9E9EC;"></div>

  <!-- 3 Industry blocks -->
  <div style="position:absolute;top:184px;left:80px;right:80px;bottom:32px;display:flex;gap:16px;">
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

    const clients: { name: string; companyId: string; seats: number }[] = [];
    for (const d of [...regionDeals.filter((x) => groupIndustry(x.sector) === industryName)]
      .sort((a, b) => b.seats - a.seats || b.totalActualMrr - a.totalActualMrr)) {
      const key = d.companyName.trim().toLowerCase();
      if (usedCompanies.has(key)) continue;
      usedCompanies.add(key);
      clients.push({ name: d.companyName, companyId: d.companyId, seats: d.seats });
      if (clients.length >= 3) break;
    }

    return { industry: industryName, count, modules, clients };
  });

  // ─── Resolve domains + logos ───────────────────────────────────────────────
  const slideClients = industryData.flatMap((ind) => ind.clients);
  const domainById = new Map<string, string>();
  for (const c of slideClients) {
    const d = enrichStore?.[c.companyId]?.domain;
    if (d) domainById.set(c.companyId, d);
  }

  const missing = slideClients.filter((c) => !domainById.has(c.companyId));
  if (missing.length > 0) {
    try {
      const hits = await lookupHubspotByName(missing.map((c) => c.name));
      if (hits.size > 0) {
        const persist = readEnrichmentStore();
        for (const c of missing) {
          const hit = hits.get(c.name.trim().toLowerCase());
          if (hit?.found && hit.domain) {
            domainById.set(c.companyId, hit.domain);
            const prev = persist[c.companyId];
            persist[c.companyId] = {
              companyId: c.companyId,
              companyName: c.name,
              hubspotId: hit.hubspotId ?? prev?.hubspotId ?? null,
              hubspotCity: hit.city ?? prev?.hubspotCity ?? null,
              hubspotZip: hit.zip ?? prev?.hubspotZip ?? null,
              domain: hit.domain,
              sireneCity: prev?.sireneCity ?? null,
              sirenePostal: prev?.sirenePostal ?? null,
              sireneSiren: prev?.sireneSiren ?? null,
              regionCode: prev?.regionCode ?? "unknown",
              status: prev?.status ?? "hs-matched",
              enrichedAt: new Date().toISOString(),
              error: null,
              nps: hit.nps ?? prev?.nps ?? null,
            };
          }
        }
        writeEnrichmentStore(persist);
      }
    } catch { /* best-effort */ }
  }

  const allDomains = [...new Set([...domainById.values()])].filter(Boolean);
  const logoCache = await fetchLogos(allDomains);

  // Build data with logos resolved
  const dataWithLogos = industryData.map((ind) => ({
    ...ind,
    clients: ind.clients.map((c) => {
      const domain = domainById.get(c.companyId) ?? "";
      return { name: c.name, companyId: c.companyId, logoDataUrl: domain ? (logoCache[domain] ?? "") : "" };
    }),
  }));

  const html = buildSlideHtml(name, regionDeals.length, dataWithLogos);
  await downloadPdf(html, `${name.replace(/\s+/g, "-")}-factorial.pdf`);

  const user = window.localStorage.getItem("factorial.session.email") ?? "unknown";
  recordPptDownload({
    timestamp: new Date().toISOString(), region: name, country, user,
    sections: ["industries", "modules", "clients"],
  });
}
