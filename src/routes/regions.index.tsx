import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { ALL_REGION_STATS } from "@/data/regionMetrics";
import { formatEUR } from "@/data/mockData";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/regions/")({
  component: RegionsPage,
});

function RegionsPage() {
  const rows = [...ALL_REGION_STATS].sort((a, b) => b.mrr - a.mrr);
  return (
    <div className="mx-auto max-w-[1300px] px-6 py-6 lg:px-8 lg:py-8">
      <PageHeader title="Regions" subtitle="All 13 French regions, ranked by performance." />
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Region</th>
              <th className="px-4 py-3 text-right">Demos</th>
              <th className="px-4 py-3 text-right">Held</th>
              <th className="px-4 py-3 text-right">Closed</th>
              <th className="px-4 py-3 text-right">Conv.</th>
              <th className="px-4 py-3 text-right">MRR</th>
              <th className="px-4 py-3 text-right">Pipeline</th>
              <th className="px-4 py-3 text-left">Top vertical</th>
              <th className="px-4 py-3 text-left">Top partner</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(r => (
              <tr key={r.code} className="hover:bg-muted/40">
                <td className="px-4 py-3 font-medium text-foreground">{r.name}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.demosBooked}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.demosHeld}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.dealsClosed}</td>
                <td className="px-4 py-3 text-right tabular-nums">{(r.conversion * 100).toFixed(0)}%</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatEUR(r.mrr)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatEUR(r.pipeline)}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.topVertical ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.topPartner ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    to="/regions/$code" params={{ code: r.code }}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                  >
                    Open <ArrowRight className="h-3 w-3" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
