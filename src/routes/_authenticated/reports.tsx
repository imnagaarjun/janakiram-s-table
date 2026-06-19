import { createFileRoute } from "@tanstack/react-router";
import { AccessGuard } from "@/components/AccessGuard";
import { ReportsHub } from "@/components/reports/ReportsHub";

export const Route = createFileRoute("/_authenticated/reports")({ component: Page });

function Page() {
  return (
    <AccessGuard perm="reports:view">
      <ReportsHub />
    </AccessGuard>
  );
}
