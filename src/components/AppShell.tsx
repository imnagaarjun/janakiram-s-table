import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutGrid, BookOpen, BarChart3, MoreHorizontal, ChefHat, Settings, Boxes, Users, UserCog } from "lucide-react";
import { useDeviceMode } from "@/hooks/use-device-mode";
import { useAuth } from "@/contexts/AuthContext";
import { StatusPill } from "@/components/StatusPill";
import { WaiterNotifier } from "@/components/WaiterNotifier";
import { StockNotifier } from "@/components/StockNotifier";
import { db } from "@/lib/db";
import type { AppRole } from "@/lib/types";

// Module settings context
interface ModuleCtx {
  enabled: (module: string) => boolean;
}
const ModuleContext = createContext<ModuleCtx>({ enabled: () => true });
export function useModules() { return useContext(ModuleContext); }

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutGrid;
  roles: AppRole[];
  module?: string;
}

const ALL_NAV: NavItem[] = [
  { to: "/tables", label: "Tables", icon: LayoutGrid, roles: ["admin", "manager", "cashier", "waiter"], module: "tables" },
  { to: "/menu", label: "Menu", icon: BookOpen, roles: ["admin", "manager", "waiter", "cashier"], module: "menu" },
  { to: "/kds", label: "KDS", icon: ChefHat, roles: ["admin", "manager", "kitchen", "cashier"], module: "kds" },
  { to: "/reports", label: "Reports", icon: BarChart3, roles: ["admin", "manager", "cashier", "waiter"], module: "reports" },
  { to: "/more", label: "More", icon: MoreHorizontal, roles: ["admin", "manager", "cashier", "waiter", "kitchen"] },
];

function visibleNav(perms: Set<string>, enabledFn: (m: string) => boolean): NavItem[] {
  const PERM_MAP: Record<string, string> = {
    "/tables": "tables:view",
    "/menu": "menu:view",
    "/kds": "kds:view",
    "/reports": "reports:view",
  };
  return ALL_NAV.filter((n) => {
    const permKey = PERM_MAP[n.to];
    if (permKey && !perms.has(permKey)) return false;
    if (n.module && !enabledFn(n.module)) return false;
    return true;
  });
}

export function AppShell({ children }: { children: ReactNode }) {
  const mode = useDeviceMode();
  const { roles, profile, permissions } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [modules, setModules] = useState<Map<string, boolean>>(new Map());

  const loadModules = useCallback(async () => {
    if (!profile) return;
    const { data } = await db
      .from("module_settings")
      .select("module,enabled")
      .eq("restaurant_id", profile.restaurant_id);
    const m = new Map<string, boolean>();
    (data ?? []).forEach((row: { module: string; enabled: boolean }) => m.set(row.module, row.enabled));
    setModules(m);
  }, [profile]);

  useEffect(() => { loadModules(); }, [loadModules]);

  const enabled = useCallback((module: string) => modules.size === 0 || modules.get(module) !== false, [modules]);
  const nav = visibleNav(permissions, enabled);

  const { can } = useAuth();
  const isAdmin = roles.includes("admin");

  const NavLink = ({ to, icon: Icon, label }: { to: string; icon: typeof LayoutGrid; label: string }) => {
    const active = pathname === to || pathname.startsWith(to + "/");
    return (
      <Link
        to={to}
        className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium min-h-[48px] ${
          active ? "bg-primary text-primary-foreground" : "hover:bg-accent text-foreground"
        }`}
      >
        <Icon className="h-5 w-5" />
        <span>{label}</span>
      </Link>
    );
  };

  if (mode === "tablet") {
    return (
      <ModuleContext.Provider value={{ enabled }}>
        <div className="min-h-screen flex flex-col bg-background">
          <WaiterNotifier />
          <StockNotifier />
          <div className="h-9 shrink-0 border-b bg-surface flex items-center justify-end px-3">
            <StatusPill fixed={false} />
          </div>
          <div className="flex-1 flex overflow-hidden">
            <aside className="w-56 shrink-0 border-r bg-surface flex flex-col p-3 gap-1">
              <div className="px-2 py-3 mb-2">
                <div className="text-sm font-bold text-foreground">Hotel Sri Janakiram</div>
                <div className="text-xs text-muted-foreground">{roles.join(", ") || "—"}</div>
              </div>
              {nav.map((n) => <NavLink key={n.to} to={n.to} icon={n.icon} label={n.label} />)}
              {(can("stock:view") || can("waiters:view")) && (
                <div className="mt-auto flex flex-col gap-1">
                  {can("stock:view") && enabled("stock") && <NavLink to="/stock" icon={Boxes} label="Daily Stock" />}
                  {can("waiters:view") && enabled("waiters") && <NavLink to="/waiters" icon={Users} label="Waiters" />}
                </div>
              )}
              {(can("users:view") || can("settings:view")) && (
                <div className="flex flex-col gap-1">
                  {can("users:view") && enabled("users") && <NavLink to="/users" icon={UserCog} label="Users" />}
                  {can("settings:view") && <NavLink to="/settings" icon={Settings} label="Settings" />}
                </div>
              )}
            </aside>
            <main className="flex-1 overflow-y-auto">{children}</main>
          </div>
        </div>
      </ModuleContext.Provider>
    );
  }

  return (
    <ModuleContext.Provider value={{ enabled }}>
      <div className="min-h-screen flex flex-col bg-background">
        <WaiterNotifier />
        <div className="h-9 shrink-0 border-b bg-surface flex items-center justify-end px-3">
          <StatusPill fixed={false} />
        </div>
        <main className="flex-1 overflow-y-auto pb-20">{children}</main>
        <nav
          className="fixed bottom-0 inset-x-0 z-40 border-t bg-surface flex justify-around items-stretch"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {nav.map((n) => {
            const active = pathname === n.to || pathname.startsWith(n.to + "/");
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[60px] text-[11px] font-medium ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <n.icon className="h-5 w-5" />
                <span>{n.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </ModuleContext.Provider>
  );
}
