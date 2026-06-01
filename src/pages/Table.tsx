import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUp, ArrowDown, ChevronsUpDown, Cloud } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatEUR, regionName, REGIONS, type WonDeal } from "@/lib/csvStore";
import { useDeals } from "@/lib/useDeals";
import { getCountryConfig, applyCountryTheme, type CountryCode } from "@/lib/countryConfig";
import { groupIndustry, industryColorClass } from "@/lib/industryGroups";
import { cn } from "@/lib/utils";

const SEATS_BUCKETS = [
  { label: "All sizes", value: "all", test: () => true },
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

type SortKey = "company" | "sector" | "seats" | "mrr" | "partner" | "plan" | "converted";
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

  const isFrance = country === "fr";

  const [region, setRegion] = useState("all");
  const [sectorFilter, setSectorFilter] = useState("all");
  const [partnerFilter, setPartnerFilter] = useState("all");
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

  const partners = useMemo(() => {
    return Array.from(new Set(deals.map((d) => d.partnerName).filter(Boolean))).sort();
  }, [deals]);

  const quarters = useMemo(() => {
    return Array.from(new Set(deals.map((d) => quarterOf(d.convertedAt)).filter(Boolean))).sort().reverse() as string[];
  }, [deals]);

  const regions = useMemo(() => {
    if (!isFrance) return [];
    return Array.from(new Set(deals.map((d) => d.regionCode).filter((r) => r !== "unknown")))
      .sort((a, b) => regionName(a).localeCompare(regionName(b)));
  }, [deals, isFrance]);

  const seatsBucket = SEATS_BUCKETS.find((b) => b.value === seatsFilter) ?? SEATS_BUCKETS[0];

  const filtered = useMemo(() => {
    return deals.filter((d) => {
      if (region !== "all" && d.regionCode !== region) return false;
      if (sectorFilter !== "all" && groupIndustry(d.sector) !== sectorFilter) return false;
      if (partnerFilter !== "all" && d.partnerName !== partnerFilter) return false;
      if (quarterFilter !== "all" && quarterOf(d.convertedAt) !== quarterFilter) return false;
      if (seatsFilter !== "all" && !seatsBucket.test(d.seats)) return false;
      return true;
    });
  }, [deals, region, sectorFilter, partnerFilter, quarterFilter, seatsFilter, seatsBucket]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const get = (d: WonDeal): string | number | null => {
        switch (sortKey) {
          case "company": return d.companyName.toLowerCase();
          case "sector": return groupIndustry(d.sector).toLowerCase();
          case "seats": return d.seats;
          case "mrr": return d.totalActualMrr;
          case "partner": return (d.partnerName || "").toLowerCase();
          case "plan": return (d.planName || "").toLowerCase();
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
  useEffect(() => { setPage(1); }, [region, sectorFilter, partnerFilter, seatsFilter, quarterFilter, sortKey, sortDir]);
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
        <PageHeader title={`${cfg.flag} Detail`} subtitle="Wons table" />
        <div className="mt-6 flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center">
          <Cloud className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No data. Upload a CSV first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] px-6 py-6 lg:px-8 lg:py-8">
      <PageHeader title={`${cfg.flag} Detail`} subtitle="Wons table" />

      <div className="mt-6 rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-4 border-b border-border px-5 py-4">
          <Stat label="Wons" value={filtered.length.toLocaleString()} />
          <Stat label="MRR" value={formatEUR(filteredMrr)} />
          {filtered.length !== deals.length && (
            <span className="ml-auto text-xs text-muted-foreground">of {deals.length} total</span>
          )}
        </div>

        <div className="border-b border-border bg-muted/30 px-5 py-4">
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
            {isFrance && (
              <FilterSelect label="Region" value={region} onChange={(v) => { setRegion(v); }}>
                <SelectItem value="all">All regions</SelectItem>
                {regions.map((r) => <SelectItem key={r} value={r}>{regionName(r)}</SelectItem>)}
              </FilterSelect>
            )}
            <FilterSelect label="Sector" value={sectorFilter} onChange={setSectorFilter}>
              <SelectItem value="all">All sectors</SelectItem>
              {sectors.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </FilterSelect>
            <FilterSelect label="Partner" value={partnerFilter} onChange={setPartnerFilter}>
              <SelectItem value="all">All partners</SelectItem>
              {partners.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </FilterSelect>
            <FilterSelect label="Seats" value={seatsFilter} onChange={setSeatsFilter}>
              {SEATS_BUCKETS.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
            </FilterSelect>
            <FilterSelect label="Quarter" value={quarterFilter} onChange={setQuarterFilter}>
              <SelectItem value="all">All quarters</SelectItem>
              {quarters.map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}
            </FilterSelect>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <Th sortKey="company" current={sortKey} dir={sortDir} onClick={toggleSort}>Company</Th>
                <Th sortKey="sector" current={sortKey} dir={sortDir} onClick={toggleSort}>Sector</Th>
                <Th sortKey="seats" current={sortKey} dir={sortDir} onClick={toggleSort} align="right">Seats</Th>
                <Th sortKey="mrr" current={sortKey} dir={sortDir} onClick={toggleSort} align="right">MRR</Th>
                <Th sortKey="partner" current={sortKey} dir={sortDir} onClick={toggleSort}>Partner</Th>
                <Th sortKey="plan" current={sortKey} dir={sortDir} onClick={toggleSort}>Plan</Th>
                <Th sortKey="converted" current={sortKey} dir={sortDir} onClick={toggleSort}>Converted</Th>
              </tr>
            </thead>
            <tbody>
              {paged.map((d) => (
                <tr key={d.companyId} className="border-b border-border/60 hover:bg-muted/40">
                  <td className="px-3 py-2 font-medium text-foreground">{d.companyName}</td>
                  <td className="px-3 py-2">
                    <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", industryColorClass(d.sector))}>
                      {groupIndustry(d.sector)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{d.seats || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{formatEUR(d.totalActualMrr)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{d.partnerName || "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">{d.planName || "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">{quarterOf(d.convertedAt) ?? "—"}</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">No deals match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {sorted.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs text-muted-foreground">
            <span className="tabular-nums">{pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, sorted.length)} of {sorted.length}</span>
            <div className="flex items-center gap-1">
              <PagBtn onClick={() => setPage(1)} disabled={page === 1}>« First</PagBtn>
              <PagBtn onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>‹ Prev</PagBtn>
              <span className="px-2 tabular-nums">Page {page} / {pageCount}</span>
              <PagBtn onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount}>Next ›</PagBtn>
              <PagBtn onClick={() => setPage(pageCount)} disabled={page >= pageCount}>Last »</PagBtn>
            </div>
          </div>
        )}
      </div>
    </div>
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
