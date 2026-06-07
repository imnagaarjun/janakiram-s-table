import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { KdsScreen } from "@/components/kds/KdsScreen";

export const Route = createFileRoute("/_authenticated/kds")({ component: Page });

function Page() {
  return (
    <RoleGuard allow={["admin", "manager", "kitchen", "cashier"]}>
      <KdsScreen />
    </RoleGuard>
  );
}
