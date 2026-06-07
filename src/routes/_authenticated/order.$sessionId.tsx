import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { OrderScreen } from "@/components/order/OrderScreen";

export const Route = createFileRoute("/_authenticated/order/$sessionId")({
  component: Page,
});

function Page() {
  const { sessionId } = Route.useParams();
  return (
    <RoleGuard allow={["admin", "manager", "waiter", "cashier"]}>
      <OrderScreen sessionId={sessionId} />
    </RoleGuard>
  );
}
