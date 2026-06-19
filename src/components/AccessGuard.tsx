import type { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ShieldAlert } from "lucide-react";

export function AccessGuard({ perm, children }: { perm: string; children: ReactNode }) {
  const { can, loading } = useAuth();
  if (loading) return null;
  if (!can(perm)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center gap-3">
        <ShieldAlert className="h-12 w-12 text-warning" />
        <h2 className="text-lg font-semibold">Not allowed</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          You don't have access to this screen. Ask an admin to update your permissions.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
