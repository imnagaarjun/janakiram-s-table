import { createFileRoute, Link } from "@tanstack/react-router";
import { Settings, LogOut, User, Boxes, Users, Truck, ShoppingCart, Wallet } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/more")({ component: Page });

function Page() {
  const { profile, roles, hasRole, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">More</h1>

      <div className="rounded-2xl border border-border bg-surface p-4 mb-4 flex items-center gap-3 shadow-sm">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
          <User className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{profile?.name ?? "—"}</div>
          <div className="text-xs text-muted-foreground capitalize">{roles.join(", ") || "no role"}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface overflow-hidden shadow-sm">
        {hasRole("admin", "manager") && (
          <Link
            to="/stock"
            className="flex items-center gap-3 px-4 py-4 min-h-[56px] hover:bg-accent border-b border-border"
          >
            <Boxes className="h-5 w-5 text-muted-foreground" />
            <span className="flex-1 font-medium">Daily stock</span>
          </Link>
        )}
        {hasRole("admin", "manager") && (
          <Link
            to="/waiters"
            className="flex items-center gap-3 px-4 py-4 min-h-[56px] hover:bg-accent border-b border-border"
          >
            <Users className="h-5 w-5 text-muted-foreground" />
            <span className="flex-1 font-medium">Waiters & allocation</span>
          </Link>
        )}
        {hasRole("admin", "manager") && (
          <Link
            to="/vendors"
            className="flex items-center gap-3 px-4 py-4 min-h-[56px] hover:bg-accent border-b border-border"
          >
            <Truck className="h-5 w-5 text-muted-foreground" />
            <span className="flex-1 font-medium">Vendors & products</span>
          </Link>
        )}
        {hasRole("admin", "manager", "cashier") && (
          <Link
            to="/purchases"
            className="flex items-center gap-3 px-4 py-4 min-h-[56px] hover:bg-accent border-b border-border"
          >
            <ShoppingCart className="h-5 w-5 text-muted-foreground" />
            <span className="flex-1 font-medium">Daily purchases</span>
          </Link>
        )}
        {hasRole("admin", "manager") && (
          <Link
            to="/cash-config"
            className="flex items-center gap-3 px-4 py-4 min-h-[56px] hover:bg-accent border-b border-border"
          >
            <Wallet className="h-5 w-5 text-muted-foreground" />
            <span className="flex-1 font-medium">Cash reconciliation setup</span>
          </Link>
        )}
        {hasRole("admin") && (
          <Link
            to="/settings"
            className="flex items-center gap-3 px-4 py-4 min-h-[56px] hover:bg-accent border-b border-border"
          >
            <Settings className="h-5 w-5 text-muted-foreground" />
            <span className="flex-1 font-medium">Restaurant settings</span>
          </Link>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-4 min-h-[56px] hover:bg-accent text-danger"
        >
          <LogOut className="h-5 w-5" />
          <span className="flex-1 text-left font-medium">Sign out</span>
        </button>
      </div>
    </div>
  );
}
