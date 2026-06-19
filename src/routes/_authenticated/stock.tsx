import { createFileRoute } from "@tanstack/react-router";
import { AccessGuard } from "@/components/AccessGuard";
import { StockPanel } from "@/components/stock/StockPanel";

export const Route = createFileRoute("/_authenticated/stock")({ component: Page });

function Page() {
  return (
    <AccessGuard perm="stock:view">
      <StockPanel />
    </AccessGuard>
  );
}
