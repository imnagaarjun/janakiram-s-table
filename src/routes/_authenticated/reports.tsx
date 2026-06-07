import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { ReportsHub } from "@/components/reports/ReportsHub";

export const Route = createFileRoute("/_authenticated/reports")({ component: Page });

function Page() {
  return (
    <RoleGuard allow={["admin", "manager", "cashier", "waiter"]}>
      <ReportsHub />
    </RoleGuard>
  );
}
