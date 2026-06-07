import { createFileRoute } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { RoleGuard } from "@/components/RoleGuard";
import { PagePlaceholder } from "@/components/PagePlaceholder";

export const Route = createFileRoute("/_authenticated/menu")({ component: Page });

function Page() {
  return (
    <RoleGuard allow={["admin", "manager", "waiter", "cashier"]}>
      <PagePlaceholder
        title="Menu"
        icon={BookOpen}
        description="Categories, items, prices and stock pools."
      />
    </RoleGuard>
  );
}
