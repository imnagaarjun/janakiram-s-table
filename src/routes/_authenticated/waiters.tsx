import { createFileRoute } from "@tanstack/react-router";
import { AccessGuard } from "@/components/AccessGuard";
import { WaitersPanel } from "@/components/waiters/WaitersPanel";

export const Route = createFileRoute("/_authenticated/waiters")({ component: Page });

function Page() {
  return (
    <AccessGuard perm="waiters:view">
      <WaitersPanel />
    </AccessGuard>
  );
}
