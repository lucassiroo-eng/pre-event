/**
 * Compute engine: takes raw StrategyCompany rows from Supabase + TAM per CCAA
 * and produces RegionPlaybook[] + national stats identical in structure to the
 * previous static playbookData.ts.
 *
 * Normalizations applied here:
 *   - Navarra alias → "Comunidad Foral de Navarra"
 *   - Size: XS (1-19) / S (20-50) / M / L / XL from empresa_size
 *   - Channel: Santander / Telefónica extracted from partner_object_name
 *   - Industry: 12 macro-sectors via hubspotToSector()
 *   - CCAA fallback: ciudad_enriched → ciudad via resolveCCAA()
 */

import { type StrategyCompany, type SasorBreakdown } from "./strategyStore";
import { hubspotToSector } from "./sectorMap";
import { type RegionPlaybook, NATIONAL as STATIC_NATIONAL } from "./playbookData";
import { resolveCCAA } from "./strategyCCAA";

// ── Types ────────────────────────────────────────────────────────────────────

export type NationalStats = typeof STATIC_NATIONAL;

export interface BestPractice {
  id: string;
  regions: string[];
  codes: string[];
  channel: string;
  dimension: "size" | "industry";
  segment: string;
  l2w: number;
  regionL2wAvg: number;
  arpu: number;
  regionArpuAvg: number;
  pipeline: number;
  active: number;
  mrr: number;
  tamAvailable: number;
  isCrossRegion: boolean;
  headline: string;
  insight: string;
  recommendation: string;
}

export interface NormedRow {
  ccaa: string;
  channel: string;
  size: string;
  sector: string;
  partnerName: string;
  isActive: boolean;
  isWon: boolean;
  hasDemo: boolean;
  cmrr: number;
  closeDate: number | null;
}

export interface PlaybookLiveData {
  regions: RegionPlaybook[];
  national: NationalStats;
  tamBySector: Record<string, number>;
  tamBySize: Record<string, number>;
  tamBySizeBySector: Record<string, Record<string, number>>;
  bestPractices: BestPractice[];
  normedRows: NormedRow[];
}

// ── CCAA normalisation ───────────────────────────────────────────────────────

const CCAA_ALIASES: Record<string, string> = {
  "Navarra":                      "Comunidad Foral de Navarra",
  "Illes Balears":                "Islas Baleares",
  "Balears":                      "Islas Baleares",
  "Murcia":                       "Región de Murcia",
  "Asturias":                     "Principado de Asturias",
  "Madrid":                       "Comunidad de Madrid",
  "Valencia":                     "Comunidad Valenciana",
  "Valenciana":                   "Comunidad Valenciana",
  "Castilla La Mancha":           "Castilla-La Mancha",
  "Castilla - La Mancha":         "Castilla-La Mancha",
};

const CCAA_CODES: Record<string, string> = {
  "Cataluña":                     "CT",
  "Comunidad de Madrid":          "MD",
  "Andalucía":                    "AN",
  "Comunidad Valenciana":         "VC",
  "Galicia":                      "GA",
  "Canarias":                     "CN",
  "País Vasco":                   "PV",
  "Castilla y León":              "CL",
  "Región de Murcia":             "MC",
  "Aragón":                       "AR",
  "Castilla-La Mancha":           "CM",
  "Islas Baleares":               "IB",
  "Extremadura":                  "EX",
  "Comunidad Foral de Navarra":   "NC",
  "Principado de Asturias":       "AS",
  "Cantabria":                    "CB",
  "La Rioja":                     "RI",
  "Ceuta":                        "CE",
  "Melilla":                      "ME",
};

function normCcaa(raw: string, ciudad?: string): string {
  const s = raw?.trim();
  if (s && s !== "" && s !== "Others") {
    return CCAA_ALIASES[s] ?? s;
  }
  // Fallback: try to resolve from city
  if (ciudad) {
    const resolved = resolveCCAA(ciudad);
    if (resolved.ccaa) return resolved.ccaa;
  }
  return "";
}

// ── Size segmentation ────────────────────────────────────────────────────────

const SIZE_ORDER = ["XS (1-19)", "S (20-50)", "M (51-200)", "L (201-500)", "XL (500+)"];

function computeSize(empresaSize: number, totalSeats: number): string {
  const n = empresaSize > 0 ? empresaSize : (totalSeats > 0 ? totalSeats : 0);
  if (!n || n <= 0) return "Unknown";
  if (n <= 19)  return "XS (1-19)";
  if (n <= 50)  return "S (20-50)";
  if (n <= 200) return "M (51-200)";
  if (n <= 500) return "L (201-500)";
  return "XL (500+)";
}

// ── Channel normalisation ────────────────────────────────────────────────────
// Only deal_provenance (provenance_norm) = "Partners" counts as partner-sourced.
// Partner name sub-splits Santander / Telefónica / Channel Partners within that.
// Companies with a partner on invoice/deal but sourced via Outbound/Inbound/Paid
// are classified by their actual provenance, not as partner deals.

const CHANNEL_ORDER = [
  "Channel Partners", "Outbound", "Inbound", "Santander", "Paid", "Telefónica", "Others",
];

function normChannel(provNorm: string, partnerName: string): string {
  const prov = (provNorm ?? "").trim();
  if (prov === "Inbound")  return "Inbound";
  if (prov === "Outbound") return "Outbound";
  if (prov === "Paid")     return "Paid";
  if (prov === "Partners" || prov === "Partner") {
    const pn = (partnerName ?? "").trim().toLowerCase();
    if (pn.includes("santander")) return "Santander";
    if (pn.includes("telefon") || pn.includes("movistar")) return "Telefónica";
    return "Channel Partners";
  }
  return "Others";
}

// ── Boolean resolution (mirrors Strategy.tsx logic) ──────────────────────────

function resolveFlags(c: StrategyCompany): { isActive: boolean; isWon: boolean; hasDemo: boolean } {
  const isWon    = c.is_won != null
    ? Boolean(c.is_won)
    : c.conversion === "converted" || c.conversion === "onboarding";
  const isActive = c.is_active_client != null
    ? Boolean(c.is_active_client)
    : c.tipo_empresa === "Cliente Activo";
  const hasDemo  = isWon || isActive || (c.has_demo != null
    ? Boolean(c.has_demo)
    : !!(c.deal_after_demo_date || c.after_demo_date));
  return { isActive, isWon, hasDemo };
}

// ── Archetype classification (date-weighted) ────────────────────────────────
//
// Uses a blended channel mix: older deals × 1 + recent deals × 2.
// "Recent" = deals closed in the last 12 months (excluding current month).
// This captures partner-channel momentum — regions where partners are
// growing fast get classified as partner-led even if all-time share is modest.

const PARTNER_LABELS = new Set(["Channel Partners", "Santander", "Telefónica"]);

function computeArchetypeWeighted(
  rows: { channel: string; isActive: boolean; cmrr: number; closeDate: number | null }[],
): RegionPlaybook["archetype"] {
  const now = Date.now();
  const TWELVE_MONTHS = 365 * 24 * 3600 * 1000;
  const cutoff = now - TWELVE_MONTHS;

  const blend = new Map<string, number>();
  let blendTotal = 0;

  for (const r of rows) {
    if (!r.isActive || r.cmrr <= 0) continue;
    const weight = (r.closeDate && r.closeDate >= cutoff) ? 2 : 1;
    const prev = blend.get(r.channel) ?? 0;
    blend.set(r.channel, prev + r.cmrr * weight);
    blendTotal += r.cmrr * weight;
  }

  if (blendTotal === 0) return "multi-channel";

  let partnerMrr = 0;
  for (const [ch, mrr] of blend) {
    if (PARTNER_LABELS.has(ch)) partnerMrr += mrr;
  }
  if (partnerMrr / blendTotal > 0.25) return "partner-led";

  const obMrr = blend.get("Outbound") ?? 0;
  const ibMrr = blend.get("Inbound") ?? 0;
  if (obMrr > ibMrr) return "outbound-responsive";

  return "multi-channel";
}

// ── Dynamic text generators ──────────────────────────────────────────────────

function fmtN(n: number): string {
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `€${(n / 1_000).toFixed(1)}K`;
  return `€${Math.round(n)}`;
}

function generateKeyInsights(
  ccaa: string,
  active: number,
  mrr: number,
  arpu: number,
  d2w: number,
  penetration: number,
  tam: number,
  provs: RegionPlaybook["provenances"],
  sizes: RegionPlaybook["sizes"],
  natArpu: number,
  natD2w: number,
): string[] {
  const insights: string[] = [];
  // ARPU vs national
  const arpuDelta = Math.round((arpu / natArpu - 1) * 100);
  if (Math.abs(arpuDelta) >= 10) {
    insights.push(
      `ARPU ${arpuDelta > 0 ? "+" : ""}${arpuDelta}% vs media nacional (${fmtN(arpu)} vs ${fmtN(natArpu)}) — ${arpuDelta > 0 ? "mercado de mayor valor unitario" : "ticket medio bajo, priorizar upsell"}.`,
    );
  }
  // Top channel
  const topCh = [...provs].sort((a, b) => b.mrr - a.mrr)[0];
  if (topCh && topCh.mrrShare >= 20) {
    insights.push(
      `${topCh.label} domina con ${topCh.mrrShare}% del MRR (${fmtN(topCh.arpu)} ARPU, D2W ${topCh.d2w ?? "—"}%). ${topCh.active} clientes activos.`,
    );
  }
  // D2W
  const d2wDiff = Math.round((d2w - natD2w) * 10) / 10;
  if (Math.abs(d2wDiff) >= 4) {
    insights.push(
      `D2W ${d2w}% (${d2wDiff > 0 ? "+" : ""}${d2wDiff}pp vs media). ${d2wDiff > 0 ? "Equipo de ventas muy eficiente." : "Revisar proceso de cierre — oportunidad de mejora."}`,
    );
  }
  // Penetration / untapped
  const untapped = tam > 0 ? Math.round(tam - active) : 0;
  if (tam > 0 && penetration < 7) {
    insights.push(
      `Penetración baja (${penetration}%) — ${untapped.toLocaleString()} empresas del TAM sin cubrir. Problema de volumen.`,
    );
  } else if (tam > 0 && penetration >= 9) {
    insights.push(
      `Alta penetración relativa (${penetration}%) — foco en retención y upsell sobre new logos.`,
    );
  }
  // Best size by ARPU
  const bestSize = [...sizes].filter((s) => s.active >= 5).sort((a, b) => b.arpu - a.arpu)[0];
  if (bestSize && bestSize.arpu > arpu * 1.3) {
    insights.push(
      `Segmento ${bestSize.label}: mayor ARPU (${fmtN(bestSize.arpu)}) con ${bestSize.active} clientes — ${bestSize.mrrShare}% del MRR regional.`,
    );
  }
  return insights.slice(0, 4);
}

function generateOpenQuestions(
  ccaa: string,
  penetration: number,
  d2w: number,
  natD2w: number,
  archetype: RegionPlaybook["archetype"],
  partners: RegionPlaybook["partners"],
  partnerSharePct: number,
): string[] {
  const qs: string[] = [];
  if (penetration < 6) qs.push(`¿Cuál es el mayor bloqueador para superar el ${penetration}% de penetración en ${ccaa}?`);
  if (d2w < natD2w - 5) qs.push(`¿Por qué D2W (${d2w}%) está ${Math.round(natD2w - d2w)}pp por debajo de la media nacional?`);
  if (archetype === "partner-led" && partners.length <= 1) qs.push(`¿Cómo diversificar la dependencia de partner único?`);
  if (archetype !== "partner-led" && partnerSharePct < 15) qs.push(`¿Hay oportunidad de activar un play de canal partner en ${ccaa}?`);
  return qs.slice(0, 3);
}

// ── Industry insights ────────────────────────────────────────────────────────

function generateIndustryInsights(
  industries: RegionPlaybook["industries"],
  arpu: number,
  tamBySectorForRegion: Record<string, number>,
): string[] {
  const insights: string[] = [];
  if (!industries.length) return insights;

  const totalMrr = industries.reduce((s, i) => s + i.mrr, 0);

  // 1. Top sector by MRR
  const topMrr = [...industries].sort((a, b) => b.mrr - a.mrr)[0];
  if (topMrr && totalMrr > 0) {
    const pct = Math.round((topMrr.mrr / totalMrr) * 100);
    insights.push(
      `${topMrr.label} lidera con ${fmtN(topMrr.mrr)} MRR (${pct}% del total) — ARPU de ${fmtN(topMrr.arpu)} vs ${fmtN(arpu)} regional.`,
    );
  }

  // 2. Highest L2W sector
  const withPipeline = industries.filter((i) => (i.pipeline ?? 0) > 0);
  if (withPipeline.length >= 2) {
    const sorted = [...withPipeline].sort((a, b) => {
      const la = a.active / (a.pipeline ?? 1);
      const lb = b.active / (b.pipeline ?? 1);
      return lb - la;
    });
    const topL2w = sorted[0];
    const avgL2w = withPipeline.reduce((s, i) => s + i.active / (i.pipeline ?? 1), 0) / withPipeline.length;
    const topL2wVal = Math.round((topL2w.active / (topL2w.pipeline ?? 1)) * 1000) / 10;
    const diff = Math.round((topL2wVal - avgL2w * 100) * 10) / 10;
    if (diff >= 5) {
      insights.push(
        `Mejor conversión en ${topL2w.label}: L2W del ${topL2wVal}% (${diff > 0 ? "+" : ""}${diff}pp sobre la media regional).`,
      );
    }
  }

  // 3. TAM opportunity — highest untapped
  if (Object.keys(tamBySectorForRegion).length > 0) {
    const byUntapped = industries
      .map((i) => {
        const tam = tamBySectorForRegion[i.label] ?? 0;
        return { label: i.label, active: i.active, untapped: tam > 0 ? tam - i.active : -1, tam };
      })
      .filter((x) => x.untapped > 0)
      .sort((a, b) => b.untapped - a.untapped);
    const best = byUntapped[0];
    if (best && best.tam > 0) {
      const pen = Math.round((best.active / best.tam) * 100);
      insights.push(
        `Mayor TAM sin cubrir: ${best.label} con ${best.untapped.toLocaleString()} empresas disponibles (solo ${pen}% penetrado).`,
      );
    }
  }

  // 4. ARPU outlier
  const withActive = industries.filter((i) => i.active >= 3);
  if (withActive.length >= 2) {
    const high = withActive.filter((i) => i.arpu >= arpu * 1.4);
    const low = withActive.filter((i) => i.arpu <= arpu * 0.6);
    if (high.length > 0) {
      const h = high.sort((a, b) => b.arpu - a.arpu)[0];
      insights.push(`ARPU anómalo en ${h.label}: ${fmtN(h.arpu)} — segmento premium, revisar mix y pricing.`);
    } else if (low.length > 0) {
      const l = low.sort((a, b) => a.arpu - b.arpu)[0];
      insights.push(`ARPU anómalo en ${l.label}: ${fmtN(l.arpu)} — ticket bajo, revisar mix de producto.`);
    }
  }

  return insights.slice(0, 4);
}

// ── Strategic conclusion + top actions ───────────────────────────────────────

function generateStrategyConclusion(
  active: number,
  totalMrr: number,
  arpu: number,
  d2w: number,
  penetration: number,
  tam: number,
  archetype: RegionPlaybook["archetype"],
  provenances: RegionPlaybook["provenances"],
  sizes: RegionPlaybook["sizes"],
  partners: RegionPlaybook["partners"],
  partnerShare: number,
  natArpu: number,
  natD2w: number,
  natPen: number,
): { conclusion: string; topActions: string[] } {
  const untapped      = tam > 0 ? Math.round(tam * (1 - penetration / 100)) : 0;
  const topProv       = [...provenances].sort((a, b) => b.mrr - a.mrr)[0];
  const topPartner    = partners.length > 0 ? [...partners].sort((a, b) => b.mrr - a.mrr)[0] : null;
  const topSize       = [...sizes].filter(s => s.label !== "Unknown").sort((a, b) => b.mrr - a.mrr)[0];
  const partnerChs    = provenances.filter(p => ["Santander","Telefónica","Channel Partners"].includes(p.label));
  const directChs     = provenances.filter(p => ["Inbound","Outbound"].includes(p.label));
  const bestPartnerCh = partnerChs.length ? [...partnerChs].sort((a, b) => b.arpu - a.arpu)[0] : null;
  const worstDirectCh = directChs.length  ? [...directChs].sort((a, b) => (a.d2w ?? 0) - (b.d2w ?? 0))[0]   : null;
  const topConc       = topPartner && totalMrr > 0 ? Math.round(topPartner.mrr / totalMrr * 100) : 0;

  const isConcentrated      = topConc >= 25 && (topPartner?.clients ?? 0) >= 10;
  const isConversionProblem = d2w < natD2w - 5;
  const isVolumeProblem     = penetration < natPen - 1.5 && d2w >= natD2w - 3;
  const isMatureMrktHighArpu = penetration >= natPen + 1.5 && arpu >= natArpu * 1.1;
  const isPartnerDominated  = archetype === "partner-led" && partnerShare >= 50;
  const hasArpuGap          = bestPartnerCh && worstDirectCh &&
                              bestPartnerCh.arpu >= worstDirectCh.arpu * 1.8;

  let conclusion = "";
  const actions: string[] = [];

  if (isConcentrated) {
    const riskMrr = topPartner!.mrr;
    conclusion = `${topPartner!.name} controla el ${topConc}% del MRR regional (€${riskMrr.toLocaleString()}/mes). El mercado funciona, pero hay un riesgo de concentración crítico: si ese socio cambia de estrategia o pierde un AE clave, la región pierde más de un cuarto de sus ingresos de golpe. La prioridad no es crecer más rápido — es diversificar el motor antes de que se materialice el riesgo.`;
    actions.push(`Firmar 1-2 socios con perfil similar a ${topPartner!.name} antes de fin de año — objetivo: bajar la dependencia del top partner por debajo del 20% del MRR regional.`);
    actions.push(`Establecer relación directa Factorial con los ${Math.min(10, Math.round(riskMrr / (arpu || 1)))} clientes más grandes de ${topPartner!.name}. Si el socio sale, la retención del cliente no puede depender de él.`);
    if (untapped > 200) actions.push(`Con ${untapped.toLocaleString()} empresas sin tocar y la conversión funcionando, hay margen real de crecimiento — pero exige diversificar el canal, no aumentar la exposición al socio actual.`);
  } else if (isConversionProblem) {
    const worstCh     = worstDirectCh ?? [...provenances].sort((a, b) => (a.d2w ?? 0) - (b.d2w ?? 0))[0];
    const lostDeals   = worstCh ? Math.round(worstCh.active * ((natD2w - d2w) / 100)) : 0;
    conclusion = `El mercado existe y quiere comprar — el ARPU de €${arpu.toLocaleString()} lo confirma. El problema está en el funnel: la tasa de cierre es ${Math.round(natD2w - d2w)}pp por debajo de la media nacional${worstCh ? `, sobre todo en ${worstCh.label} (${(worstCh.d2w ?? 0).toFixed(1)}%)` : ""}. No es un problema de producto ni de mercado — es de ICP o de ejecución de ventas. Contratar más SDRs sin corregir esto amplifica el problema, no lo resuelve.`;
    if (worstCh) actions.push(`Redefinir el ICP de ${worstCh.label} inmediatamente: subir el criterio mínimo a 50+ empleados y sectores con ARPU probado. El efecto matemático de subir la L2W al benchmark nacional es +${lostDeals} clientes activos con el mismo pipeline actual — sin contratar nadie.`);
    if (bestPartnerCh && (bestPartnerCh.d2w ?? 0) > d2w + 8) actions.push(`${bestPartnerCh.label} convierte al ${(bestPartnerCh.d2w ?? 0).toFixed(1)}% — ${Math.round((bestPartnerCh.d2w ?? 0) - d2w)}pp sobre el promedio regional. Redirigir pipeline hacia este canal es el camino de menor resistencia para mejorar la conversión a corto plazo.`);
    actions.push(`Revisar los últimos 20 deals perdidos y clasificarlos por razón de pérdida. Si el patrón es precio, el problema es posicionamiento. Si es fit, el problema es ICP. La acción es diferente en cada caso.`);
  } else if (isVolumeProblem) {
    const mrrUpside = Math.round(untapped * (penetration / 100) * arpu);
    conclusion = `La conversión funciona bien${d2w >= natD2w ? ` (${d2w.toFixed(1)}% L2W, por encima del nacional)` : ""} — cuando llega una empresa al funnel, el equipo cierra. El cuello de botella es puro volumen: solo el ${penetration}% del TAM es cliente, quedan ${untapped.toLocaleString()} empresas elegibles sin tocar. A la tasa de conversión actual, capturar otro 2pp del TAM equivaldría a +€${mrrUpside.toLocaleString()} MRR sin cambiar nada del proceso de ventas.`;
    if (archetype === "partner-led") {
      actions.push(`Firmar ${Math.max(2, Math.ceil((10 - partners.length) / 2))} socios nuevos en los próximos 6 meses. Con L2W sólida, cada partner que traiga 5 demos/mes se convierte en +${Math.round(5 * d2w / 100)} clientes activos. El ROI del partner supera el del SDR en esta región.`);
    } else {
      actions.push(`Aumentar el volumen de secuencias SDR enfocadas en ${topSize?.label ?? "segmento M (51-200)"}. La conversión aguanta — el único límite es cuántas empresas elegibles entran al funnel cada mes.`);
    }
    if (bestPartnerCh && bestPartnerCh.arpu > arpu * 1.4) actions.push(`Doblar el pipeline de ${bestPartnerCh.label}: convierte bien y trae tickets ${Math.round(bestPartnerCh.arpu / arpu * 10) / 10}x superiores a la media regional. Es el canal con mayor retorno inmediato por demo invertida.`);
    actions.push(`Mapear los clusters industriales o municipios con mayor densidad de empresas elegibles sin tocar en el TAM — y abrir allí primero en vez de dispersar el esfuerzo geográficamente.`);
  } else if (isMatureMrktHighArpu) {
    conclusion = `Mercado maduro con ${penetration}% de penetración — por encima de la media nacional — y ARPU de €${arpu.toLocaleString()} que supera el benchmark. El crecimiento extensivo (más pipeline, más SDRs) tiene retornos decrecientes. La palanca ahora es crecimiento intensivo: socios que lleguen a enterprise, expansión de módulos en clientes actuales y upsell estructurado.`;
    if (topPartner) actions.push(`Escalar el modelo de ${topPartner.name}: sus ${topPartner.clients} clientes a €${topPartner.mrr > 0 && topPartner.clients > 0 ? Math.round(topPartner.mrr / topPartner.clients).toLocaleString() : 0}/cliente prueban que hay empresa grande en este mercado. Buscar 1-2 socios con el mismo perfil de cartera para replicarlo.`);
    const xlSize = sizes.find(s => s.label.includes("500"));
    if (xlSize && xlSize.active < active * 0.05) actions.push(`Solo ${xlSize.active} clientes de 500+ empleados sobre ${active} activos. Una campaña específica para enterprise (500+ empleados) en esta región podría doblar el ARPU medio sin aumentar el volumen de clientes.`);
    actions.push(`Programa de expansión en la base existente: identificar los ${Math.min(20, Math.round(active * 0.15))} clientes con mayor potencial de upsell por módulos no contratados y lanzar una ronda de revisión de cuenta.`);
  } else if (isPartnerDominated && hasArpuGap) {
    const ratio = bestPartnerCh && worstDirectCh ? Math.round(bestPartnerCh.arpu / worstDirectCh.arpu * 10) / 10 : 0;
    conclusion = `Los partners generan el ${Math.round(partnerShare)}% del MRR con un ARPU ${ratio}x superior al canal directo. La diferencia no es fruto de la negociación — es selección de empresa: el canal indirecto llega sistemáticamente a empresas M/L que el SDR no alcanza. En esta región, cada euro de pipeline en partners tiene un ROI estructuralmente más alto que el canal directo.`;
    if (bestPartnerCh) actions.push(`Maximizar el pipeline de ${bestPartnerCh.label} (€${bestPartnerCh.arpu.toLocaleString()} ARPU, L2W ${(bestPartnerCh.d2w ?? 0).toFixed(1)}%). Este canal ya demuestra que funciona — la palanca es cuántas demos más puede absorber sin degradar la calidad.`);
    if (partners.length < 5) actions.push(`Solo ${partners.length} socios activos con ${untapped.toLocaleString()} empresas sin tocar. Incorporar ${Math.max(2, 5 - partners.length)} partners nuevos con perfil similar al top actual. Cada nuevo socio con 5+ clientes a este ARPU = +€${Math.round((bestPartnerCh?.arpu ?? arpu) * 5).toLocaleString()}/mes inmediatos.`);
    if (worstDirectCh && (worstDirectCh.d2w ?? 0) < natD2w - 5) actions.push(`${worstDirectCh.label} convierte al ${(worstDirectCh.d2w ?? 0).toFixed(1)}% con ARPU de €${worstDirectCh.arpu.toLocaleString()} — por debajo del umbral de rentabilidad frente al coste del AE. Reducir inversión en este canal y redirigir al co-sell con partners.`);
  } else {
    const arpu_vs = arpu >= natArpu * 1.1 ? `un ${Math.round((arpu/natArpu - 1)*100)}% por encima del nacional` : arpu < natArpu * 0.9 ? `un ${Math.round((1 - arpu/natArpu)*100)}% por debajo` : "en línea con el nacional";
    conclusion = `Con ${active} clientes activos (${penetration}% de penetración) y ARPU de €${arpu.toLocaleString()} — ${arpu_vs} — esta región tiene un perfil ${penetration >= natPen ? "maduro" : "en desarrollo"}. El canal líder es ${topProv?.label ?? "mixto"} y la oportunidad más directa es escalar lo que ya funciona en vez de abrir nuevos frentes.`;
    if (topProv) actions.push(`Maximizar el canal ${topProv.label}: con ${topProv.active} clientes activos y €${topProv.arpu.toLocaleString()} ARPU demostrado, el retorno de escalar este canal es predecible y bajo riesgo.`);
    if (untapped > 100) actions.push(`Quedan ${untapped.toLocaleString()} empresas elegibles sin tocar. Con la tasa de conversión actual, un 10% adicional de pipeline sobre ese TAM equivaldría a +${Math.round(untapped * 0.1 * (d2w / 100))} clientes nuevos.`);
  }

  return { conclusion, topActions: actions.filter(Boolean).slice(0, 3) };
}

// ── Best practices computation ───────────────────────────────────────────────

function computeBestPractices(regions: RegionPlaybook[]): BestPractice[] {
  type RawBp = {
    key: string; // channel+dim+segment
    regionName: string;
    regionCode: string;
    channel: string;
    dimension: "size" | "industry";
    segment: string;
    l2w: number;
    regionL2wAvg: number;
    l2wUplift: number;
    arpu: number;
    regionArpuAvg: number;
    arpuUplift: number;
    pipeline: number;
    active: number;
    mrr: number;
    tamAvailable: number;
  };

  const raw: RawBp[] = [];

  for (const region of regions) {
    // Adaptive minimum: 1/15th of region total, clamped 8–30.
    // Lets smaller regions (Murcia ~131, Galicia ~331) and narrower partner
    // channels surface BPs that would otherwise be filtered by the hard 30 floor.
    const minActive = Math.max(8, Math.min(30, Math.floor(region.active / 15)));

    // Shared helper: qualify one cross-cell as a best practice candidate
    function qualifyCell(
      cross: Record<string, Record<string, { active: number; pipeline: number; mrr: number }>>,
      dimension: "size" | "industry",
      getTam: (seg: string) => number,
    ) {
      // Per-channel averages (weighted across all segments)
      const channelL2wAvg: Record<string, number> = {};
      const channelArpuAvg: Record<string, number> = {};
      for (const ch of Object.keys(cross)) {
        const cells = Object.values(cross[ch]);
        const totalPipeline = cells.reduce((s, c) => s + c.pipeline, 0);
        const totalActive   = cells.reduce((s, c) => s + c.active, 0);
        const totalMrr      = cells.reduce((s, c) => s + c.mrr, 0);
        channelL2wAvg[ch]  = totalPipeline > 0 ? totalActive / totalPipeline : 0;
        channelArpuAvg[ch] = totalActive   > 0 ? totalMrr   / totalActive   : 0;
      }

      type Candidate = RawBp & { score: number };
      const candidates: Candidate[] = [];

      for (const ch of Object.keys(cross)) {
        for (const seg of Object.keys(cross[ch])) {
          const cell = cross[ch][seg];
          if (!cell || cell.active < minActive) continue;
          const l2w      = cell.pipeline > 0 ? cell.active / cell.pipeline : 0;
          const arpu     = cell.active   > 0 ? cell.mrr    / cell.active   : 0;
          const chL2wAvg = channelL2wAvg[ch]  ?? 0;
          const chArpuAvg = channelArpuAvg[ch] ?? 0;
          // "Above normal" = 30%+ uplift on L2W or ARPU vs channel average
          const l2wUplift  = chL2wAvg  > 0 ? l2w  / chL2wAvg  : 0;
          const arpuUplift = chArpuAvg > 0 ? arpu / chArpuAvg : 0;
          if (l2wUplift < 1.3 && arpuUplift < 1.3) continue;
          const tam = getTam(seg);
          const tamAvailable = tam > 0 ? Math.max(0, tam - cell.active) : 0;
          // Score: primary uplift × log(active) — rewards significance + magnitude
          const uplift = Math.max(l2wUplift, arpuUplift);
          const score  = uplift * Math.log(cell.active + 1);
          candidates.push({
            key: `${ch}|${dimension}|${seg}`,
            regionName: region.ccaa,
            regionCode: region.code,
            channel: ch,
            dimension,
            segment: seg,
            l2w: Math.round(l2w * 1000) / 10,
            regionL2wAvg: Math.round(chL2wAvg * 1000) / 10,
            l2wUplift,
            arpu: Math.round(arpu),
            regionArpuAvg: Math.round(chArpuAvg),
            arpuUplift,
            pipeline: cell.pipeline,
            active: cell.active,
            mrr: cell.mrr,
            tamAvailable,
            score,
          });
        }
      }
      return candidates;
    }

    // ── Collect all candidates per region, cap at top 3 ────────────────────
    type ScoredBp = RawBp & { score: number };
    const regionCandidates: ScoredBp[] = [];

    if (region.channelSizeCross) {
      regionCandidates.push(...qualifyCell(
        region.channelSizeCross,
        "size",
        (seg) => region.tamBySizeForRegion?.[seg] ?? 0,
      ));
    }
    if (region.channelIndustryCross) {
      regionCandidates.push(...qualifyCell(
        region.channelIndustryCross,
        "industry",
        (seg) => region.tamBySectorForRegion?.[seg] ?? 0,
      ));
    }

    // Top 3 per region by score
    const top3 = regionCandidates
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    raw.push(...top3);
  }

  // Group by key to detect cross-region patterns
  const byKey = new Map<string, RawBp[]>();
  for (const r of raw) {
    const arr = byKey.get(r.key) ?? [];
    arr.push(r);
    byKey.set(r.key, arr);
  }

  const result: BestPractice[] = [];
  for (const [key, entries] of byKey) {
    const isCrossRegion = entries.length >= 3;
    for (const e of entries) {
      const tamStr = e.tamAvailable > 0 ? ` TAM disponible: ${e.tamAvailable.toLocaleString()} empresas sin tocar.` : "";
      const dimLabel = e.dimension === "size" ? "tamaño" : "sector";
      const crossLabel = isCrossRegion ? " (patrón cross-región)" : "";

      // Determine which metric(s) actually triggered the qualification
      const l2wExceptional  = e.l2wUplift  >= 1.3;
      const arpuExceptional = e.arpuUplift >= 1.3;
      const qualifier = l2wExceptional && arpuExceptional
        ? "conversión y ARPU excepcionales"
        : l2wExceptional
        ? "conversión excepcional"
        : "ARPU excepcional";

      const headline = `${e.channel} × ${e.segment} — ${qualifier}${crossLabel}`;

      // Insight: lead with the exceptional metric, show the other as context
      const insightParts: string[] = [];
      if (l2wExceptional) {
        insightParts.push(`L2W ${e.l2w}% (vs ${e.regionL2wAvg}% media canal)`);
      }
      if (arpuExceptional) {
        insightParts.push(`ARPU ${fmtN(e.arpu)} (vs ${fmtN(e.regionArpuAvg)} media canal)`);
      }
      insightParts.push(`${e.pipeline} leads`);
      insightParts.push(`MRR ${fmtN(e.mrr)}`);
      if (!arpuExceptional) insightParts.push(`ARPU ${fmtN(e.arpu)}`);
      const insight = insightParts.join(" · ") + ".";

      const recommendation = e.tamAvailable > 0
        ? `Doblar volumen en este ${dimLabel}.${tamStr}`
        : `Reforzar presencia en este ${dimLabel} — buen retorno demostrado.`;

      result.push({
        id: `${e.regionCode}-${key.replace(/[|]/g, "-")}`,
        regions: [e.regionName],
        codes: [e.regionCode],
        channel: e.channel,
        dimension: e.dimension,
        segment: e.segment,
        l2w: e.l2w,
        regionL2wAvg: e.regionL2wAvg,
        arpu: e.arpu,
        regionArpuAvg: e.regionArpuAvg,
        pipeline: e.pipeline,
        active: e.active,
        mrr: e.mrr,
        tamAvailable: e.tamAvailable,
        isCrossRegion,
        headline,
        insight,
        recommendation,
      });
    }
  }

  // Sort: cross-region first, then by l2w desc
  return result.sort((a, b) => {
    if (a.isCrossRegion !== b.isCrossRegion) return a.isCrossRegion ? -1 : 1;
    return b.l2w - a.l2w;
  });
}

// ── Main computation ─────────────────────────────────────────────────────────

export function computePlaybook(
  companies: StrategyCompany[],
  breakdown: SasorBreakdown | null,
): PlaybookLiveData {
  const tamByCcaa = breakdown?.byCcaa ?? {};
  // Filter to Spain only (exclude foreign accounts)
  const rows = companies.filter((c) => {
    const isSpain = !c.country || c.country.toLowerCase() === "es";
    return isSpain;
  });

  const normed: NormedRow[] = rows.map((c) => {
    const { isActive, isWon, hasDemo } = resolveFlags(c);
    const ccaa = normCcaa(c.ccaa ?? "", c.ciudad_enriched ?? c.ciudad ?? "");
    const channel = normChannel(c.provenance_norm ?? c.provenance ?? "", c.partner_object_name ?? "");
    const size = computeSize(c.empresa_size ?? 0, c.total_seats ?? 0);
    const sector = hubspotToSector(c.industria ?? "");
    const dateStr = c.deal_closed_date || (c.close_date ?? "") || "";
    const closeDate = dateStr ? new Date(dateStr).getTime() : null;
    return {
      ccaa,
      channel,
      size,
      sector,
      partnerName: c.partner_object_name?.trim() ?? "",
      isActive,
      isWon,
      hasDemo,
      cmrr: isActive ? (c.cmrr ?? 0) : 0,
      closeDate: closeDate && !isNaN(closeDate) ? closeDate : null,
    };
  });

  // Group by CCAA (drop empty/unresolved)
  const byRegion = new Map<string, NormedRow[]>();
  for (const r of normed) {
    if (!r.ccaa) continue;
    const arr = byRegion.get(r.ccaa) ?? [];
    arr.push(r);
    byRegion.set(r.ccaa, arr);
  }

  // National aggregates (before per-region loop, so we can reference them in text)
  const allResolved = normed.filter((r) => !!r.ccaa);
  const natActive = allResolved.filter((r) => r.isActive).length;
  const natWon    = allResolved.filter((r) => r.isWon).length;
  const natDemos  = allResolved.filter((r) => r.hasDemo).length;
  const natMrr    = allResolved.filter((r) => r.isActive).reduce((s, r) => s + r.cmrr, 0);
  const natArpu   = natActive > 0 ? Math.round(natMrr / natActive) : 0;
  const natD2w    = natDemos  > 0 ? Math.round((natWon / natDemos) * 1000) / 10 : 0;
  const natPartnerMrr = allResolved
    .filter((r) => r.isActive && ["Channel Partners", "Santander", "Telefónica"].includes(r.channel))
    .reduce((s, r) => s + r.cmrr, 0);
  const natTamTotal = Object.values(tamByCcaa).reduce((s, n) => s + n, 0);
  const natPen = natTamTotal > 0 ? Math.round((natActive / natTamTotal) * 1000) / 10 : 0;
  const natPartnerShare = natMrr > 0 ? Math.round((natPartnerMrr / natMrr) * 1000) / 10 : 0;

  // ── Per-region computation ─────────────────────────────────────────────────
  const regions: RegionPlaybook[] = [];

  for (const [ccaa, rows] of byRegion) {
    const code = CCAA_CODES[ccaa];
    if (!code) continue; // skip Ceuta, Melilla, unrecognised

    const active = rows.filter((r) => r.isActive);
    const activeCount = active.length;
    const wonCount    = rows.filter((r) => r.isWon).length;
    const demoCount   = rows.filter((r) => r.hasDemo).length;
    const totalMrr    = active.reduce((s, r) => s + r.cmrr, 0);
    const arpu        = activeCount > 0 ? Math.round(totalMrr / activeCount) : 0;
    const d2w         = demoCount > 0 ? Math.round((wonCount / demoCount) * 1000) / 10 : 0;
    const tam         = tamByCcaa[ccaa] ?? 0;
    const penetration = tam > 0 ? Math.round((activeCount / tam) * 1000) / 10 : 0;

    // ── Sizes ────────────────────────────────────────────────────────────────
    const sizeAgg = new Map(SIZE_ORDER.map((s) => [s, { all: 0, active: 0, won: 0, demos: 0, mrr: 0 }]));
    for (const r of rows) {
      const g = sizeAgg.get(r.size);
      if (!g) continue;
      g.all++;
      if (r.isActive) { g.active++; g.mrr += r.cmrr; }
      if (r.isWon)    g.won++;
      if (r.hasDemo)  g.demos++;
    }
    const sizes = SIZE_ORDER
      .map((label) => {
        const g = sizeAgg.get(label)!;
        return {
          label,
          pipeline: g.all,
          demos:    g.demos,
          active:   g.active,
          won:      g.won,
          mrr:      g.mrr,
          arpu:     g.active > 0 ? Math.round(g.mrr / g.active) : 0,
          d2w:      g.demos  > 0 ? Math.round((g.won / g.demos) * 1000) / 10 : null,
          l2w:      g.all    > 0 ? Math.round((g.active / g.all) * 1000) / 10 : 0,
          mrrShare: totalMrr > 0 ? Math.round((g.mrr / totalMrr) * 100) : 0,
        };
      })
      .filter((s) => s.pipeline > 0);

    // ── Provenances ──────────────────────────────────────────────────────────
    const provAgg = new Map<string, { all: number; active: number; won: number; demos: number; mrr: number }>();
    for (const r of rows) {
      const g = provAgg.get(r.channel) ?? { all: 0, active: 0, won: 0, demos: 0, mrr: 0 };
      g.all++;
      if (r.isActive) { g.active++; g.mrr += r.cmrr; }
      if (r.isWon)    g.won++;
      if (r.hasDemo)  g.demos++;
      provAgg.set(r.channel, g);
    }
    const provenances: RegionPlaybook["provenances"] = [...provAgg.entries()]
      .map(([label, g]) => ({
        label,
        pipeline:  g.all,
        demos:     g.demos,
        active:    g.active,
        won:       g.won,
        mrr:       g.mrr,
        mrrShare:  totalMrr > 0 ? Math.round((g.mrr / totalMrr) * 100) : 0,
        arpu:      g.active > 0 ? Math.round(g.mrr / g.active) : 0,
        d2w:       g.demos  > 0 ? Math.round((g.won / g.demos) * 1000) / 10 : null,
        l2w:       g.all    > 0 ? Math.round((g.active / g.all) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.mrr - a.mrr);

    // ── Industries ───────────────────────────────────────────────────────────
    const indAgg = new Map<string, { active: number; pipeline: number; mrr: number }>();
    for (const r of rows) {  // all rows, not just active
      const g = indAgg.get(r.sector) ?? { active: 0, pipeline: 0, mrr: 0 };
      g.pipeline++;
      if (r.isActive) { g.active++; g.mrr += r.cmrr; }
      indAgg.set(r.sector, g);
    }
    const industries: RegionPlaybook["industries"] = [...indAgg.entries()]
      .map(([label, g]) => ({
        label,
        active:   g.active,
        pipeline: g.pipeline,
        mrr:      g.mrr,
        arpu:     g.active > 0 ? Math.round(g.mrr / g.active) : 0,
      }))
      .filter((i) => i.active > 0)
      .sort((a, b) => b.mrr - a.mrr)
      .slice(0, 8);

    // ── Partners ─────────────────────────────────────────────────────────────
    const partnerAgg = new Map<string, { clients: number; mrr: number }>();
    for (const r of active) {
      if (!r.partnerName || !["Channel Partners", "Santander", "Telefónica"].includes(r.channel)) continue;
      const g = partnerAgg.get(r.partnerName) ?? { clients: 0, mrr: 0 };
      g.clients++;
      g.mrr += r.cmrr;
      partnerAgg.set(r.partnerName, g);
    }
    const partners: RegionPlaybook["partners"] = [...partnerAgg.entries()]
      .map(([name, g]) => ({ name, clients: g.clients, mrr: g.mrr }))
      .sort((a, b) => b.mrr - a.mrr)
      .slice(0, 5);

    // ── Canal × Tamaño / Canal × Industria cross-tables ─────────────────────
    const chSizeCross: Record<string, Record<string, { active: number; pipeline: number; mrr: number }>> = {};
    const chIndCross: Record<string, Record<string, { active: number; pipeline: number; mrr: number }>> = {};
    for (const r of rows) {
      // size cross
      if (!chSizeCross[r.channel]) chSizeCross[r.channel] = {};
      const sc = chSizeCross[r.channel][r.size] ?? { active: 0, pipeline: 0, mrr: 0 };
      sc.pipeline++;
      if (r.isActive) { sc.active++; sc.mrr += r.cmrr; }
      chSizeCross[r.channel][r.size] = sc;
      // industry cross
      if (!chIndCross[r.channel]) chIndCross[r.channel] = {};
      const ic = chIndCross[r.channel][r.sector] ?? { active: 0, pipeline: 0, mrr: 0 };
      ic.pipeline++;
      if (r.isActive) { ic.active++; ic.mrr += r.cmrr; }
      chIndCross[r.channel][r.sector] = ic;
    }

    // ── Archetype (date-weighted) ──────────────────────────────────────────
    const archetype = computeArchetypeWeighted(rows);

    // ── Strategy text ────────────────────────────────────────────────────────
    const topProv    = provenances[0];
    const partnerProvs = provenances.filter((p) =>
      ["Channel Partners", "Santander", "Telefónica"].includes(p.label));
    const partnerMrr = partnerProvs.reduce((s, p) => s + p.mrr, 0);
    const partnerShare = totalMrr > 0 ? Math.round((partnerMrr / totalMrr) * 100) : 0;

    // Canal principal
    const leadChannel = topProv?.label ?? "—";
    const topL2w = topProv && topProv.pipeline > 0
      ? Math.round(topProv.active / topProv.pipeline * 1000) / 10 : null;
    const secondProv = provenances[1];
    const leadChannelDetail = (() => {
      if (!topProv) return "Sin canal dominante identificado.";
      const parts: string[] = [];
      // How dominant is the top channel?
      if (topProv.mrrShare >= 40) {
        parts.push(`${topProv.label} concentra casi la mitad de los ingresos regionales y es el canal con mayor peso.`);
      } else if (topProv.mrrShare >= 25) {
        parts.push(`${topProv.label} lidera el mix de canales, aportando más de un cuarto del MRR regional.`);
      } else {
        parts.push(`El mix está bastante equilibrado; ${topProv.label} encabeza con ligera ventaja.`);
      }
      // ARPU vs regional average
      if (topProv.arpu > arpu * 1.25) {
        parts.push(`Es además el canal con mayor ticket unitario, lo que indica que capta empresas más grandes o con más módulos contratados.`);
      } else if (topProv.arpu < arpu * 0.8) {
        parts.push(`Su ticket es inferior a la media regional — atrae muchos clientes pequeños. El volumen compensa el tamaño.`);
      }
      // Second channel comparison
      if (secondProv) {
        const arpuRatio = topProv.arpu > 0 && secondProv.arpu > 0 ? secondProv.arpu / topProv.arpu : 1;
        if (arpuRatio > 1.3) {
          parts.push(`${secondProv.label} genera menos volumen pero cierra deals más caros — canal a desarrollar activamente.`);
        } else if (arpuRatio < 0.7) {
          parts.push(`${secondProv.label} complementa con mayor volumen de leads, aunque con un perfil de empresa más pequeño.`);
        } else {
          parts.push(`${secondProv.label} ocupa el segundo lugar con un perfil similar.`);
        }
      }
      return parts.join(" ");
    })();

    // Partners
    const partnerPlay = partnerShare >= 30
      ? `Motor clave — ${partnerShare}% del MRR regional`
      : partnerShare >= 15
      ? `Creciendo — ${partnerShare}% MRR, escalar`
      : "Sin activar — oportunidad de captación";
    const partnerDetail = (() => {
      if (partnerProvs.length === 0) {
        if (partners.length > 0) {
          return `El canal partner tiene presencia incipiente. Partners identificados: ${partners.slice(0, 3).map((p) => p.name).join(", ")}. Hay margen de desarrollo.`;
        }
        return "No hay partners activos en esta región. Es una oportunidad de canal sin explotar.";
      }
      const parts: string[] = [];
      // Overall partner weight
      if (partnerShare >= 40) {
        parts.push(`Los partners son el pilar de esta región — generan más de ${partnerShare}% del MRR y no se puede crecer sin ellos.`);
      } else if (partnerShare >= 25) {
        parts.push(`El canal partner es relevante, aportando más de un cuarto de los ingresos regionales.`);
      } else {
        parts.push(`Los partners aportan alrededor de ${partnerShare}% del MRR — un complemento que merece más inversión.`);
      }
      // Characterize each partner channel
      for (const p of partnerProvs) {
        const ratio = arpu > 0 ? p.arpu / arpu : 1;
        if (p.label === "Santander") {
          if (ratio > 1.1) parts.push(`Santander atrae un perfil de empresa por encima de la media, con buen ticket.`);
          else parts.push(`Santander genera volumen de clientes aunque con ticket contenido.`);
        } else if (p.label === "Telefónica") {
          if (p.active < 20) parts.push(`Telefónica tiene pocos clientes activos pero cada deal vale más — señal de empresas medianas o grandes.`);
          else parts.push(`Telefónica aporta un bloque relevante de clientes.`);
        } else if (ratio > 1.3) {
          parts.push(`Channel Partners cierra deals más grandes que la media regional — son los que traen las cuentas de mayor valor.`);
        } else {
          parts.push(`Channel Partners complementa con un perfil variado de empresas.`);
        }
      }
      return parts.join(" ");
    })();

    // Tamaño
    const sizesWithData = sizes.filter((s) => s.active >= 5);
    const topArpuSize  = [...sizesWithData].sort((a, b) => b.arpu - a.arpu)[0];
    const topVolSize   = [...sizesWithData].sort((a, b) => b.active - a.active)[0];
    const topMrrSize   = [...sizesWithData].sort((a, b) => b.mrrShare - a.mrrShare)[0];
    const sizeFocus    = topMrrSize?.label ?? topArpuSize?.label ?? "—";
    const sizeDetail = (() => {
      if (!sizesWithData.length) return "Sin datos de segmentación suficientes.";
      const parts: string[] = [];
      // Primary MRR driver
      if (topMrrSize) {
        const isAlsoTopArpu = topArpuSize?.label === topMrrSize.label;
        if (isAlsoTopArpu) {
          parts.push(`El segmento ${topMrrSize.label} concentra la mayor parte de los ingresos y además tiene el ticket más alto — es el punto óptimo de esta región.`);
        } else {
          parts.push(`El segmento ${topMrrSize.label} es el mayor generador de ingresos.`);
        }
      }
      // ARPU opportunity: biggest gap between top ARPU and top volume
      if (topArpuSize && topVolSize && topArpuSize.label !== topVolSize.label) {
        const arpuGap = topVolSize.arpu > 0 ? Math.round(topArpuSize.arpu / topVolSize.arpu) : 1;
        if (arpuGap >= 2) {
          parts.push(`Mover deals del segmento ${topVolSize.label} al ${topArpuSize.label} multiplicaría el ticket por ${arpuGap} — sin cambiar el número de clientes.`);
        } else {
          parts.push(`${topArpuSize.label} tiene el mayor ticket, aunque el volumen principal está en ${topVolSize.label}.`);
        }
      }
      return parts.join(" ");
    })();

    // ARPU
    const arpuVsNat = natArpu > 0 ? arpu / natArpu : 1;
    const arpuPct   = Math.round((arpuVsNat - 1) * 100);
    const arpuAssessment = arpuVsNat >= 1.1
      ? `${fmtN(arpu)} (+${arpuPct}% vs nacional)`
      : arpuVsNat <= 0.9
      ? `${fmtN(arpu)} (${arpuPct}% vs nacional)`
      : `${fmtN(arpu)} (en línea con nacional)`;
    const arpuDetail = (() => {
      const parts: string[] = [];
      if (arpuVsNat >= 1.15) {
        parts.push(`El ticket medio regional es superior a la media nacional — esta región cierra contratos más grandes o con más módulos activados.`);
      } else if (arpuVsNat <= 0.85) {
        parts.push(`El ticket medio está por debajo de la media nacional. Hay margen de mejora con upsell en clientes existentes o cambiando el mix hacia segmentos más grandes.`);
      } else {
        parts.push(`El ticket medio está en línea con el resto de España.`);
      }
      if (topArpuSize && topVolSize && topArpuSize.label !== topVolSize.label) {
        parts.push(`La palanca de ARPU más directa es empujar más pipeline hacia ${topArpuSize.label}, que genera el mayor valor por cliente.`);
      }
      return parts.join(" ");
    })();

    // Conversión
    const hubspotCount = rows.length;
    const l2wRegion  = hubspotCount > 0 ? Math.round(activeCount / hubspotCount * 1000) / 10 : 0;
    const natL2w     = 18.6;
    const l2wDiff    = Math.round((l2wRegion - natL2w) * 10) / 10;
    const d2wDiff    = Math.round((d2w - natD2w) * 10) / 10;
    const conversionAssessment = (() => {
      const parts: string[] = [];
      // L2W — structural conversion
      if (l2wRegion > natL2w + 2) {
        parts.push(`De cada 100 empresas que entran al funnel, ${l2wRegion} son hoy clientes activos — por encima de la media nacional.`);
      } else if (l2wRegion < natL2w - 3) {
        parts.push(`Solo ${l2wRegion} de cada 100 empresas del pipeline son clientes activos — por debajo de la media. Hay pérdida estructural en algún punto del funnel.`);
      } else {
        parts.push(`La ratio de conversión de leads a clientes activos está en línea con la media nacional.`);
      }
      // D2W — demo-to-win
      if (d2w > natD2w + 4) {
        parts.push(`El equipo de ventas cierra bien: de cada 10 demos, más de ${Math.round(d2w / 10)} se convierten en venta.`);
      } else if (d2w < natD2w - 5) {
        parts.push(`El cierre post-demo es débil — hay oportunidad de mejora en la fase final del ciclo de venta.`);
      }
      return parts.join(" ");
    })();

    // Industria
    const sortedByMrr   = [...industries].filter((i) => i.active > 0).sort((a, b) => b.mrr - a.mrr);
    const sortedByL2w   = [...industries]
      .filter((i) => (i.pipeline ?? 0) >= 20)
      .map((i) => ({ ...i, l2w: i.pipeline! > 0 ? i.active / i.pipeline! : 0 }))
      .sort((a, b) => b.l2w - a.l2w);
    const topIndMrr1 = sortedByMrr[0];
    const topIndMrr2 = sortedByMrr[1];
    const topIndL2w  = sortedByL2w[0];
    const industryFocus = topIndMrr1?.label ?? "—";
    const industryDetail = (() => {
      if (!topIndMrr1) return "Sin datos de industria suficientes.";
      const parts: string[] = [];
      parts.push(`${topIndMrr1.label} es el sector que más ingresos genera en esta región, con ${topIndMrr1.active} clientes activos.`);
      if (topIndMrr2) {
        const arpuComp = topIndMrr1.arpu > 0 && topIndMrr2.arpu > 0 ? topIndMrr2.arpu / topIndMrr1.arpu : 1;
        if (arpuComp > 1.3) {
          parts.push(`${topIndMrr2.label} factura menos en total pero con un ticket por cliente claramente superior.`);
        } else {
          parts.push(`${topIndMrr2.label} sigue en segunda posición con un perfil similar.`);
        }
      }
      if (topIndL2w && topIndL2w.label !== topIndMrr1.label) {
        parts.push(`Donde mejor convierte el funnel es en ${topIndL2w.label} — señal de buen encaje de producto en ese sector.`);
      }
      return parts.join(" ");
    })();

    const keyInsights = generateKeyInsights(
      ccaa, activeCount, totalMrr, arpu, d2w, penetration, tam, provenances, sizes, natArpu, natD2w,
    );
    const openQuestions = generateOpenQuestions(
      ccaa, penetration, d2w, natD2w, archetype, partners, partnerShare,
    );
    const tamBySectorForRegion = breakdown?.byCcaaBySector?.[ccaa] ?? {};
    const industryInsights = generateIndustryInsights(industries, arpu, tamBySectorForRegion);

    regions.push({
      ccaa,
      code,
      archetype,
      tam,
      hubspot:     rows.length,
      active:      activeCount,
      won:         wonCount,
      demos:       demoCount,
      mrr:         totalMrr,
      arpu,
      l2d:         rows.length > 0 ? Math.round((demoCount / rows.length) * 1000) / 10 : 0,
      d2w,
      l2w:         rows.length > 0 ? Math.round((activeCount / rows.length) * 1000) / 10 : 0,
      penetration,
      mrrPerTam:   tam > 0 ? Math.round((totalMrr / tam) * 10) / 10 : 0,
      sizes,
      provenances,
      industries,
      partners,
      strategy: {
        leadChannel,
        leadChannelDetail,
        partnerPlay,
        partnerDetail,
        sizeFocus,
        sizeDetail,
        arpuAssessment,
        arpuDetail,
        conversionAssessment,
        industryFocus,
        industryDetail,
        ...generateStrategyConclusion(
          activeCount, totalMrr, arpu, d2w, penetration, tam,
          archetype, provenances, sizes, partners, partnerShare,
          natArpu, natD2w, 7.1,
        ),
      },
      keyInsights,
      openQuestions,
      industryInsights,
      tamBySizeForRegion:    breakdown?.byCcaaBySize?.[ccaa] ?? {},
      tamBySectorForRegion,
      channelSizeCross:      chSizeCross,
      channelIndustryCross:  chIndCross,
    });
  }

  const sortedRegions = regions.sort((a, b) => b.mrr - a.mrr);
  const bestPractices = computeBestPractices(sortedRegions);

  return {
    regions: sortedRegions,
    tamBySector: breakdown?.bySector ?? {},
    tamBySize:   breakdown?.bySize ?? {},
    tamBySizeBySector: breakdown?.bySizeBySector ?? {},
    bestPractices,
    normedRows: allResolved,
    national: {
      tam:             natTamTotal,
      hubspot:         allResolved.length,
      active:          natActive,
      won:             natWon,
      demos:           natDemos,
      mrr:             natMrr,
      arpu:            natArpu,
      l2d:             allResolved.length > 0 ? Math.round((natDemos / allResolved.length) * 1000) / 10 : 0,
      d2w:             natD2w,
      l2w:             allResolved.length > 0 ? Math.round((natActive / allResolved.length) * 1000) / 10 : 0,
      penetration:     natPen,
      partnerMrrShare: natPartnerShare,
    },
  };
}
