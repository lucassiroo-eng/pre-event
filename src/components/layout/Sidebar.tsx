import { useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, Settings as SettingsIcon, FlaskConical, ChevronDown, Search, Activity, Sparkles, LogOut, Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };

const MAIN_NAV: NavItem[] = [
  { to: "/", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/table", label: "Detail", icon: Search },
];

const WIP_NAV: NavItem[] = [
  { to: "/settings", label: "HubSpot & Settings", icon: SettingsIcon },
  { to: "/hubspot-usage", label: "HubSpot usage", icon: Activity },
  { to: "/enrichment", label: "Enrichment SIRENE", icon: Sparkles },
  { to: "/data-cleaning", label: "Data cleaning", icon: Filter },
];

export function Sidebar() {
  const { pathname } = useLocation();
  const { email, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [wipOpen, setWipOpen] = useState(false);

  const renderItem = (item: NavItem) => {
    const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
    const Icon = item.icon;
    return (
      <Link
        key={item.to}
        to={item.to}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
        {item.label}
      </Link>
    );
  };

  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center gap-2.5 px-5 border-b border-sidebar-border">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground font-bold">
          F
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">Factorial France</span>
          <span className="text-[11px] text-sidebar-foreground/60">Partner Dashboard</span>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {MAIN_NAV.map(renderItem)}
      </nav>

      {isAdmin && (
        <div className="border-t border-sidebar-border px-3 py-3">
          <button
            type="button"
            onClick={() => setWipOpen((v) => !v)}
            className="flex w-full items-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/55 hover:bg-sidebar-accent/40"
          >
            <FlaskConical className="h-3 w-3" />
            WIP
            <span className="ml-1 rounded-sm bg-sidebar-accent/40 px-1.5 py-0.5 text-[9px] font-medium normal-case tracking-normal text-sidebar-foreground/60">
              Admin
            </span>
            <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition-transform", wipOpen && "rotate-180")} />
          </button>
          {wipOpen && (
            <div className="mt-1 space-y-0.5">
              {WIP_NAV.map(renderItem)}
            </div>
          )}
        </div>
      )}

      <div className="border-t border-sidebar-border p-4 space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/45">
          Signed in as
        </div>
        <div className="w-full rounded-md border border-sidebar-border bg-sidebar-accent/30 px-2 py-1.5 text-xs text-sidebar-foreground truncate">
          {email ?? "—"}
        </div>
        <div className="text-[11px] text-sidebar-foreground/55">
          {isAdmin ? "Admin · WIP tabs visible" : "Standard user · Overview only"}
        </div>
        <button
          type="button"
          onClick={() => { logout(); navigate({ to: "/login" }); }}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/20 px-2 py-1.5 text-xs text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
