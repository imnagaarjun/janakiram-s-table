import { createFileRoute } from "@tanstack/react-router";
import { AccessGuard } from "@/components/AccessGuard";
import { DailyCashReconScreen } from "@/components/cash-recon/DailyCashReconScreen";

export const Route = createFileRoute("/_authenticated/cash-recon")({ component: Page });

function Page() {
  return (
    <AccessGuard perm="cash-recon:view">
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-1">Daily cash reconciliation</h1>
        <p className="text-sm text-muted-foreground mb-4">
          Count each cash point and tally it, then check the day. Auto figures fill in by
          themselves; manual lines (opening, drawings, donations) and the cash count are typed here.
        </p>
        <DailyCashReconScreen />
      </div>
    </AccessGuard>
  );
}
