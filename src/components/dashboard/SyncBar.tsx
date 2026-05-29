import { RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UseMutationResult } from "@tanstack/react-query";
import type { SyncResult } from "@/lib/hubspot.functions";

type Props = {
  sync: SyncResult | null;
  mutation: UseMutationResult<SyncResult, Error, void, unknown>;
  showStats?: boolean;
};

export function SyncBar({ sync, mutation, showStats = true }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60",
        )}
      >
        <RefreshCw className={cn("h-3.5 w-3.5", mutation.isPending && "animate-spin")} />
        {mutation.isPending ? "Syncing…" : sync ? "Re-sync" : "Sync HubSpot"}
      </button>

      {sync && showStats && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 font-medium text-primary">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {sync.totalDeals} Closed-Won
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2.5 py-1 font-medium text-success">
            {sync.dealsWithRegion} with region
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 font-medium text-muted-foreground">
            {sync.dealsUnknown} unknown
          </span>
          <span className="text-muted-foreground">
            · {sync.apiCalls} API calls · {new Date(sync.syncedAt).toLocaleTimeString()}
          </span>
        </div>
      )}

      {mutation.isError && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          {(mutation.error as Error).message}
        </div>
      )}

      {!sync && !mutation.isPending && (
        <span className="text-xs text-muted-foreground">
          Running on mock data · sync to pull real Closed-Won deals (3 batched endpoints).
        </span>
      )}
    </div>
  );
}
