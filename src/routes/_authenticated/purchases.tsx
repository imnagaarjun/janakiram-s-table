import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { DailyPurchasesScreen } from "@/components/purchases/DailyPurchasesScreen";

export const Route = createFileRoute("/_authenticated/purchases")({ component: Page });

function Page() {
  return (
    <RoleGuard allow={["admin", "manager", "cashier"]}>
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Daily purchases</h1>
        <DailyPurchasesScreen />
      </div>
    </RoleGuard>
  );
}
