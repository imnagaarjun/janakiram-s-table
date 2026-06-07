import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({ component: Index });

function Index() {
  const { loading, userId, roles } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!userId) {
      navigate({ to: "/auth", replace: true });
      return;
    }
    // route to first allowed tab
    if (roles.includes("kitchen") && roles.length === 1) {
      navigate({ to: "/kds", replace: true });
    } else {
      navigate({ to: "/tables", replace: true });
    }
  }, [loading, userId, roles, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
