import { Check, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { inr } from "./numbers";
import { fmtTime, type Approval, type SignoffAction, type Stage } from "./model";

export function SignoffBanner({
  stage,
  approval,
  locked,
  isAdmin,
  canCheck,
  canApprove,
  dirtyCount,
  onAction,
}: {
  stage: Stage;
  approval: Approval | null;
  locked: boolean;
  isAdmin: boolean;
  canCheck: boolean;
  canApprove: boolean;
  dirtyCount: number;
  onAction: (a: SignoffAction) => void;
}) {
  return (
    <div
      className={cn(
        "mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border px-3 py-2.5",
        stage === "approved"
          ? "border-emerald-200 bg-emerald-50"
          : stage === "checked"
            ? "border-sky-200 bg-sky-50"
            : "border-border bg-surface",
      )}
    >
      {stage !== "open" && (
        <ShieldCheck
          className={cn(
            "h-5 w-5 shrink-0",
            stage === "approved" ? "text-emerald-600" : "text-sky-600",
          )}
        />
      )}
      <div className="min-w-[200px] flex-1 basis-[200px] text-sm">
        {stage === "open" && (
          <>
            <div className="font-medium">Not checked yet</div>
            <div className="text-xs text-muted-foreground">
              Checked, then approved. PDF and Print unlock once the day is checked.
            </div>
          </>
        )}
        {approval && stage !== "open" && (
          <div className="space-y-0.5">
            <div>
              <span className="font-semibold">Checked by {approval.checked_by_name}</span>
              {approval.checked_at && (
                <span className="text-xs text-muted-foreground">
                  {" "}
                  · {fmtTime(approval.checked_at)}
                </span>
              )}
              {approval.corrected_by_name && approval.corrected_at && (
                <span className="text-xs text-amber-700">
                  {" "}
                  · Corrected by {approval.corrected_by_name}, {fmtTime(approval.corrected_at)}
                </span>
              )}
            </div>
            {stage === "approved" && approval.approved_at ? (
              <div>
                <span className="font-semibold text-emerald-900">
                  Approved by {approval.approved_by_name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {" "}
                  · {fmtTime(approval.approved_at)}
                </span>
                {approval.revised_by_name && approval.revised_at && (
                  <span className="text-xs text-amber-700">
                    {" "}
                    · Revised after approval by {approval.revised_by_name},{" "}
                    {fmtTime(approval.revised_at)}
                  </span>
                )}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Waiting for approval</div>
            )}
          </div>
        )}
        {stage !== "open" && (
          <div className="text-xs text-muted-foreground mt-0.5">
            {stage === "checked"
              ? locked
                ? "Checked. Only people who can approve (and the admin) can correct this day."
                : "Checked. You can correct this day; corrections are recorded."
              : locked
                ? "Approved and locked. Only the admin can change it."
                : "Approved. As admin you can still change it; changes are recorded as a revision."}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {stage === "open" &&
          (canCheck ? (
            <>
              {dirtyCount > 0 && <span className="text-xs text-amber-700">Save changes first</span>}
              <Button size="sm" onClick={() => onAction("check")} disabled={dirtyCount > 0}>
                <Check className="h-4 w-4 mr-1.5" /> Mark as checked
              </Button>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Waiting for check</span>
          ))}
        {stage === "checked" && canApprove && (
          <>
            <Button variant="outline" size="sm" onClick={() => onAction("sendback")}>
              Send back
            </Button>
            <Button size="sm" onClick={() => onAction("approve")} disabled={dirtyCount > 0}>
              <ShieldCheck className="h-4 w-4 mr-1.5" /> Approve
            </Button>
          </>
        )}
        {stage === "approved" && isAdmin && (
          <Button variant="outline" size="sm" onClick={() => onAction("reopen")}>
            Reopen
          </Button>
        )}
      </div>
    </div>
  );
}

export function SignoffDialog({
  action,
  businessDate,
  totals,
  pendingCount,
  busy,
  onClose,
  onConfirm,
}: {
  action: SignoffAction | null;
  businessDate: string;
  totals: { gross: number; cash: number; online: number; due: number };
  pendingCount: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: (a: SignoffAction) => void;
}) {
  return (
    <AlertDialog open={action !== null} onOpenChange={(o) => !busy && !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {action === "check" && "Mark this day as checked?"}
            {action === "approve" && "Approve this day?"}
            {action === "sendback" && "Send back for correction?"}
            {action === "reopen" && "Reopen this approved day?"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p className="font-medium text-foreground">
                {new Date(`${businessDate}T00:00:00`).toLocaleDateString("en-IN", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
              {(action === "check" || action === "approve") && (
                <>
                  <p>
                    Total <strong className="text-foreground">{inr(totals.gross)}</strong> · Cash{" "}
                    <strong className="text-foreground">{inr(totals.cash)}</strong> · Online{" "}
                    <strong className="text-foreground">{inr(totals.online)}</strong> · Due{" "}
                    <strong className="text-foreground">{inr(totals.due)}</strong>
                  </p>
                  {pendingCount > 0 && (
                    <p className="text-amber-700">
                      {pendingCount} {pendingCount === 1 ? "vendor has" : "vendors have"} no entry
                      for this day.
                    </p>
                  )}
                </>
              )}
              {action === "check" && (
                <p>
                  After checking, only people who can approve (and the admin) can correct this
                  sheet, and PDF and Print become available. Your name and the time are recorded.
                </p>
              )}
              {action === "approve" && (
                <p>
                  After approval the sheet is locked: only the admin can change it. Your name and
                  the time are recorded.
                </p>
              )}
              {action === "sendback" && (
                <p>
                  The check is removed and staff can edit the sheet again. PDF and Print lock until
                  it is rechecked.
                </p>
              )}
              {action === "reopen" && (
                <p>
                  The approval is removed and the sheet goes back to &quot;checked&quot;, so
                  approvers and the admin can correct it.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              if (action) onConfirm(action);
            }}
          >
            {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {action === "check" && "Mark as checked"}
            {action === "approve" && "Approve"}
            {action === "sendback" && "Send back"}
            {action === "reopen" && "Reopen"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
