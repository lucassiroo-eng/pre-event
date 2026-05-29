import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SyncBar } from "@/components/dashboard/SyncBar";
import { useSync } from "@/lib/useSync";
import { DEAL_STAGES } from "@/data/mockData";
import { Cloud, CheckCircle2, AlertCircle, Plug } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  component: Settings,
});

type Bucket = "demoBooked" | "demoHeld" | "closedWon" | "lost" | "unmapped";

const BUCKETS: { id: Bucket; label: string; hint: string }[] = [
  { id: "demoBooked", label: "Demo booked", hint: "Stages where a demo was scheduled" },
  { id: "demoHeld", label: "Demo held", hint: "Stages where a demo actually took place" },
  { id: "closedWon", label: "Closed-won", hint: "Stages counted as revenue" },
  { id: "lost", label: "Lost / cancelled / no-show", hint: "Stages excluded from pipeline" },
];

const DEFAULTS: Record<Bucket, string[]> = {
  demoBooked: ["Demo Scheduled"],
  demoHeld: ["Demo Held"],
  closedWon: ["Closed Won"],
  lost: ["Closed Lost"],
  unmapped: [],
};

function Settings() {
  const [mapping, setMapping] = useState<Record<Bucket, string[]>>(DEFAULTS);
  const [connected, setConnected] = useState(false);
  const { sync, mutation } = useSync();

  const used = new Set<string>(Object.values(mapping).flat());
  const unmapped = DEAL_STAGES.filter(s => !used.has(s));

  function toggle(bucket: Bucket, stage: string) {
    setMapping(m => {
      const next: Record<Bucket, string[]> = { ...m };
      // remove from other buckets first
      (Object.keys(next) as Bucket[]).forEach(b => {
        next[b] = next[b].filter(s => s !== stage);
      });
      next[bucket] = [...next[bucket], stage];
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-6 lg:px-8 lg:py-8 space-y-6">
      <PageHeader title="HubSpot & Settings" subtitle="Connection, sync and stage mapping." />

      <SyncBar sync={sync} mutation={mutation} />

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent/40">
              <Plug className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold">HubSpot connection</h2>
              <p className="text-xs text-muted-foreground">
                {connected ? "Connected · syncing every 4h" : "Not connected · running on mock data"}
              </p>
            </div>
          </div>
          <button
            onClick={() => setConnected(c => !c)}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition-colors",
              connected
                ? "border border-border bg-card text-foreground hover:bg-muted"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {connected ? "Disconnect" : "Connect HubSpot"}
          </button>
        </div>
        {connected && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" /> Last sync just now — 247 deals, 188 companies imported.
          </div>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Cred label="Portal ID" value="—" />
          <Cred label="Pipeline" value="Sales · France" />
          <Cred label="Auto-refresh" value="Every 4 hours" />
          <Cred label="Manual refresh" value="Available" />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <Cloud className="h-4 w-4" />
          <h2 className="text-base font-semibold">Deal stage mapping</h2>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Map your HubSpot pipeline stages to dashboard categories. Updates apply on next sync.
        </p>

        <div className="grid gap-4 lg:grid-cols-2">
          {BUCKETS.map(b => (
            <div key={b.id} className="rounded-xl border border-border p-4">
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-sm font-semibold">{b.label}</h3>
                <span className="text-[11px] text-muted-foreground">{mapping[b.id].length} mapped</span>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">{b.hint}</p>
              <div className="flex flex-wrap gap-1.5">
                {DEAL_STAGES.map(s => {
                  const active = mapping[b.id].includes(s);
                  return (
                    <button
                      key={s}
                      onClick={() => toggle(b.id, s)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-foreground hover:bg-muted",
                      )}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {unmapped.length > 0 && (
          <div className="mt-4 rounded-lg border border-warning/40 bg-warning/10 p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <AlertCircle className="h-4 w-4" /> Unmapped stages
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              These HubSpot stages are not yet mapped to a dashboard category:
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {unmapped.map(s => (
                <span key={s} className="rounded-full bg-muted px-2.5 py-1 text-xs">{s}</span>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold">HubSpot property mapping</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Enter the internal API names from your HubSpot portal. Leave blank to let the dashboard infer values (e.g. region from postal code).
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            ["Demo booked date", "demo_booked_date"],
            ["Demo held date", "demo_held_date"],
            ["Partner name", "partner_name"],
            ["Region", "region"],
            ["Vertical", "industry"],
            ["ICP segment", "icp_segment"],
            ["MRR", "monthly_recurring_revenue"],
            ["Blitz Day campaign", "blitz_campaign"],
          ].map(([label, defVal]) => (
            <label key={label} className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
              <input defaultValue={defVal} className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm" />
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}

function Cred({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
