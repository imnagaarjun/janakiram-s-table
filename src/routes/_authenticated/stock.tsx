import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { StockPanel } from "@/components/stock/StockPanel";

export const Route = createFileRoute("/_authenticated/stock")({ component: Page });

function Page() {
  return (
    <RoleGuard allow={["admin", "manager"]}>
      <StockPanel />
    </RoleGuard>
  );
}
