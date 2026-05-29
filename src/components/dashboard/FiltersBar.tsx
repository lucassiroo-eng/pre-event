import { REGIONS, OWNERS, PARTNERS, VERTICALS, DEAL_STAGES } from "@/data/mockData";
import { Filter } from "lucide-react";

const SELECTS = [
  { label: "Region", options: ["All regions", ...REGIONS.map(r => r.name)] },
  { label: "Deal owner", options: ["All owners", ...OWNERS] },
  { label: "Partner", options: ["All partners", ...PARTNERS] },
  { label: "Vertical", options: ["All verticals", ...VERTICALS] },
  { label: "Company size", options: ["Any size", "50–200", "100–500", "200–1000", "1000+"] },
  { label: "Deal stage", options: ["All stages", ...DEAL_STAGES] },
  { label: "Source", options: ["All sources", "Partner", "Outbound", "Inbound", "Event", "Referral"] },
  { label: "Blitz Day", options: ["All campaigns", "Blitz Q1 2026", "Blitz Q2 2026", "Blitz Q3 2026"] },
];

export function FiltersBar() {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
        <Filter className="h-3.5 w-3.5" />
        Filters
        <span className="ml-auto text-[11px]">Last 90 days</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
        {SELECTS.map(s => (
          <label key={s.label} className="block">
            <span className="sr-only">{s.label}</span>
            <select
              defaultValue={s.options[0]}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {s.options.map(o => <option key={o}>{o}</option>)}
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}
