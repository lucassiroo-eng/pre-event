import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUp, ArrowDown, ChevronsUpDown, Cloud } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatEUR, type WonDeal } from "@/lib/csvStore";
import { regionNameForCountry } from "@/lib/regionNames";
import { useDeals } from "@/lib/useDeals";
import { getCountryConfig, applyCountryTheme, type CountryCode } from "@/lib/countryConfig";
import { groupIndustry, industryColorClass } from "@/lib/industryGroups";
import { getModulesForPlan, getExcluded } from "@/lib/bundleModules";
import { readEnrichmentStore } from "@/lib/enrichmentStore";
import { useHideMrr } from "@/lib/useHideMrr";
import { useT } from "@/lib/i18n";
import { hubspotCompanyUrl } from "@/lib/hubspot";
import { cn } from "@/lib/utils";

const SEATS_BUCKETS = [
  { label: "all", value: "all", test: () => true },
  { label: "1–10", value: "1-10", test: (n: number) => n >= 1 && n <= 10 },
  { label: "11–50", value: "11-50", test: (n: number) => n >= 11 && n <= 50 },
  { label: "51–200", value: "51-200", test: (n: number) => n >= 51 && n <= 200 },
  { label: "201–1000", value: "201-1000", test: (n: number) => n >= 201 && n <= 1000 },
  { label: "1000+", value: "1000+", test: (n: number) => n > 1000 },
];

function quarterOf(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

type SortKey = "company" | "region" | "sector" | "seats" | "mrr" | "converted";
type SortDir = "asc" | "desc";

export function TablePage() {
  const navigate = useNavigate();
  const country = window.localStorage.getItem("pre-event-country") ?? "";
  const cfg = getCountryConfig(country);

  useEffect(() => {
    if (!country) { navigate("/"); return; }
    applyCountryTheme(country as CountryCode);
  }, [country, navigate]);

  const { byCountry } = useDeals();
  const deals = useMemo(() => byCountry(country), [byCountry, country]);
  const hideMrr = useHideMrr();
  const t = useT();
  const enrichment = useMemo(() => readEnrichmentStore(), []);

  // Show the region column/filter for any country that resolves regions.
  const hasRegions = useMemo(() => deals.some((d) => d.regionCode !== "unknown"), [deals]);

  const [region, setRegion] = useState("all");
  const [sectorFilter, setSectorFilter] = useState("all");
  const [seatsFilter, setSeatsFilter] = useState("all");
  const [quarterFilter, setQuarterFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("mrr");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const sectors = useMemo(() => {
    const groups = Array.from(new Set(deals.map((d) => groupIndustry(d.sector))));
    return groups.filter((g) => g !== "Unknown").sort();
  }, [deals]);

  const quarters = useMemo(() => {
    return Array.from(new Set(deals.map((d) => quarterOf(d.convertedAt)).filter(Boolean))).sort().reverse() as string[];
  }, [deals]);

  const regions = useMemo(() => {
    if (!hasRegions) return [];
    return Array.from(new Set(deals.map((d) => d.regionCode).filter((r) => r !== "unknown")))
      .sort((a, b) => regionNameForCountry(country, a).localeCompare(regionNameForCountry(country, b)));
  }, [deals, hasRegions, country]);

  const seatsBucket = SEATS_BUCKETS.find((b) => b.value === seatsFilter) ?? SEATS_BUCKETS[0];

  const filtered = useMemo(() => {
    return deals.filter((d) => {
      if (region !== "all" && d.regionCode !== region) return false;
      if (sectorFilter !== "all" && groupIndustry(d.sector) !== sectorFilter) return false;
      if (quarterFilter !== "all" && quarterOf(d.convertedAt) !== quarterFilter) return false;
      if (seatsFilter !== "all" && !seatsBucket.test(d.seats)) return false;
      return true;
    });
  }, [deals, region, sectorFilter, quarterFilter, seatsFilter, seatsBucket]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const get = (d: WonDeal): string | number | null => {
        switch (sortKey) {
          case "company": return d.companyName.toLowerCase();
          case "region": return regionNameForCountry(country, d.regionCode).toLowerCase();
          case "sector": return groupIndustry(d.sector).toLowerCase();
          case "seats": return d.seats;
          case "mrr": return d.totalActualMrr;
          case "converted": return d.convertedAt ? new Date(d.convertedAt).getTime() : null;
        }
      };
      const va = get(a); const vb = get(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  useEffect(() => { setPage(1); }, [region, sectorFilter, seatsFilter, quarterFilter, sortKey, sortDir]);
  const pageStart = (page - 1) * PAGE_SIZE;
  const paged = sorted.slice(pageStart, pageStart + PAGE_SIZE);
  const filteredMrr = filtered.reduce((acc, d) => acc + d.totalActualMrr, 0);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "mrr" || k === "seats" || k === "converted" ? "desc" : "asc"); }
  };

  if (!country) return null;

  if (deals.length === 0) {
    return (
      <div className="mx-auto max-w-[1500px] px-6 py-6 lg:px-8 lg:py-8">
        <PageHeader title={`${cfg.flag} ${t("table.title")}`} subtitle={t("table.subtitle")} />
        <div className="mt-6 flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center">
          <Cloud className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("table.noData")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] px-6 py-6 lg:px-8 lg:py-8">
      <PageHeader title={`${cfg.flag} ${t("table.title")}`} subtitle={t("table.subtitle")} />

      <div className="mt-6 rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-4 border-b border-border px-5 py-4">
          <Stat label={t("table.wons")} value={filtered.length.toLocaleString()} />
          {!hideMrr && <Stat label="MRR" value={formatEUR(filteredMrr)} />}
          {filtered.length !== deals.length && (
            <span className="ml-auto text-xs text-muted-foreground">{t("table.of")} {deals.length} {t("table.total")}</span>
          )}
        </div>

        <div className="border-b border-border bg-muted/30 px-5 py-4">
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {hasRegions && (
              <FilterSelect label={t("table.region")} value={region} onChange={(v) => { setRegion(v); }}>
                <SelectItem value="all">{t("table.allRegions")}</SelectItem>
                {regions.map((r) => <SelectItem key={r} value={r}>{regionNameForCountry(country, r)}</SelectItem>)}
              </FilterSelect>
            )}
            <FilterSelect label={t("table.sector")} value={sectorFilter} onChange={setSectorFilter}>
              <SelectItem value="all">{t("table.allSectors")}</SelectItem>
              {sectors.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </FilterSelect>
            <FilterSelect label={t("table.seats")} value={seatsFilter} onChange={setSeatsFilter}>
              {SEATS_BUCKETS.map((b) => <SelectItem key={b.value} value={b.value}>{b.value === "all" ? t("table.allSizes") : b.label}</SelectItem>)}
            </FilterSelect>
            <FilterSelect label={t("table.quarter")} value={quarterFilter} onChange={setQuarterFilter}>
              <SelectItem value="all">{t("table.allQuarters")}</SelectItem>
              {quarters.map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}
            </FilterSelect>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <Th sortKey="company" current={sortKey} dir={sortDir} onClick={toggleSort}>{t("table.company")}</Th>
                {hasRegions && <Th sortKey="region" current={sortKey} dir={sortDir} onClick={toggleSort}>{t("table.region")}</Th>}
                <Th sortKey="sector" current={sortKey} dir={sortDir} onClick={toggleSort}>{t("table.sector")}</Th>
                <Th sortKey="seats" current={sortKey} dir={sortDir} onClick={toggleSort} align="right">{t("table.seats")}</Th>
                {!hideMrr && <Th sortKey="mrr" current={sortKey} dir={sortDir} onClick={toggleSort} align="right">MRR</Th>}
                <th className="px-3 py-2.5 font-medium text-left">{t("table.modules")}</th>
                <Th sortKey="converted" current={sortKey} dir={sortDir} onClick={toggleSort}>{t("table.converted")}</Th>
                <th className="px-3 py-2.5 font-medium text-right">{t("table.hubspot")}</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((d) => {
                const enr = enrichment[d.companyId];
                const hsUrl = hubspotCompanyUrl(enr?.hubspotId);
                const nps = enr?.nps;
                return (
                <tr key={d.companyId} className="border-b border-border/60 hover:bg-muted/40">
                  <td className="px-3 py-2 font-medium text-foreground">
                    <span className="inline-flex items-center gap-2">
                      {d.companyName}
                      <NpsBadge nps={nps} />
                    </span>
                  </td>
                  {hasRegions && (
                    <td className="px-3 py-2 text-muted-foreground">
                      {regionNameForCountry(country, d.regionCode)}
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", industryColorClass(d.sector))}>
                      {groupIndustry(d.sector)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{d.seats || "—"}</td>
                  {!hideMrr && <td className="px-3 py-2 text-right tabular-nums font-medium">{formatEUR(d.totalActualMrr)}</td>}
                  <td className="px-3 py-2"><ModuleBubbles plan={d.planName} country={country} /></td>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">{quarterOf(d.convertedAt) ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {hsUrl ? (
                      <a
                        href={hsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Ver en HubSpot"
                        className="inline-grid h-7 w-7 place-items-center rounded-md border border-border bg-background hover:bg-muted transition-colors"
                      >
                        <HubSpotIcon className="h-4 w-4 text-[#FF7A59]" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">{t("table.noMatch")}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {sorted.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs text-muted-foreground">
            <span className="tabular-nums">{pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, sorted.length)} {t("table.of")} {sorted.length}</span>
            <div className="flex items-center gap-1">
              <PagBtn onClick={() => setPage(1)} disabled={page === 1}>{t("table.first")}</PagBtn>
              <PagBtn onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>{t("table.prev")}</PagBtn>
              <span className="px-2 tabular-nums">{t("table.page")} {page} / {pageCount}</span>
              <PagBtn onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount}>{t("table.next")}</PagBtn>
              <PagBtn onClick={() => setPage(pageCount)} disabled={page >= pageCount}>{t("table.last")}</PagBtn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Color the NPS pill by its semantic label so Promoter/Passive/Detractor are
// readable at a glance. Always render the pill so the column has rhythm even
// before the sync populates the field.
function NpsBadge({ nps }: { nps: string | null | undefined }) {
  const label = (nps ?? "").trim();
  const lower = label.toLowerCase();
  let tone =
    "bg-muted text-muted-foreground ring-1 ring-inset ring-border"; // placeholder
  if (lower.includes("promoter") || lower.includes("promotor")) {
    tone = "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/20";
  } else if (lower.includes("passive") || lower.includes("pasivo") || lower.includes("passif") || lower.includes("passivo")) {
    tone = "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-500/20";
  } else if (lower.includes("detractor") || lower.includes("détract")) {
    tone = "bg-rose-500/10 text-rose-700 dark:text-rose-400 ring-1 ring-inset ring-rose-500/20";
  } else if (label) {
    tone = "bg-sky-500/10 text-sky-700 dark:text-sky-400 ring-1 ring-inset ring-sky-500/20";
  }
  return (
    <span
      title={label ? `NPS: ${label}` : "NPS — sin sincronizar"}
      className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", tone)}
    >
      NPS · {label || "—"}
    </span>
  );
}

function ModuleBubbles({ plan, country }: { plan: string; country: string }) {
  const excluded = getExcluded(country);
  const modules = getModulesForPlan(plan).filter((m) => !excluded.has(m));
  if (modules.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {modules.map((m) => (
        <span
          key={m}
          className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
        >
          {m}
        </span>
      ))}
    </div>
  );
}

function HubSpotIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.16 8.27V5.9a1.84 1.84 0 0 0 1.06-1.66v-.05a1.84 1.84 0 0 0-1.84-1.84h-.05a1.84 1.84 0 0 0-1.84 1.84v.05a1.84 1.84 0 0 0 1.06 1.66v2.37a5.2 5.2 0 0 0-2.48 1.09L7.5 5.02a2.08 2.08 0 1 0-1.04 1.37l6.43 4.97a5.22 5.22 0 0 0 .08 5.9l-1.96 1.96a1.7 1.7 0 0 0-.49-.08 1.7 1.7 0 1 0 1.7 1.7c0-.17-.03-.34-.08-.49l1.94-1.94a5.23 5.23 0 1 0 4.08-9.34Zm-1.27 7.86a2.68 2.68 0 1 1 0-5.36 2.68 2.68 0 0 1 0 5.36Z" />
    </svg>
  );
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 bg-background"><SelectValue /></SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function PagBtn({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} className="rounded-md border border-border bg-background px-2 py-1 font-medium text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed">
      {children}
    </button>
  );
}

function Th({ children, sortKey, current, dir, onClick, align = "left" }: {
  children: React.ReactNode; sortKey: SortKey; current: SortKey; dir: SortDir;
  onClick: (k: SortKey) => void; align?: "left" | "right";
}) {
  const active = current === sortKey;
  return (
    <th className={cn("px-3 py-2.5 font-medium", align === "right" ? "text-right" : "text-left")}>
      <button type="button" onClick={() => onClick(sortKey)} className={cn("inline-flex items-center gap-1 hover:text-foreground transition-colors", align === "right" && "flex-row-reverse", active && "text-foreground")}>
        <span>{children}</span>
        {active ? (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  );
}
