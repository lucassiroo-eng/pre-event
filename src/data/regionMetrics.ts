import {
  DEALS, REGIONS, ICP_SEGMENTS, type Deal, type RegionCode,
  isClosedWon, isDemoBooked, isDemoHeld, dealsByRegion, regionName,
} from "./mockData";

export type MapMetric = "demosBooked" | "dealsClosed" | "mrr";

export interface RegionStats {
  code: RegionCode;
  name: string;
  demosBooked: number;
  demosHeld: number;
  dealsClosed: number;
  mrr: number;
  pipeline: number;
  conversion: number; // demos -> closed won
  partnerDeals: number;
  topVertical?: string;
  topPartner?: string;
}

function topBy<T>(arr: T[], key: (t: T) => string | undefined): string | undefined {
  const counts = new Map<string, number>();
  for (const a of arr) {
    const k = key(a);
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let best: string | undefined; let bestN = 0;
  for (const [k, n] of counts) if (n > bestN) { best = k; bestN = n; }
  return best;
}

export function computeRegionStats(code: RegionCode): RegionStats {
  const d = dealsByRegion(code);
  const closed = d.filter(isClosedWon);
  const demos = d.filter(isDemoBooked);
  return {
    code,
    name: regionName(code),
    demosBooked: demos.length,
    demosHeld: d.filter(isDemoHeld).length,
    dealsClosed: closed.length,
    mrr: closed.reduce((s, x) => s + x.mrr, 0),
    pipeline: d.filter(x => x.stage !== "Closed Won" && x.stage !== "Closed Lost").reduce((s, x) => s + x.amount, 0),
    conversion: demos.length ? closed.length / demos.length : 0,
    partnerDeals: d.filter(x => !!x.partner).length,
    topVertical: topBy(closed.length ? closed : d, x => x.vertical),
    topPartner: topBy(d, x => x.partner),
  };
}

export const ALL_REGION_STATS: RegionStats[] = REGIONS.map(r => computeRegionStats(r.code));

export function metricValue(s: RegionStats, m: MapMetric): number {
  switch (m) {
    case "demosBooked": return s.demosBooked;
    case "dealsClosed": return s.dealsClosed;
    case "mrr": return s.mrr;
  }
}

export const METRIC_LABEL: Record<MapMetric, string> = {
  demosBooked: "Demos booked",
  dealsClosed: "Deals closed",
  mrr: "MRR generated",
};

// Global KPIs
export function globalKpis() {
  const closed = DEALS.filter(isClosedWon);
  const demos = DEALS.filter(isDemoBooked);
  const held = DEALS.filter(isDemoHeld);
  const totalMrr = closed.reduce((s, x) => s + x.mrr, 0);
  const arpu = closed.length ? totalMrr / closed.length : 0;
  const pipeline30 = DEALS
    .filter(d => Date.now() - new Date(d.createdAt).getTime() < 30 * 86400000)
    .reduce((s, x) => s + x.amount, 0);
  const bestRegion = [...ALL_REGION_STATS].sort((a, b) => b.mrr - a.mrr)[0];
  const bestVertical = topBy(closed, x => x.vertical) ?? "—";
  const bestPartner = topBy(closed, x => x.partner) ?? "—";
  const activePartners = new Set(DEALS.map(d => d.partner).filter(Boolean)).size;

  return {
    demosBooked: demos.length,
    demosHeld: held.length,
    conversion: demos.length ? closed.length / demos.length : 0,
    dealsClosed: closed.length,
    totalMrr,
    arpu,
    bestRegion: bestRegion?.name ?? "—",
    bestVertical,
    bestPartner,
    activePartners,
    pipeline30,
  };
}

// Last N deals filtered
export function lastDemosBooked(deals: Deal[], n = 3) {
  return deals
    .filter(d => d.demoBookedAt)
    .sort((a, b) => +new Date(b.demoBookedAt!) - +new Date(a.demoBookedAt!))
    .slice(0, n);
}
export function lastDemosHeld(deals: Deal[], n = 3) {
  return deals
    .filter(d => d.demoHeldAt)
    .sort((a, b) => +new Date(b.demoHeldAt!) - +new Date(a.demoHeldAt!))
    .slice(0, n);
}
export function lastClosedDeals(deals: Deal[], n = 3) {
  return deals
    .filter(isClosedWon)
    .sort((a, b) => +new Date(b.closedAt!) - +new Date(a.closedAt!))
    .slice(0, n);
}
export function topClosedDeals(deals: Deal[], months = 6, n = 3) {
  const cutoff = Date.now() - months * 30 * 86400000;
  return deals
    .filter(d => isClosedWon(d) && d.closedAt && +new Date(d.closedAt) >= cutoff)
    .sort((a, b) => b.mrr - a.mrr)
    .slice(0, n);
}

export function topVerticalsInRegion(code: RegionCode, n = 3) {
  const d = dealsByRegion(code);
  const closed = d.filter(isClosedWon);
  const map = new Map<string, { volume: number; mrr: number; demos: number }>();
  for (const deal of d) {
    const k = deal.vertical;
    const cur = map.get(k) ?? { volume: 0, mrr: 0, demos: 0 };
    if (isClosedWon(deal)) { cur.volume++; cur.mrr += deal.mrr; }
    if (isDemoBooked(deal)) cur.demos++;
    map.set(k, cur);
  }
  return Array.from(map.entries())
    .map(([vertical, v]) => ({
      vertical,
      ...v,
      conversion: v.demos ? v.volume / v.demos : 0,
    }))
    .sort((a, b) => b.volume - a.volume || b.mrr - a.mrr)
    .slice(0, n);
  void closed;
}

export function topIcpInRegion(code: RegionCode, n = 3) {
  const d = dealsByRegion(code);
  const map = new Map<string, { matching: number; demos: number; closed: number; mrr: number }>();
  for (const deal of d) {
    const cur = map.get(deal.icpId) ?? { matching: 0, demos: 0, closed: 0, mrr: 0 };
    cur.matching++;
    if (isDemoBooked(deal)) cur.demos++;
    if (isClosedWon(deal)) { cur.closed++; cur.mrr += deal.mrr; }
    map.set(deal.icpId, cur);
  }
  return Array.from(map.entries())
    .map(([icpId, v]) => ({
      icpId,
      label: ICP_SEGMENTS.find(i => i.id === icpId)?.label ?? icpId,
      ...v,
      conversion: v.demos ? v.closed / v.demos : 0,
      avgMrr: v.closed ? v.mrr / v.closed : 0,
    }))
    .sort((a, b) => b.closed - a.closed || b.mrr - a.mrr)
    .slice(0, n);
}

export function topPartnersInRegion(code: RegionCode, n = 3) {
  const d = dealsByRegion(code).filter(x => x.partner);
  const map = new Map<string, { demos: number; closed: number; mrr: number }>();
  for (const deal of d) {
    const k = deal.partner!;
    const cur = map.get(k) ?? { demos: 0, closed: 0, mrr: 0 };
    if (isDemoBooked(deal)) cur.demos++;
    if (isClosedWon(deal)) { cur.closed++; cur.mrr += deal.mrr; }
    map.set(k, cur);
  }
  return Array.from(map.entries())
    .map(([partner, v]) => ({ partner, ...v }))
    .sort((a, b) => b.closed - a.closed || b.demos - a.demos)
    .slice(0, n);
}

export function blitzRecommendations(code: RegionCode): string[] {
  const s = computeRegionStats(code);
  const verticals = topVerticalsInRegion(code, 2).map(v => v.vertical);
  const icp = topIcpInRegion(code, 1)[0];
  const recs: string[] = [];

  if (verticals.length) {
    recs.push(`Best-performing verticals: ${verticals.join(" & ")}. Prioritize these in the next Blitz Day.`);
  }
  if (s.conversion < 0.12 && s.demosBooked > 10) {
    recs.push(`High demo volume but low close rate (${(s.conversion * 100).toFixed(0)}%). Improve qualification before booking demos.`);
  } else if (s.conversion > 0.2) {
    recs.push(`Strong conversion rate (${(s.conversion * 100).toFixed(0)}%) — push more top-of-funnel volume.`);
  }
  if (icp) {
    recs.push(`${icp.label} converts best — focus ICP targeting around this segment (avg MRR ${Math.round(icp.avgMrr)} €).`);
  }
  if (s.partnerDeals < 8) {
    recs.push(`Low partner activity in ${s.name}. Activate new partners or run a dedicated enablement session.`);
  }
  const target = Math.max(5, Math.round(s.demosBooked * 0.15));
  recs.push(`Recommended Blitz Day target: ${target} qualified demos booked.`);
  return recs;
}
