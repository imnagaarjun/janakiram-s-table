import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { RoleGuard } from "@/components/RoleGuard";
import { PagePlaceholder } from "@/components/PagePlaceholder";

export const Route = createFileRoute("/_authenticated/reports")({ component: Page });

function Page() {
  return (
    <RoleGuard allow={["admin", "manager"]}>
      <PagePlaceholder
        title="Reports"
        icon={BarChart3}
        description="Sales, KOTs, voids and end-of-day summaries."
      />
    </RoleGuard>
  );
}
