import { createFileRoute } from "@tanstack/react-router";
import { AccessGuard } from "@/components/AccessGuard";
import { OrderScreen } from "@/components/order/OrderScreen";

export const Route = createFileRoute("/_authenticated/order/$sessionId")({
  component: Page,
});

function Page() {
  const { sessionId } = Route.useParams();
  return (
    <AccessGuard perm="tables:view">
      <OrderScreen sessionId={sessionId} />
    </AccessGuard>
  );
}
