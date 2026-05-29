import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Cloud, ExternalLink, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";

import { REGIONS, formatEUR } from "@/data/mockData";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useSync } from "@/lib/useSync";
import { groupIndustry, industryColorClass } from "@/lib/industryGroups";
import type { SyncResult, HubspotWonDeal } from "@/lib/hubspot.functions";
import hubspotIcon from "@/assets/hubspot.png";

export const Route = createFileRoute("/table")({
  component: TablePage,
});

const REGION_NAME: Record<string, string> = Object.fromEntries(
  REGIONS.map((r) => [r.code, r.name]),
);
REGION_NAME["unknown"] = "Unknown";

const EMPLOYEE_BUCKETS: { label: string; value: string; test: (n: number | null) => boolean }[] = [
  { label: "All sizes", value: "all", test: () => true },
  { label: "Unknown", value: "unknown", test: (n) => n == null },
  { label: "1–10", value: "1-10", test: (n) => n != null && n >= 1 && n <= 10 },
  { label: "11–50", value: "11-50", test: (n) => n != null && n >= 11 && n <= 50 },
  { label: "51–200", value: "51-200", test: (n) => n != null && n >= 51 && n <= 200 },
  { label: "201–1000", value: "201-1000", test: (n) => n != null && n >= 201 && n <= 1000 },
  { label: "1000+", value: "1000+", test: (n) => n != null && n > 1000 },
];

function quarterOf(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

function hubspotDealUrl(portalId: number | null, dealId: string): string {
  if (portalId) return `https://app.hubspot.com/contacts/${portalId}/deal/${dealId}`;
  return `https://app.hubspot.com/contacts/0/record/0-3/${dealId}`;
}

function sortedRegionsFromData(deals: HubspotWonDeal[]): string[] {
  const set = new Set(deals.map((d) => d.regionCode));
  const known = Array.from(set).filter((r) => r !== "unknown")
    .sort((a, b) => (REGION_NAME[a] ?? a).localeCompare(REGION_NAME[b] ?? b));
  return set.has("unknown") ? [...known, "unknown"] : known;
}

type SortKey = "company" | "city" | "region" | "pipeline" | "industry" | "employees" | "mrr" | "closed";
type SortDir = "asc" | "desc";

type DealKind = "wons" | "demos";

function TablePage() {
  const { sync, mutation } = useSync();
  const [kind, setKind] = useState<DealKind>("wons");

  const filteredSync = useMemo<SyncResult | null>(() => {
    if (!sync) return null;
    const deals = sync.deals.filter((d) =>
      kind === "wons" ? d.isWon : !!d.dateEnteredDemoStage,
    );
    return { ...sync, deals, totalDeals: deals.length };
  }, [sync, kind]);

  return (
    <div className="mx-auto max-w-[1500px] px-6 py-6 lg:px-8 lg:py-8">
      <PageHeader
        title="Deals Table"
        subtitle="Deals from HubSpot · France"
      />

      <div className="mt-6">
        <DealsTable
          sync={filteredSync}
          loading={mutation.isPending}
          kind={kind}
          onKindChange={setKind}
          totalWons={sync?.totalWons ?? 0}
          totalDemos={sync?.totalDemos ?? 0}
        />
      </div>
    </div>
  );
}

function DealsTable({
  sync, loading, kind, onKindChange, totalWons, totalDemos,
}: {
  sync: SyncResult | null;
  loading: boolean;
  kind: DealKind;
  onKindChange: (k: DealKind) => void;
  totalWons: number;
  totalDemos: number;
}) {
  const [region, setRegion] = useState<string>("all");
  const [city, setCity] = useState<string>("all");
  const [pipeline, setPipeline] = useState<string>("all");
  const [industryGroup, setIndustryGroup] = useState<string>("all");
  const [employees, setEmployees] = useState<string>("all");
  const [quarter, setQuarter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("closed");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const deals: HubspotWonDeal[] = sync?.deals ?? [];

  const regionsInData = useMemo(() => sortedRegionsFromData(deals), [deals]);
  const cities = useMemo(() => {
    const scope = region === "all" ? deals : deals.filter((d) => d.regionCode === region);
    return Array.from(new Set(scope.map((d) => d.city).filter(Boolean) as string[]))
      .sort((a, b) => a.localeCompare(b));
  }, [deals, region]);
  const pipelines = useMemo(
    () => Array.from(new Set(deals.map((d) => d.pipeline).filter(Boolean))).sort() as string[],
    [deals],
  );
  const industryGroups = useMemo(() => {
    const groups = Array.from(new Set(deals.map((d) => groupIndustry(d.industry))));
    const known = groups.filter((g) => g !== "Unknown" && g !== "Other").sort();
    const tail: string[] = [];
    if (groups.includes("Other")) tail.push("Other");
    if (groups.includes("Unknown")) tail.push("Unknown");
    return [...known, ...tail];
  }, [deals]);
  const quarters = useMemo(
    () =>
      Array.from(new Set(deals.map((d) => quarterOf(d.closedate)).filter(Boolean)))
        .sort()
        .reverse() as string[],
    [deals],
  );

  const employeeBucket = EMPLOYEE_BUCKETS.find((b) => b.value === employees) ?? EMPLOYEE_BUCKETS[0];

  // Predicate honoring every filter except those in `skip` — used to compute
  // dropdown counts that stay in sync with the other active filters.
  const matches = (
    d: HubspotWonDeal,
    skip: { region?: boolean; city?: boolean; pipeline?: boolean; industry?: boolean; employees?: boolean; quarter?: boolean } = {},
  ) => {
    if (!skip.region && region !== "all" && d.regionCode !== region) return false;
    if (!skip.city && city !== "all" && (d.city ?? "") !== city) return false;
    if (!skip.pipeline && pipeline !== "all" && (d.pipeline ?? "") !== pipeline) return false;
    if (!skip.industry && industryGroup !== "all" && groupIndustry(d.industry) !== industryGroup) return false;
    if (!skip.quarter && quarter !== "all" && quarterOf(d.closedate) !== quarter) return false;
    if (!skip.employees && !employeeBucket.test(d.numEmployees)) return false;
    return true;
  };

  const countBy = <T extends string>(
    skip: Parameters<typeof matches>[1],
    key: (d: HubspotWonDeal) => T | null | undefined,
  ): Map<T, number> => {
    const m = new Map<T, number>();
    for (const d of deals) {
      if (!matches(d, skip)) continue;
      const k = key(d);
      if (k == null) continue;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };

  const regionCounts = useMemo(
    () => countBy<string>({ region: true }, (d) => d.regionCode as string),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deals, city, pipeline, industryGroup, employees, quarter],
  );
  const cityCounts = useMemo(
    () => countBy<string>({ city: true }, (d) => d.city),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deals, region, pipeline, industryGroup, employees, quarter],
  );
  const pipelineCounts = useMemo(
    () => countBy<string>({ pipeline: true }, (d) => d.pipeline),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deals, region, city, industryGroup, employees, quarter],
  );
  const industryCounts = useMemo(
    () => countBy<string>({ industry: true }, (d) => groupIndustry(d.industry)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deals, region, city, pipeline, employees, quarter],
  );
  const quarterCounts = useMemo(
    () => countBy<string>({ quarter: true }, (d) => quarterOf(d.closedate)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deals, region, city, pipeline, industryGroup, employees],
  );
  const employeeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of deals) {
      if (!matches(d, { employees: true })) continue;
      for (const b of EMPLOYEE_BUCKETS) {
        if (b.value === "all") continue;
        if (b.test(d.numEmployees)) { m.set(b.value, (m.get(b.value) ?? 0) + 1); break; }
      }
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals, region, city, pipeline, industryGroup, quarter]);

  const filtered = useMemo(
    () => deals.filter((d) => matches(d)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deals, region, city, pipeline, industryGroup, employees, quarter],
  );

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    const cmp = (a: HubspotWonDeal, b: HubspotWonDeal): number => {
      // Always push rows without city to the bottom
      const aNoCity = !a.city;
      const bNoCity = !b.city;
      if (aNoCity !== bNoCity) return aNoCity ? 1 : -1;
      const get = (d: HubspotWonDeal): string | number | null => {
        switch (sortKey) {
          case "company": return (d.companyName ?? d.dealname ?? "").toLowerCase();
          case "city": return (d.city ?? "").toLowerCase();
          case "region": return (REGION_NAME[d.regionCode] ?? "").toLowerCase();
          case "pipeline": return (d.pipeline ?? "").toLowerCase();
          case "industry": return (d.industry ?? "").toLowerCase();
          case "employees": return d.numEmployees;
          case "mrr": return d.mrr;
          case "closed": return d.closedate ? new Date(d.closedate).getTime() : null;
        }
      };
      const va = get(a); const vb = get(b);
      // nulls last regardless of dir
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    };
    arr.sort(cmp);
    return arr;
  }, [filtered, sortKey, sortDir]);

  const filteredMrr = useMemo(
    () => filtered.reduce((acc, d) => acc + (d.mrr ?? 0), 0),
    [filtered],
  );

  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  useEffect(() => { setPage(1); }, [region, city, pipeline, industryGroup, employees, quarter, sortKey, sortDir]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);
  const pageStart = (page - 1) * PAGE_SIZE;
  const paged = useMemo(() => sorted.slice(pageStart, pageStart + PAGE_SIZE), [sorted, pageStart]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "closed" || k === "mrr" || k === "employees" ? "desc" : "asc");
    }
  };

  const resetFilters = () => {
    setRegion("all"); setCity("all"); setPipeline("all");
    setIndustryGroup("all"); setEmployees("all"); setQuarter("all");
  };
  const hasActiveFilters =
    region !== "all" || city !== "all" || pipeline !== "all" ||
    industryGroup !== "all" || employees !== "all" || quarter !== "all";

  if (!sync) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-accent/30 text-foreground">
          <Cloud className="h-5 w-5" />
        </div>
        <h3 className="text-base font-semibold">No data yet</h3>
        <p className="max-w-sm text-sm text-muted-foreground">
          {loading
            ? "Syncing Closed-Won deals from HubSpot…"
            : "Click \"Sync Closed-Won from HubSpot\" above to load Closed-Won deals in France."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      {/* Live KPI strip — reflects current filters */}
      <div className="flex flex-wrap items-center gap-4 border-b border-border px-5 py-4">
        <Stat label={kind === "wons" ? "Wons" : "Demos"} value={filtered.length.toLocaleString()} tone="primary" />
        <Stat label="MRR" value={formatEUR(filteredMrr)} tone="accent" />
        <div className="ml-auto inline-flex rounded-lg border border-border bg-background p-1 shadow-sm">
          {(["wons", "demos"] as const).map((k) => (
            <button
              key={k}
              onClick={() => onKindChange(k)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                kind === k
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {k === "wons" ? `Wons (${totalWons})` : `Demos (${totalDemos})`}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          {hasActiveFilters && (
            <>
              <span>of {sync.totalDeals.toLocaleString()} total</span>
              <button
                onClick={resetFilters}
                className="rounded-md border border-border bg-background px-2.5 py-1 font-medium text-foreground hover:bg-muted"
              >
                Clear filters
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="border-b border-border bg-muted/30 px-5 py-4">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
          <FilterField label="Region">
            <Select value={region} onValueChange={(v) => { setRegion(v); setCity("all"); }}>
              <SelectTrigger className="h-9 bg-background"><SelectValue placeholder="Region" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All regions</SelectItem>
                {regionsInData.map((r) => (
                  <SelectItem key={r} value={r}>
                    {REGION_NAME[r] ?? r} ({regionCounts.get(r) ?? 0})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="City">
            <Select value={city} onValueChange={setCity}>
              <SelectTrigger className="h-9 bg-background"><SelectValue placeholder="City" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cities</SelectItem>
                {cities.map((c) => (
                  <SelectItem key={c} value={c}>{c} ({cityCounts.get(c) ?? 0})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Pipeline">
            <Select value={pipeline} onValueChange={setPipeline}>
              <SelectTrigger className="h-9 bg-background"><SelectValue placeholder="Pipeline" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All pipelines</SelectItem>
                {pipelines.map((p) => (
                  <SelectItem key={p} value={p}>{p} ({pipelineCounts.get(p) ?? 0})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Industry">
            <Select value={industryGroup} onValueChange={setIndustryGroup}>
              <SelectTrigger className="h-9 bg-background"><SelectValue placeholder="Industry" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All industries</SelectItem>
                {industryGroups.map((i) => (
                  <SelectItem key={i} value={i}>{i} ({industryCounts.get(i) ?? 0})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Employees">
            <Select value={employees} onValueChange={setEmployees}>
              <SelectTrigger className="h-9 bg-background"><SelectValue placeholder="Employees" /></SelectTrigger>
              <SelectContent>
                {EMPLOYEE_BUCKETS.map((b) => (
                  <SelectItem key={b.value} value={b.value}>
                    {b.label}{b.value === "all" ? "" : ` (${employeeCounts.get(b.value) ?? 0})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Quarter">
            <Select value={quarter} onValueChange={setQuarter}>
              <SelectTrigger className="h-9 bg-background"><SelectValue placeholder="Quarter" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All quarters</SelectItem>
                {quarters.map((q) => (
                  <SelectItem key={q} value={q}>{q} ({quarterCounts.get(q) ?? 0})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "22%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "7%" }} />
          </colgroup>
          <thead className="bg-muted/40">
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <Th sortKey="company" current={sortKey} dir={sortDir} onClick={toggleSort}>Company</Th>
              <Th sortKey="city" current={sortKey} dir={sortDir} onClick={toggleSort}>City</Th>
              <Th sortKey="region" current={sortKey} dir={sortDir} onClick={toggleSort}>Region</Th>
              <Th sortKey="pipeline" current={sortKey} dir={sortDir} onClick={toggleSort}>Pipeline</Th>
              <Th sortKey="industry" current={sortKey} dir={sortDir} onClick={toggleSort}>Industry</Th>
              <Th sortKey="employees" current={sortKey} dir={sortDir} onClick={toggleSort} align="right">Empl.</Th>
              <Th sortKey="mrr" current={sortKey} dir={sortDir} onClick={toggleSort} align="right">MRR</Th>
              <Th sortKey="closed" current={sortKey} dir={sortDir} onClick={toggleSort}>Closed</Th>
            </tr>
          </thead>
          <tbody>
            {paged.map((d) => (
              <tr key={d.dealId} className="border-b border-border/60 hover:bg-muted/40">
                <td className="px-3 py-2 font-medium text-foreground">
                  <a
                    href={hubspotDealUrl(sync.portalId, d.dealId)}
                    target="_blank"
                    rel="noreferrer"
                    className="group inline-flex max-w-full items-center gap-1.5 hover:text-primary"
                    title={d.companyName ?? d.dealname}
                  >
                    <img src={hubspotIcon} alt="" className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate underline-offset-2 group-hover:underline">
                      {d.companyName ?? d.dealname}
                    </span>
                    <ExternalLink className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                  </a>
                </td>
                <td className="truncate px-3 py-2 text-muted-foreground" title={d.city ?? ""}>{d.city ?? "—"}</td>
                <td className={cn(
                  "truncate px-3 py-2",
                  d.regionCode === "unknown" ? "text-muted-foreground" : "text-foreground/90",
                )} title={REGION_NAME[d.regionCode] ?? d.regionCode}>
                  {REGION_NAME[d.regionCode] ?? d.regionCode}
                </td>
                <td className="truncate px-3 py-2 text-muted-foreground" title={d.pipeline ?? ""}>{d.pipeline ?? "—"}</td>
                <td className="px-3 py-2">
                  {(() => {
                    const g = groupIndustry(d.industry);
                    return (
                      <span
                        className={`inline-block max-w-full truncate rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${industryColorClass(d.industry)}`}
                        title={d.industry ? `${d.industry} · ${g}` : g}
                      >
                        {g}
                      </span>
                    );
                  })()}
                </td>
                <td className="px-3 py-2 text-right text-foreground/90 tabular-nums">
                  {d.numEmployees ?? "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">
                  {d.mrr != null ? formatEUR(d.mrr) : "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground tabular-nums">
                  {quarterOf(d.closedate) ?? "—"}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No deals match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {sorted.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {(pageStart + 1).toLocaleString()}–{Math.min(pageStart + PAGE_SIZE, sorted.length).toLocaleString()} of {sorted.length.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="rounded-md border border-border bg-background px-2 py-1 font-medium text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            >« First</button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-md border border-border bg-background px-2 py-1 font-medium text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            >‹ Prev</button>
            <span className="px-2 tabular-nums">Page {page} / {pageCount}</span>
            <button
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={page >= pageCount}
              className="rounded-md border border-border bg-background px-2 py-1 font-medium text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            >Next ›</button>
            <button
              onClick={() => setPage(pageCount)}
              disabled={page >= pageCount}
              className="rounded-md border border-border bg-background px-2 py-1 font-medium text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            >Last »</button>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "primary" | "accent" | "success" | "muted" }) {
  const toneClass = {
    primary: "text-primary",
    accent: "text-foreground",
    success: "text-success",
    muted: "text-muted-foreground",
  }[tone];
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={cn("text-lg font-semibold tabular-nums", toneClass)}>{value}</span>
    </div>
  );
}

function Th({
  children, sortKey, current, dir, onClick, align = "left",
}: {
  children: React.ReactNode;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onClick: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = current === sortKey;
  return (
    <th className={cn("px-3 py-2.5 font-medium", align === "right" ? "text-right" : "text-left")}>
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground transition-colors",
          align === "right" && "flex-row-reverse",
          active && "text-foreground",
        )}
      >
        <span>{children}</span>
        {active
          ? (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
          : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  );
}
