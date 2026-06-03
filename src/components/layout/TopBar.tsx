import { useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHideMrr, toggleHideMrr } from "@/lib/useHideMrr";
import { getCountryConfig } from "@/lib/countryConfig";
import { useT } from "@/lib/i18n";
import { useSyncExternalStore } from "react";

// Subscribe to country localStorage so the flag updates when changed.
function subscribe(cb: () => void) {
  const handler = (e: StorageEvent) => { if (e.key === "pre-event-country") cb(); };
  window.addEventListener("storage", handler);
  // Re-render on focus too, in case the same tab changed via setLocaleCountry.
  const i = window.setInterval(cb, 1000);
  return () => { window.removeEventListener("storage", handler); window.clearInterval(i); };
}
function getCountry() { return window.localStorage.getItem("pre-event-country") ?? ""; }

export function TopBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const hideMrr = useHideMrr();
  const t = useT();
  const country = useSyncExternalStore(subscribe, getCountry, getCountry);
  const cfg = country ? getCountryConfig(country) : null;
  const isPicker = pathname === "/";

  return (
    <div className="sticky top-0 z-30 flex h-12 items-center justify-end gap-2 border-b border-border bg-background/80 px-4 backdrop-blur-md lg:px-6">
      <button
        type="button"
        onClick={toggleHideMrr}
        title={hideMrr ? t("topbar.showMrr") : t("topbar.hideMrr")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors",
          hideMrr
            ? "bg-primary/10 text-primary ring-primary/30"
            : "bg-background text-muted-foreground ring-border hover:bg-muted hover:text-foreground",
        )}
      >
        {hideMrr ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">{hideMrr ? t("topbar.showMrr") : t("topbar.hideMrr")}</span>
      </button>

      {!isPicker && cfg && (
        <button
          type="button"
          onClick={() => navigate("/")}
          title={t("topbar.changeCountry")}
          className="group inline-flex items-center gap-2 rounded-full bg-background px-1 py-1 pr-3 text-xs font-medium text-foreground ring-1 ring-inset ring-border transition-all hover:bg-muted hover:ring-primary/40"
        >
          <span className="grid h-7 w-7 place-items-center rounded-full bg-muted text-base leading-none">
            {cfg.flag}
          </span>
          <span className="hidden sm:inline tabular-nums uppercase tracking-wide">{country}</span>
          <span className="hidden md:inline text-muted-foreground group-hover:text-foreground transition-colors">
            · {t("topbar.changeCountry")}
          </span>
        </button>
      )}
    </div>
  );
}
