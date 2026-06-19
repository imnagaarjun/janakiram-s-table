import { createFileRoute } from "@tanstack/react-router";
import { AccessGuard } from "@/components/AccessGuard";
import { BillPanel } from "@/components/billing/BillPanel";

export const Route = createFileRoute("/_authenticated/bill/$sessionId")({ component: Page });

function Page() {
  const { sessionId } = Route.useParams();
  return (
    <AccessGuard perm="billing:view">
      <BillPanel sessionId={sessionId} />
    </AccessGuard>
  );
}
