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

const FNT = "-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif";

const LOGO = "data:image/png;base64,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";

const T: Record<Locale, { title:(n:number,r:string)=>string; subtitle:(r:string)=>string; clients:string; topMod:string; topCli:string }> = {
  es: { title:(n,r)=>"Factorial cuenta con <b style='color:#FF355E;'>"+n+"</b> clientes en "+r, subtitle:(r)=>"Las 3 industrias m&aacute;s presentes en "+r+" son:", clients:"clientes", topMod:"TOP M&Oacute;DULOS", topCli:"TOP CLIENTES" },
  fr: { title:(n,r)=>"Factorial compte <b style='color:#FF355E;'>"+n+"</b> clients dans "+r, subtitle:(r)=>"Les 3 industries les plus pr&eacute;sentes dans "+r+" sont :", clients:"clients", topMod:"TOP MODULES", topCli:"TOP CLIENTS" },
  it: { title:(n,r)=>"Factorial ha <b style='color:#FF355E;'>"+n+"</b> clienti in "+r, subtitle:(r)=>"Le 3 industrie pi&ugrave; presenti in "+r+" sono:", clients:"clienti", topMod:"TOP MODULI", topCli:"TOP CLIENTI" },
  de: { title:(n,r)=>"Factorial hat <b style='color:#FF355E;'>"+n+"</b> Kunden in "+r, subtitle:(r)=>"Die 3 wichtigsten Branchen in "+r+" sind:", clients:"Kunden", topMod:"TOP MODULE", topCli:"TOP KUNDEN" },
  pt: { title:(n,r)=>"Factorial tem <b style='color:#FF355E;'>"+n+"</b> clientes em "+r, subtitle:(r)=>"As 3 ind&uacute;strias mais presentes em "+r+" s&atilde;o:", clients:"clientes", topMod:"TOP M&Oacute;DULOS", topCli:"TOP CLIENTES" },
  en: { title:(n,r)=>"Factorial has <b style='color:#FF355E;'>"+n+"</b> clients in "+r, subtitle:(r)=>"The top 3 industries in "+r+" are:", clients:"clients", topMod:"TOP MODULES", topCli:"TOP CLIENTS" },
};

const C = ["#FF355E","#FB923C","#14B8A6"];
const CBG = ["#FFF1F3","#FFF7ED","#F0FDFA"];
const BSZ = 32; // badge size px

function badge(n: number, color: string): string {
  return "<div style='width:"+BSZ+"px;height:"+BSZ+"px;border-radius:8px;background:"+color+";color:#fff;font-size:13px;font-weight:700;text-align:center;line-height:"+BSZ+"px;'>"+n+"</div>";
}

function buildHtml(region: string, total: number,
  data: { industry:string; count:number; modules:{module:string}[]; clients:{name:string}[] }[],
  locale: Locale, flag: string): string {

  const t = T[locale] ?? T.en;
  const names = data.map(d=>d.industry).join(", ");
  const colW = 350;
  const gap = 20;

  const cards = data.map((d, i) => {
    const cc = C[i] ?? "#6B7280";
    const bg = CBG[i] ?? "#F9F9FB";
    const left = 80 + i * (colW + gap);

    const mods = d.modules.map((m, mi) =>
      "<tr valign='middle'><td style='width:"+BSZ+"px;height:"+(BSZ+10)+"px;'>" + badge(mi+1, cc) + "</td>" +
      "<td style='padding-left:10px;font-size:14px;font-weight:600;color:#25253D;'>" + m.module + "</td></tr>"
    ).join("");

    const clis = d.clients.map((cl, ci) =>
      "<tr><td style='font-size:12px;font-weight:700;color:"+cc+";width:28px;padding:3px 0;'>"+( ci+1)+".</td>" +
      "<td style='font-size:12px;font-weight:500;color:#25253D;padding:3px 0;'>"+cl.name+"</td></tr>"
    ).join("");

    return "<div style='position:absolute;left:"+left+"px;top:178px;width:"+colW+"px;background:#fff;border-radius:14px;border:1px solid #E9E9EC;'>" +

      // Card header
      "<div style='padding:18px 18px 12px;border-bottom:1px solid #F0F0F4;'>" +
        "<table style='border-collapse:collapse;'><tr>" +
          "<td style='width:5px;background:"+cc+";border-radius:3px;vertical-align:top;'>&nbsp;</td>" +
          "<td style='padding-left:10px;'>" +
            "<div style='font-size:16px;font-weight:700;color:#25253D;'>"+d.industry+"</div>" +
            "<div style='font-size:12px;color:#AEAEB8;margin-top:2px;'>"+d.count+" "+t.clients+"</div>" +
          "</td>" +
        "</tr></table>" +
      "</div>" +

      // Modules
      "<div style='padding:16px 18px;background:"+bg+";border-bottom:1px solid #F0F0F4;'>" +
        "<div style='font-size:10px;font-weight:700;color:#AEAEB8;letter-spacing:1.5px;margin-bottom:12px;'>"+t.topMod+"</div>" +
        "<table style='border-collapse:collapse;width:100%;'>" + mods + "</table>" +
      "</div>" +

      // Clients
      "<div style='padding:16px 18px;'>" +
        "<div style='font-size:10px;font-weight:700;color:#AEAEB8;letter-spacing:1.5px;margin-bottom:10px;'>"+t.topCli+"</div>" +
        "<table style='border-collapse:collapse;width:100%;'>" + clis + "</table>" +
      "</div>" +

    "</div>";
  }).join("");

  return "<!DOCTYPE html><html><head><meta charset='utf-8'>" +
  "<style>*{margin:0;padding:0;box-sizing:border-box;}</style>" +
  "</head><body style='background:#F9F9FB;'>" +
  "<div id='slide-0' style='width:1280px;height:720px;position:relative;background:#F9F9FB;font-family:"+FNT+";overflow:hidden;'>" +

    // Header bar
    "<div style='position:absolute;top:0;left:0;width:1280px;height:52px;background:#FF355E;'>" +
      "<table style='border-collapse:collapse;width:100%;height:52px;'><tr>" +
        "<td style='padding-left:80px;vertical-align:middle;'>" +
          "<table style='border-collapse:collapse;'><tr>" +
            "<td style='vertical-align:middle;font-size:22px;padding-right:8px;'>"+flag+"</td>" +
            "<td style='vertical-align:middle;font-size:11px;font-weight:600;color:rgba(255,255,255,0.85);'>Pre-event &middot; Factorial</td>" +
          "</tr></table>" +
        "</td>" +
        "<td style='padding-right:80px;vertical-align:middle;text-align:right;'>" +
          "<img src='"+LOGO+"' style='height:26px;vertical-align:middle;' />" +
        "</td>" +
      "</tr></table>" +
    "</div>" +

    // Title
    "<div style='position:absolute;top:72px;left:80px;right:80px;'>" +
      "<div style='font-size:28px;font-weight:800;color:#25253D;line-height:1.2;'>"+t.title(total,region)+"</div>" +
      "<div style='font-size:13px;font-weight:400;color:#6C6C7D;margin-top:6px;'>"+t.subtitle(region)+" <b style='color:#25253D;'>"+names+"</b></div>" +
    "</div>" +

    // Separator
    "<div style='position:absolute;top:160px;left:80px;right:80px;height:1px;background:#E9E9EC;'></div>" +

    cards +

  "</div></body></html>";
}

async function downloadPdf(html: string, fileName: string) {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-9999px;top:0;width:1280px;height:720px;border:none;";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open(); doc.write(html); doc.close();
  await new Promise(r => setTimeout(r, 600));
  const el = doc.getElementById("slide-0");
  if (!el) { document.body.removeChild(iframe); return; }
  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#F9F9FB", width: 1280, height: 720 });
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
  const top3 = Array.from(industryMap.entries()).sort((a,b) => b[1].count - a[1].count).slice(0, 3);

  const used = new Set<string>();
  const industryData = top3.map(([name_, {count}]) => {
    const modules = countModulesForIndustry(deals, name_, country).slice(0, 3);
    const clients: {name:string}[] = [];
    for (const d of [...regionDeals.filter(x => groupIndustry(x.sector) === name_)]
      .sort((a,b) => b.seats - a.seats || b.totalActualMrr - a.totalActualMrr)) {
      const key = d.companyName.trim().toLowerCase();
      if (used.has(key)) continue;
      used.add(key);
      clients.push({ name: d.companyName });
      if (clients.length >= 3) break;
    }
    return { industry: name_, count, modules, clients };
  });

  const html = buildHtml(name, regionDeals.length, industryData, locale, flag);
  await downloadPdf(html, name.replace(/\s+/g, "-") + "-factorial.pdf");

  const user = window.localStorage.getItem("factorial.session.email") ?? "unknown";
  recordPptDownload({ timestamp: new Date().toISOString(), region: name, country, user, sections: ["industries","modules","clients"] });
}
