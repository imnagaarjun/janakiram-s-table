import { createFileRoute } from "@tanstack/react-router";
import { ChefHat } from "lucide-react";
import { RoleGuard } from "@/components/RoleGuard";
import { PagePlaceholder } from "@/components/PagePlaceholder";

export const Route = createFileRoute("/_authenticated/kds")({ component: Page });

function Page() {
  return (
    <RoleGuard allow={["admin", "manager", "kitchen", "cashier"]}>
      <PagePlaceholder
        title="Kitchen Display"
        icon={ChefHat}
        description="Live KOT tickets for the kitchen — no prices shown."
      />
    </RoleGuard>
  );
}
