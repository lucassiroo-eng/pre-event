import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { DEALS, PARTNERS, formatEUR, isClosedWon, isDemoBooked } from "@/data/mockData";

export const Route = createFileRoute("/partners")({
  component: PartnersPage,
});

interface Row {
  partner: string;
  deals: number;
  demos: number;
  closed: number;
  mrr: number;
  conv: number;
}

function PartnersPage() {
  const rows: Row[] = PARTNERS.map(p => {
    const list = DEALS.filter(d => d.partner === p);
    const demos = list.filter(isDemoBooked).length;
    const closed = list.filter(isClosedWon);
    return {
      partner: p,
      deals: list.length,
      demos,
      closed: closed.length,
      mrr: closed.reduce((s, x) => s + x.mrr, 0),
      conv: demos ? closed.length / demos : 0,
    };
  }).sort((a, b) => b.mrr - a.mrr);

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6 lg:px-8 lg:py-8">
      <PageHeader title="Partner performance" subtitle="Ranking of active partners by closed-won MRR." />
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">#</th>
              <th className="px-4 py-3 text-left">Partner</th>
              <th className="px-4 py-3 text-right">Deals</th>
              <th className="px-4 py-3 text-right">Demos</th>
              <th className="px-4 py-3 text-right">Closed</th>
              <th className="px-4 py-3 text-right">Conv.</th>
              <th className="px-4 py-3 text-right">MRR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => (
              <tr key={r.partner} className="hover:bg-muted/40">
                <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                <td className="px-4 py-3 font-medium">{r.partner}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.deals}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.demos}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.closed}</td>
                <td className="px-4 py-3 text-right tabular-nums">{(r.conv * 100).toFixed(0)}%</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatEUR(r.mrr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
