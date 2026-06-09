import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { CashConfigScreen } from "@/components/cash-config/CashConfigScreen";

export const Route = createFileRoute("/_authenticated/cash-config")({ component: Page });

function Page() {
  return (
    <RoleGuard allow={["admin", "manager"]}>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-1">Cash reconciliation setup</h1>
        <p className="text-sm text-muted-foreground mb-4">
          Configure the lines and denomination rows used in the daily cash-up.
        </p>
        <CashConfigScreen />
      </div>
    </RoleGuard>
  );
}
