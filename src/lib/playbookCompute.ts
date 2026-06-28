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

export interface PlaybookLiveData {
  regions: RegionPlaybook[];
  national: NationalStats;
  tamBySector: Record<string, number>;
  tamBySize: Record<string, number>;
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

// ── Channel normalisation (sub-splits Santander / Telefónica from Partners) ──

const CHANNEL_ORDER = [
  "Channel Partners", "Outbound", "Inbound", "Santander", "Paid", "Telefónica", "Others",
];

function normChannel(provNorm: string, partnerName: string): string {
  // Partner name takes priority — if a partner is associated, it's a partner deal
  const pn = (partnerName ?? "").trim().toLowerCase();
  if (pn) {
    if (pn.includes("santander")) return "Santander";
    if (pn.includes("telefon") || pn.includes("movistar")) return "Telefónica";
    return "Channel Partners";
  }
  const prov = (provNorm ?? "").trim();
  if (prov === "Partners" || prov === "Partner") return "Channel Partners";
  if (prov === "Inbound")  return "Inbound";
  if (prov === "Outbound") return "Outbound";
  if (prov === "Paid")     return "Paid";
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

// ── Archetype classification ─────────────────────────────────────────────────

function computeArchetype(
  provs: RegionPlaybook["provenances"],
  totalMrr: number,
): RegionPlaybook["archetype"] {
  if (totalMrr === 0) return "multi-channel";
  const partnerMrr = provs
    .filter((p) => ["Channel Partners", "Santander", "Telefónica"].includes(p.label))
    .reduce((s, p) => s + p.mrr, 0);
  const partnerShare = (partnerMrr / totalMrr) * 100;
  if (partnerShare >= 35) return "partner-led";
  const outboundD2w = provs.find((p) => p.label === "Outbound")?.d2w ?? 0;
  if (outboundD2w >= 82 && partnerShare < 25) return "outbound-responsive";
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

  // Normalise each row: resolve ccaa, flags, channel, size
  type NormRow = {
    ccaa: string;
    channel: string;
    size: string;
    sector: string;
    partnerName: string;
    isActive: boolean;
    isWon: boolean;
    hasDemo: boolean;
    cmrr: number;
  };

  const normed: NormRow[] = rows.map((c) => {
    const { isActive, isWon, hasDemo } = resolveFlags(c);
    const ccaa = normCcaa(c.ccaa ?? "", c.ciudad_enriched ?? c.ciudad ?? "");
    const channel = normChannel(c.provenance_norm ?? c.provenance ?? "", c.partner_object_name ?? "");
    const size = computeSize(c.empresa_size ?? 0, c.total_seats ?? 0);
    const sector = hubspotToSector(c.industria ?? "");
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
    };
  });

  // Group by CCAA (drop empty/unresolved)
  const byRegion = new Map<string, NormRow[]>();
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
          active:   g.active,
          mrr:      g.mrr,
          arpu:     g.active > 0 ? Math.round(g.mrr / g.active) : 0,
          d2w:      g.demos  > 0 ? Math.round((g.won / g.demos) * 1000) / 10 : null,
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
        active:    g.active,
        mrr:       g.mrr,
        mrrShare:  totalMrr > 0 ? Math.round((g.mrr / totalMrr) * 100) : 0,
        arpu:      g.active > 0 ? Math.round(g.mrr / g.active) : 0,
        d2w:       g.demos  > 0 ? Math.round((g.won / g.demos) * 1000) / 10 : null,
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

    // ── Archetype ────────────────────────────────────────────────────────────
    const archetype = computeArchetype(provenances, totalMrr);

    // ── Strategy text ────────────────────────────────────────────────────────
    const topProv      = provenances[0];
    const partnerMrr   = provenances
      .filter((p) => ["Channel Partners", "Santander", "Telefónica"].includes(p.label))
      .reduce((s, p) => s + p.mrr, 0);
    const partnerShare = totalMrr > 0 ? Math.round((partnerMrr / totalMrr) * 100) : 0;

    const leadChannel  = topProv?.label ?? "—";
    const leadChannelDetail = topProv
      ? `${topProv.label} lidera con ${topProv.mrrShare}% del MRR (${fmtN(topProv.arpu)} ARPU, D2W ${topProv.d2w ?? "—"}%). ${topProv.active} clientes activos.`
      : "Sin canal dominante identificado.";

    const partnerPlay   = partnerShare >= 20
      ? `Escalar canal partner (${partnerShare}% del MRR actual — ${partners.slice(0, 2).map((p) => p.name).join(", ")})`
      : "Activar y prospectar partners locales — baja presencia actual";
    const partnerDetail = partners.length > 0
      ? partners.slice(0, 3).map((p) => `${p.name}: ${p.clients} clientes, ${fmtN(p.mrr)} MRR`).join(". ") + "."
      : "Sin partners activos registrados en esta región.";

    const bestSizeArpu = [...sizes].filter((s) => s.active >= 3).sort((a, b) => b.arpu - a.arpu)[0];
    const sizeFocus    = bestSizeArpu?.label ?? "M (51-200)";
    const sizeDetail   = sizes.filter((s) => s.active > 0)
      .map((s) => `${s.label}: ${s.active} activos, ${fmtN(s.arpu)} ARPU, ${s.mrrShare}% MRR`)
      .join(". ") + ".";

    const arpuVsNat = natArpu > 0 ? arpu / natArpu : 1;
    const arpuAssessment = arpuVsNat >= 1.1
      ? `${fmtN(arpu)} — ${Math.round((arpuVsNat - 1) * 100)}% por encima de la media nacional (${fmtN(natArpu)})`
      : arpuVsNat <= 0.9
      ? `${fmtN(arpu)} — ${Math.round((1 - arpuVsNat) * 100)}% por debajo de la media nacional (${fmtN(natArpu)})`
      : `${fmtN(arpu)} — en línea con la media nacional (${fmtN(natArpu)})`;

    const d2wDiff = Math.round((d2w - natD2w) * 10) / 10;
    const conversionAssessment = Math.abs(d2wDiff) < 3
      ? `D2W ${d2w}% — alineado con la media nacional (${natD2w}%)`
      : d2wDiff > 0
      ? `D2W ${d2w}% — ${d2wDiff}pp por encima de la media (${natD2w}%)`
      : `D2W ${d2w}% — ${Math.abs(d2wDiff)}pp por debajo de la media (${natD2w}%). Revisar proceso de cierre.`;

    const keyInsights = generateKeyInsights(
      ccaa, activeCount, totalMrr, arpu, d2w, penetration, tam, provenances, sizes, natArpu, natD2w,
    );
    const openQuestions = generateOpenQuestions(
      ccaa, penetration, d2w, natD2w, archetype, partners, partnerShare,
    );

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
      d2w,
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
        conversionAssessment,
      },
      keyInsights,
      openQuestions,
      tamBySizeForRegion:    breakdown?.byCcaaBySize?.[ccaa] ?? {},
      tamBySectorForRegion:  breakdown?.byCcaaBySector?.[ccaa] ?? {},
      channelSizeCross:      chSizeCross,
      channelIndustryCross:  chIndCross,
    });
  }

  return {
    regions: regions.sort((a, b) => b.mrr - a.mrr),
    tamBySector: breakdown?.bySector ?? {},
    tamBySize:   breakdown?.bySize ?? {},
    national: {
      tam:             natTamTotal,
      hubspot:         allResolved.length,
      active:          natActive,
      won:             natWon,
      demos:           natDemos,
      mrr:             natMrr,
      arpu:            natArpu,
      d2w:             natD2w,
      penetration:     natPen,
      partnerMrrShare: natPartnerShare,
    },
  };
}
