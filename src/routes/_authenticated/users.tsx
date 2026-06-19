import { createFileRoute } from "@tanstack/react-router";
import { AccessGuard } from "@/components/AccessGuard";
import { UsersPanel } from "@/components/users/UsersPanel";

export const Route = createFileRoute("/_authenticated/users")({ component: Page });

function Page() {
  return (
    <AccessGuard perm="users:view">
      <UsersPanel />
    </AccessGuard>
  );
}
