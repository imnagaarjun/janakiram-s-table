import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { WaitersPanel } from "@/components/waiters/WaitersPanel";

export const Route = createFileRoute("/_authenticated/waiters")({ component: Page });

function Page() {
  return (
    <RoleGuard allow={["admin", "manager"]}>
      <WaitersPanel />
    </RoleGuard>
  );
}
