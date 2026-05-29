import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string | number;
  delta?: string;
  hint?: string;
  icon?: LucideIcon;
  trend?: "up" | "down" | "neutral";
  className?: string;
}

export function KpiCard({ label, value, delta, hint, icon: Icon, trend = "neutral", className }: KpiCardProps) {
  return (
    <div className={cn(
      "rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md",
      className,
    )}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-2 text-2xl font-semibold text-foreground tabular-nums">{value}</div>
        </div>
        {Icon && (
          <div className="rounded-lg bg-accent/40 p-2 text-foreground">
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
      {(delta || hint) && (
        <div className="mt-3 flex items-center justify-between text-xs">
          {delta && (
            <span className={cn(
              "rounded-full px-2 py-0.5 font-medium",
              trend === "up" && "bg-success/15 text-success",
              trend === "down" && "bg-destructive/15 text-destructive",
              trend === "neutral" && "bg-muted text-muted-foreground",
            )}>
              {delta}
            </span>
          )}
          {hint && <span className="text-muted-foreground">{hint}</span>}
        </div>
      )}
    </div>
  );
}
