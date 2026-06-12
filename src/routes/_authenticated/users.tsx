import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { UsersPanel } from "@/components/users/UsersPanel";

export const Route = createFileRoute("/_authenticated/users")({ component: Page });

function Page() {
  return (
    <RoleGuard allow={["admin"]}>
      <UsersPanel />
    </RoleGuard>
  );
}
