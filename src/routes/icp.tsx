import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  DEALS, ICP_SEGMENTS, VERTICALS, formatEUR, isClosedWon, isDemoBooked,
} from "@/data/mockData";

export const Route = createFileRoute("/icp")({
  component: IcpPage,
});

function IcpPage() {
  const icpRows = ICP_SEGMENTS.map(i => {
    const list = DEALS.filter(d => d.icpId === i.id);
    const demos = list.filter(isDemoBooked).length;
    const closed = list.filter(isClosedWon);
    return {
      label: i.label,
      matching: list.length,
      demos,
      closed: closed.length,
      mrr: closed.reduce((s, x) => s + x.mrr, 0),
      conv: demos ? closed.length / demos : 0,
      avgMrr: closed.length ? closed.reduce((s, x) => s + x.mrr, 0) / closed.length : 0,
    };
  }).sort((a, b) => b.mrr - a.mrr);

  const vertRows = VERTICALS.map(v => {
    const list = DEALS.filter(d => d.vertical === v);
    const demos = list.filter(isDemoBooked).length;
    const closed = list.filter(isClosedWon);
    return {
      vertical: v,
      demos,
      closed: closed.length,
      mrr: closed.reduce((s, x) => s + x.mrr, 0),
      conv: demos ? closed.length / demos : 0,
    };
  }).sort((a, b) => b.mrr - a.mrr);

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6 lg:px-8 lg:py-8 space-y-8">
      <PageHeader title="ICP & Verticals" subtitle="Where Factorial converts best across segments." />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">ICP segments</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Segment</th>
                <th className="px-4 py-3 text-right">Matching</th>
                <th className="px-4 py-3 text-right">Demos</th>
                <th className="px-4 py-3 text-right">Closed</th>
                <th className="px-4 py-3 text-right">Conv.</th>
                <th className="px-4 py-3 text-right">Avg MRR</th>
                <th className="px-4 py-3 text-right">Total MRR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {icpRows.map(r => (
                <tr key={r.label} className="hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium">{r.label}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.matching}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.demos}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.closed}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{(r.conv * 100).toFixed(0)}%</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatEUR(r.avgMrr)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatEUR(r.mrr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Verticals</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Vertical</th>
                <th className="px-4 py-3 text-right">Demos</th>
                <th className="px-4 py-3 text-right">Closed</th>
                <th className="px-4 py-3 text-right">Conv.</th>
                <th className="px-4 py-3 text-right">MRR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {vertRows.map(r => (
                <tr key={r.vertical} className="hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium">{r.vertical}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.demos}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.closed}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{(r.conv * 100).toFixed(0)}%</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatEUR(r.mrr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
