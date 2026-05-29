import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Clock, Server } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { getHubspotUsageToday } from "@/lib/hubspot.functions";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/hubspot-usage")({
  component: HubspotUsagePage,
});

function HubspotUsagePage() {
  const fetchUsage = useServerFn(getHubspotUsageToday);
  const { data, isLoading } = useQuery({
    queryKey: ["hubspot-usage-today"],
    queryFn: () => fetchUsage(),
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
  });

  // Smoothly animate the big counter
  const [displayed, setDisplayed] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    if (!data) return;
    const start = prev.current;
    const end = data.total;
    if (start === end) { setDisplayed(end); return; }
    const dur = 600;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplayed(Math.round(start + (end - start) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
      else prev.current = end;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [data?.total]);

  const maxHour = data ? Math.max(1, ...data.byHour) : 1;
  const lastCall = data?.lastCallAt ? new Date(data.lastCallAt) : null;

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-6 lg:px-8 lg:py-8 space-y-6">
      <PageHeader title="HubSpot usage" subtitle="Real-time API call counter · updates every 3s" />

      {/* Hero counter */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-8 shadow-sm">
        <div className="absolute inset-0 -z-0 opacity-30">
          <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-primary/30 blur-3xl" />
        </div>
        <div className="relative flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              Live
            </div>
            <div className="mt-3 text-sm text-muted-foreground">API calls today ({data?.date ?? "—"})</div>
            <div className="mt-2 text-7xl font-bold tabular-nums tracking-tight text-foreground">
              {isLoading ? "—" : displayed.toLocaleString()}
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Last call:{" "}
              {lastCall
                ? `${lastCall.toLocaleTimeString()} (${timeAgo(lastCall)})`
                : "no calls yet today"}
            </div>
          </div>
          <div className="grid h-14 w-14 place-items-center rounded-xl bg-primary/15 text-primary">
            <Activity className="h-7 w-7" />
          </div>
        </div>
      </section>

      {/* Per-hour bars */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Calls per hour (UTC)</h2>
        <div className="mt-4 flex h-32 items-end gap-1">
          {(data?.byHour ?? Array(24).fill(0)).map((v, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-primary/80 transition-all duration-500"
                style={{ height: `${(v / maxHour) * 100}%`, minHeight: v > 0 ? 4 : 1 }}
                title={`${v} calls @ ${i.toString().padStart(2, "0")}h`}
              />
              <div className="text-[9px] text-muted-foreground tabular-nums">
                {i.toString().padStart(2, "0")}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* By endpoint */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Server className="h-4 w-4" />
          <h2 className="text-sm font-semibold">By endpoint</h2>
        </div>
        {data && data.byEndpoint.length > 0 ? (
          <div className="space-y-2">
            {data.byEndpoint.map((row) => {
              const pct = (row.count / Math.max(1, data.total)) * 100;
              return (
                <div key={row.endpoint} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <code className="font-mono text-foreground">{row.endpoint}</code>
                    <span className="tabular-nums text-muted-foreground">
                      {row.count} · {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">No API calls recorded today yet.</div>
        )}
      </section>

      <p className="text-[11px] text-muted-foreground">
        Counter is held in the server's in-memory store and resets daily (UTC) or on cold start.
      </p>
    </div>
  );
}

function timeAgo(d: Date): string {
  const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}
