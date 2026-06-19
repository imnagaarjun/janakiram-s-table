import { createFileRoute } from "@tanstack/react-router";
import { AccessGuard } from "@/components/AccessGuard";
import { TablesGrid } from "@/components/tables/TablesGrid";

export const Route = createFileRoute("/_authenticated/tables")({ component: Page });

function Page() {
  return (
    <AccessGuard perm="tables:view">
      <TablesGrid />
    </AccessGuard>
  );
}
