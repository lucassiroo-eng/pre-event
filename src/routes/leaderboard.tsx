import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { OWNERS, PARTNERS, formatEUR } from "@/data/mockData";
import { Trophy, Medal } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/leaderboard")({
  component: Leaderboard,
});

function seeded(i: number) {
  return Math.sin(i * 9973) * 10000;
}
function num(i: number, lo: number, hi: number) {
  const r = Math.abs(seeded(i)) % 1;
  return Math.floor(lo + r * (hi - lo));
}

function Leaderboard() {
  const rows = OWNERS.map((name, i) => {
    const calls = num(i + 1, 40, 120);
    const demos = num(i + 7, 4, 16);
    const qDemos = Math.max(0, demos - num(i + 3, 0, 3));
    const deals = num(i + 11, 0, 6);
    const partner = PARTNERS[i % PARTNERS.length];
    const points = qDemos * 1 + num(i + 5, 2, 8) * 2 + deals * 5 + num(i + 9, 0, 5);
    const mrr = deals * num(i + 13, 600, 1800);
    return { name, partner, calls, demos, qDemos, deals, points, mrr };
  }).sort((a, b) => b.points - a.points);

  return (
    <div className="mx-auto max-w-[1300px] px-6 py-6 lg:px-8 lg:py-8">
      <PageHeader
        title="Blitz Day Leaderboard"
        subtitle="Live ranking by points · 1pt qualified demo · 2pt demo held · 5pt closed deal."
      />

      <div className="grid gap-3 md:grid-cols-3 mb-6">
        {rows.slice(0, 3).map((r, i) => (
          <div key={r.name} className={cn(
            "rounded-2xl border p-4 shadow-sm",
            i === 0 ? "border-accent bg-gradient-to-br from-accent/30 to-accent/10" : "border-border bg-card",
          )}>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              {i === 0 ? <Trophy className="h-4 w-4" /> : <Medal className="h-4 w-4" />}
              #{i + 1}
            </div>
            <div className="mt-2 text-lg font-semibold">{r.name}</div>
            <div className="text-xs text-muted-foreground">{r.partner}</div>
            <div className="mt-3 text-3xl font-bold tabular-nums">{r.points} <span className="text-sm font-normal text-muted-foreground">pts</span></div>
            <div className="mt-1 text-xs text-muted-foreground">{r.qDemos} qualified · {r.deals} closed · {formatEUR(r.mrr)}</div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">#</th>
              <th className="px-4 py-3 text-left">Sales rep</th>
              <th className="px-4 py-3 text-left">Partner</th>
              <th className="px-4 py-3 text-right">Calls</th>
              <th className="px-4 py-3 text-right">Demos</th>
              <th className="px-4 py-3 text-right">Qualified</th>
              <th className="px-4 py-3 text-right">Deals</th>
              <th className="px-4 py-3 text-right">MRR</th>
              <th className="px-4 py-3 text-right">Points</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => (
              <tr key={r.name} className="hover:bg-muted/40">
                <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.partner}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.calls}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.demos}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.qDemos}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.deals}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatEUR(r.mrr)}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
