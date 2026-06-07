import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { RoleGuard } from "@/components/RoleGuard";
import { PagePlaceholder } from "@/components/PagePlaceholder";

export const Route = createFileRoute("/_authenticated/new-table")({ component: Page });

function Page() {
  return (
    <RoleGuard allow={["admin", "manager", "waiter"]}>
      <PagePlaceholder
        title="New Table"
        icon={Plus}
        description="Quick-start a new dine-in or takeaway order."
      />
    </RoleGuard>
  );
}
