import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Table2, Sparkles, Shield, LogOut, Globe, ChevronDown, FlaskConical, Eye, EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useHideMrr, toggleHideMrr } from "@/lib/useHideMrr";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard };

const MAIN_NAV: NavItem[] = [
  { to: "/", label: "Countries", icon: Globe },
  { to: "/overview", label: "Overview", icon: LayoutDashboard },
  { to: "/table", label: "Detail", icon: Table2 },
];

const ADMIN_NAV: NavItem[] = [
  { to: "/enrichment", label: "Enrichment", icon: Sparkles },
  { to: "/admin", label: "Admin", icon: Shield },
];

export function Sidebar() {
  const { pathname } = useLocation();
  const { email, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [adminOpen, setAdminOpen] = useState(false);
  const hideMrr = useHideMrr();

  const selectedCountry = window.localStorage.getItem("pre-event-country") ?? "";

  const renderItem = (item: NavItem) => {
    const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
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
          <span className="text-sm font-semibold">Pre-Event</span>
          <span className="text-[11px] text-sidebar-foreground/60">
            {selectedCountry ? selectedCountry.toUpperCase() : "Select country"}
          </span>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {MAIN_NAV.map(renderItem)}

        <button
          type="button"
          onClick={toggleHideMrr}
          className={cn(
            "mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
            hideMrr
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
          )}
        >
          {hideMrr ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {hideMrr ? "Mostrar MRR" : "Esconder MRR"}
        </button>
      </nav>

      {isAdmin && (
        <div className="border-t border-sidebar-border px-3 py-3">
          <button
            type="button"
            onClick={() => setAdminOpen((v) => !v)}
            className="flex w-full items-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/55 hover:bg-sidebar-accent/40"
          >
            <FlaskConical className="h-3 w-3" />
            Admin
            <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition-transform", adminOpen && "rotate-180")} />
          </button>
          {adminOpen && (
            <div className="mt-1 space-y-0.5">
              {ADMIN_NAV.map(renderItem)}
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
        <button
          type="button"
          onClick={() => { logout(); navigate("/login"); }}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/20 px-2 py-1.5 text-xs text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
