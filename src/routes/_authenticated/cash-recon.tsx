import { createFileRoute } from "@tanstack/react-router";
import { AccessGuard } from "@/components/AccessGuard";
import { DailyCashReconScreen } from "@/components/cash-recon/DailyCashReconScreen";

export const Route = createFileRoute("/_authenticated/cash-recon")({ component: Page });

function Page() {
  return (
    <AccessGuard perm="cash-recon:view">
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-1">Daily cash reconciliation</h1>
        <p className="text-sm text-muted-foreground mb-4">
          Close the day per section. Auto figures come from settled bills; manual lines
          (opening, drawings, donations) and denomination counts are entered here.
        </p>
        <DailyCashReconScreen />
      </div>
    </AccessGuard>
  );
}
