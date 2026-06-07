import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { BillPanel } from "@/components/billing/BillPanel";

export const Route = createFileRoute("/_authenticated/bill/$sessionId")({ component: Page });

function Page() {
  const { sessionId } = Route.useParams();
  return (
    <RoleGuard allow={["admin", "manager", "cashier"]}>
      <BillPanel sessionId={sessionId} />
    </RoleGuard>
  );
}
