import { createFileRoute } from "@tanstack/react-router";
import { AccessGuard } from "@/components/AccessGuard";
import { KdsScreen } from "@/components/kds/KdsScreen";

export const Route = createFileRoute("/_authenticated/kds")({ component: Page });

function Page() {
  return (
    <AccessGuard perm="kds:view">
      <KdsScreen />
    </AccessGuard>
  );
}
