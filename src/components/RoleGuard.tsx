import type { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { AppRole } from "@/lib/types";
import { ShieldAlert } from "lucide-react";

export function RoleGuard({ allow, children }: { allow: AppRole[]; children: ReactNode }) {
  const { hasRole, loading } = useAuth();
  if (loading) return null;
  if (!hasRole(...allow)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center gap-3">
        <ShieldAlert className="h-12 w-12 text-warning" />
        <h2 className="text-lg font-semibold">Not allowed</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          Your role doesn't include access to this screen. Ask an admin for permission.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
