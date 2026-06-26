import { supa } from "./cloudStore";

export interface StrategyCompany {
  id: number;
  hubspot_company_id: string;
  product_company_id: string;
  company_name: string;
  stage: string;
  pipeline: string;
  country: string;
  ciudad: string;
  industria: string;
  empresa_size: number;
  provenance: string;
  close_date: string | null;
  after_demo_date: string | null;
  deal_after_demo_date: string | null; // 1=has demo, used for demo_rate
  ciudad_enriched: string | null;
  tipo_empresa: string;
  partner_object_name: string;
  plan: string;
  plan_name: string;
  addons: string;
  item_names: string;
  cmrr: number;
  sub_id_status: string;
  sector: string;
  total_seats: number;
  lead_provenance: string;
  deal_closed_date: string;
  conversion: string; // "converted" | "onboarding" | ""
}

export const STRATEGY_EMAILS = [
  "lucas.siroo@factorial.co",
  "albert.fernandez@factorial.co",
  "marc.macia@factorial.co",
];

export async function fetchStrategyCompanies(): Promise<StrategyCompany[]> {
  if (!supa) return [];
  const all: StrategyCompany[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supa
      .from("strategy_companies")
      .select("*")
      .order("cmrr", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) { console.error("strategy fetch", error); break; }
    if (!data || data.length === 0) break;
    all.push(...(data as StrategyCompany[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

function safeTs(v: string): string | null {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v;
  return null;
}

export async function importStrategyCsv(
  rows: Record<string, string>[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ inserted: number; errors: number }> {
  if (!supa) return { inserted: 0, errors: 0 };

  await supa.from("strategy_companies").delete().neq("id", 0);

  let inserted = 0;
  let errors = 0;
  const BATCH = 500;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map((r) => ({
      hubspot_company_id: r.hubspot_company_id ?? "",
      product_company_id: r.product_company_id ?? "",
      company_name: r.company_name ?? "",
      stage: r.stage ?? "",
      pipeline: r.pipeline ?? "",
      country: r.country ?? "",
      ciudad: r.ciudad ?? "",
      industria: r.industria ?? "",
      empresa_size: parseInt(r.empresa_size ?? "0", 10) || 0,
      provenance: r.provenance ?? "",
      close_date: safeTs(r.close_date ?? r.hs_close_date ?? ""),
      after_demo_date: safeTs(r.after_demo_date ?? ""),
      deal_after_demo_date: safeTs(r.deal_after_demo_date ?? ""),
      tipo_empresa: r.tipo_empresa ?? "",
      partner_object_name: r.partner_object_name ?? r.deal_partner_name ?? "",
      plan: r.plan ?? "",
      plan_name: r.plan_name ?? "",
      addons: r.addons ?? "",
      item_names: r.item_names ?? "",
      cmrr: parseFloat(r.cmrr ?? "0") || 0,
      sub_id_status: r.sub_id_status ?? "",
      sector: r.sector ?? "",
      total_seats: parseInt(r.total_seats ?? "0", 10) || 0,
      lead_provenance: r.lead_provenance ?? r.finance_lead_provenance ?? "",
      deal_closed_date: r.deal_closed_date ?? r.finance_deal_closed_date ?? "",
      conversion: (r.conversion ?? r["conversion\r"] ?? "").trim(),
    }));

    const { error } = await supa.from("strategy_companies").insert(batch);
    if (error) {
      console.error("strategy batch insert", error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
    }
    onProgress?.(i + batch.length, rows.length);
  }

  return { inserted, errors };
}

// --- Pivot ---

// demo_rate  = rows with deal_after_demo_date / total  (× 100 → %)
// conv_rate  = rows with conversion="converted"|"onboarding" / total (× 100 → %)
export type PivotAgg = "count" | "sum_cmrr" | "avg_seats" | "sum_seats" | "demo_rate" | "conv_rate";

export function pivotData(
  rows: StrategyCompany[],
  rowKey: keyof StrategyCompany,
  colKey: keyof StrategyCompany,
  agg: PivotAgg,
): { rowLabels: string[]; colLabels: string[]; cells: number[][] } {
  const rowSet = new Map<string, number>();
  const colSet = new Map<string, number>();

  for (const r of rows) {
    const rv = String(r[rowKey] || "—");
    const cv = String(r[colKey] || "—");
    if (!rowSet.has(rv)) rowSet.set(rv, rowSet.size);
    if (!colSet.has(cv)) colSet.set(cv, colSet.size);
  }

  const rowLabels = Array.from(rowSet.keys());
  const colLabels = Array.from(colSet.keys());
  const cells: number[][] = rowLabels.map(() => colLabels.map(() => 0));
  const counts: number[][] = rowLabels.map(() => colLabels.map(() => 0));

  for (const r of rows) {
    const ri = rowSet.get(String(r[rowKey] || "—"))!;
    const ci = colSet.get(String(r[colKey] || "—"))!;
    counts[ri][ci]++;
    switch (agg) {
      case "count":
        cells[ri][ci]++;
        break;
      case "sum_cmrr":
        cells[ri][ci] += r.cmrr || 0;
        break;
      case "sum_seats":
        cells[ri][ci] += r.total_seats || 0;
        break;
      case "avg_seats":
        cells[ri][ci] += r.total_seats || 0;
        break;
      case "demo_rate":
        if (r.deal_after_demo_date) cells[ri][ci]++;
        break;
      case "conv_rate":
        if (r.conversion === "converted" || r.conversion === "onboarding") cells[ri][ci]++;
        break;
    }
  }

  // avg_seats: divide by count
  if (agg === "avg_seats") {
    for (let ri = 0; ri < rowLabels.length; ri++)
      for (let ci = 0; ci < colLabels.length; ci++)
        cells[ri][ci] = counts[ri][ci] > 0 ? Math.round(cells[ri][ci] / counts[ri][ci]) : 0;
  }

  // demo_rate / conv_rate: express as % of total in that cell
  if (agg === "demo_rate" || agg === "conv_rate") {
    for (let ri = 0; ri < rowLabels.length; ri++)
      for (let ci = 0; ci < colLabels.length; ci++)
        cells[ri][ci] = counts[ri][ci] > 0
          ? Math.round((cells[ri][ci] / counts[ri][ci]) * 100)
          : 0;
  }

  return { rowLabels, colLabels, cells };
}
