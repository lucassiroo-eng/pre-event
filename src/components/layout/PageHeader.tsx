import { LAST_SYNC, formatDate } from "@/data/mockData";
import { RefreshCw, Zap } from "lucide-react";

interface Props {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  variant?: "hero" | "compact";
}

export function PageHeader({
  title = "Blitz Day – Factorial France",
  subtitle = "Regional performance dashboard for sales teams",
  actions,
  variant = "hero",
}: Props) {
  if (variant === "compact") {
    return (
      <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3">
          <SyncBadge />
          {actions}
        </div>
      </header>
    );
  }

  return (
    <header
      className="relative overflow-hidden rounded-2xl px-6 py-8 text-white shadow-sm sm:px-10 sm:py-10"
      style={{ background: "var(--gradient-factorial)" }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(800px 300px at 90% -10%, rgba(255,255,255,0.35), transparent 60%), radial-gradient(600px 250px at -10% 110%, rgba(0,0,0,0.25), transparent 60%)",
        }}
      />
      <div className="relative flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white text-primary shadow-md">
            <span className="text-2xl font-black leading-none">F</span>
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
            {subtitle && (
              <p className="mt-2 max-w-2xl text-sm text-white/85 sm:text-base">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SyncBadge dark />
          {actions}
        </div>
      </div>
    </header>
  );
}

function SyncBadge({ dark = false }: { dark?: boolean }) {
  return (
    <div
      className={
        dark
          ? "hidden sm:flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs text-white backdrop-blur"
          : "hidden sm:flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground"
      }
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dark ? "bg-white" : "bg-success"}`} />
      Last HubSpot sync · {formatDate(LAST_SYNC)}
      <button
        className={
          dark
            ? "ml-1 rounded p-0.5 text-white/80 hover:text-white"
            : "ml-1 rounded p-0.5 text-muted-foreground hover:text-foreground"
        }
        title="Refresh"
      >
        <RefreshCw className="h-3 w-3" />
      </button>
    </div>
  );
}
