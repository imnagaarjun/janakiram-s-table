import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutGrid, Plus, BookOpen, BarChart3, MoreHorizontal, ChefHat, Settings, Boxes, Users } from "lucide-react";
import { useDeviceMode } from "@/hooks/use-device-mode";
import { useAuth } from "@/contexts/AuthContext";
import { StatusPill } from "@/components/StatusPill";
import { WaiterNotifier } from "@/components/WaiterNotifier";
import type { AppRole } from "@/lib/types";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutGrid;
  roles: AppRole[]; // any of these can see it
}

const ALL_NAV: NavItem[] = [
  { to: "/tables", label: "Tables", icon: LayoutGrid, roles: ["admin", "manager", "cashier", "waiter"] },
  { to: "/new-table", label: "New Table", icon: Plus, roles: ["admin", "manager", "waiter"] },
  { to: "/menu", label: "Menu", icon: BookOpen, roles: ["admin", "manager", "waiter", "cashier"] },
  { to: "/kds", label: "KDS", icon: ChefHat, roles: ["admin", "manager", "kitchen", "cashier"] },
  { to: "/reports", label: "Reports", icon: BarChart3, roles: ["admin", "manager", "cashier", "waiter"] },
  { to: "/more", label: "More", icon: MoreHorizontal, roles: ["admin", "manager", "cashier", "waiter", "kitchen"] },
];

function visibleNav(roles: AppRole[]): NavItem[] {
  // Waiter sees Tables/New Table/Menu/More
  // Kitchen sees only KDS/More
  // Manager/Admin see everything
  if (roles.includes("admin") || roles.includes("manager")) return ALL_NAV;
  if (roles.includes("kitchen") && roles.length === 1) {
    return ALL_NAV.filter((n) => n.to === "/kds" || n.to === "/more");
  }
  if (roles.includes("cashier") && !roles.includes("waiter")) {
    return ALL_NAV.filter((n) => ["/tables", "/menu", "/kds", "/reports", "/more"].includes(n.to));
  }
  // Waiter
  return ALL_NAV.filter((n) => ["/tables", "/new-table", "/menu", "/reports", "/more"].includes(n.to));
}

export function AppShell({ children }: { children: ReactNode }) {
  const mode = useDeviceMode();
  const { roles } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const nav = visibleNav(roles);

  if (mode === "tablet") {
    return (
      <div className="min-h-screen flex bg-background">
        <StatusPill />
        <WaiterNotifier />
        <aside className="w-56 shrink-0 border-r bg-surface flex flex-col p-3 gap-1">
          <div className="px-2 py-3 mb-2">
            <div className="text-sm font-bold text-foreground">Hotel Sri Janakiram</div>
            <div className="text-xs text-muted-foreground">{roles.join(", ") || "—"}</div>
          </div>
          {nav.map((n) => {
            const active = pathname === n.to || pathname.startsWith(n.to + "/");
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium min-h-[48px] ${
                  active ? "bg-primary text-primary-foreground" : "hover:bg-accent text-foreground"
                }`}
              >
                <n.icon className="h-5 w-5" />
                <span>{n.label}</span>
              </Link>
            );
          })}
          {(roles.includes("admin") || roles.includes("manager")) && (
            <div className="mt-auto flex flex-col gap-1">
              <Link
                to="/stock"
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium min-h-[48px] ${
                  pathname.startsWith("/stock")
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent text-foreground"
                }`}
              >
                <Boxes className="h-5 w-5" />
                <span>Daily Stock</span>
              </Link>
              <Link
                to="/waiters"
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium min-h-[48px] ${
                  pathname.startsWith("/waiters")
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent text-foreground"
                }`}
              >
                <Users className="h-5 w-5" />
                <span>Waiters</span>
              </Link>
            </div>
          )}
          {roles.includes("admin") && (
            <Link
              to="/settings"
              className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium min-h-[48px] ${
                pathname.startsWith("/settings")
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent text-foreground"
              }`}
            >
              <Settings className="h-5 w-5" />
              <span>Settings</span>
            </Link>
          )}
        </aside>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    );
  }

  // Phone: top header thin + content + bottom tab bar
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <StatusPill />
      <WaiterNotifier />
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
  );
}
