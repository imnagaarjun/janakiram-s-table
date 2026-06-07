import { createFileRoute } from "@tanstack/react-router";
import { LayoutGrid } from "lucide-react";
import { RoleGuard } from "@/components/RoleGuard";
import { PagePlaceholder } from "@/components/PagePlaceholder";

export const Route = createFileRoute("/_authenticated/tables")({ component: Page });

function Page() {
  return (
    <RoleGuard allow={["admin", "manager", "cashier", "waiter"]}>
      <PagePlaceholder
        title="Tables"
        icon={LayoutGrid}
        description="Live floor view with table status (free, seated, running, bill requested)."
      />
    </RoleGuard>
  );
}
