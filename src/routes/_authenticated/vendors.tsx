import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/RoleGuard";
import { VendorsPanel } from "@/components/vendors/VendorsPanel";

export const Route = createFileRoute("/_authenticated/vendors")({ component: Page });

function Page() {
  return (
    <RoleGuard allow={["admin", "manager"]}>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Vendors & Products</h1>
        <VendorsPanel />
      </div>
    </RoleGuard>
  );
}
