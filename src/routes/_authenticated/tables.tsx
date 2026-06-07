import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { TablesGrid } from "@/components/tables/TablesGrid";

export const Route = createFileRoute("/_authenticated/tables")({ component: Page });

function Page() {
  return (
    <RoleGuard allow={["admin", "manager", "cashier", "waiter"]}>
      <TablesGrid />
    </RoleGuard>
  );
}
