import { AlertTriangle, Check, CheckCircle2, Circle, Loader2, ShieldCheck } from "lucide-react";
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
import { inr } from "@/lib/gst";
import { fmtTime } from "@/components/purchases/model";

export type CashStage = "open" | "checked" | "approved";
export type CashSignoffAction = "check" | "approve" | "sendback" | "reopen";

export interface CashDaySignoff {
  checked_by_name: string | null;
  checked_at: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
}

export interface CashPointStatus {
  section_key: string;
  label: string;
  status: string | null;
  expected: number | null;
  counted: number | null;
  tallied: boolean;
}

const money = (n: number) => inr(Math.abs(n));

function chip(s: CashPointStatus) {
  if (s.status === null) return { text: "Not started", tone: "idle" as const };
  const diff = (s.counted ?? 0) - (s.expected ?? 0);
  if (Math.abs(diff) >= 0.005)
    return {
      text: `${diff > 0 ? "Excess" : "Short"} ${money(diff)}${s.status === "finalised" ? "" : " · draft"}`,
      tone: "bad" as const,
    };
  return s.status === "finalised"
    ? { text: "Tallied", tone: "ok" as const }
    : { text: "Tallied · not closed", tone: "warn" as const };
}

export function CashDayBanner({
  stage,
  signoff,
  points,
  activeKey,
  isAdmin,
  canCheck,
  canApprove,
  onPick,
  onAction,
}: {
  stage: CashStage;
  signoff: CashDaySignoff | null;
  points: CashPointStatus[];
  activeKey: string;
  isAdmin: boolean;
  canCheck: boolean;
  canApprove: boolean;
  onPick: (key: string) => void;
  onAction: (a: CashSignoffAction) => void;
}) {
  const allTallied = points.length > 0 && points.every((p) => p.tallied);
  const pending = points.filter((p) => !p.tallied);

  return (
    <div
      className={cn(
        "rounded-2xl border p-3 space-y-3",
        stage === "approved"
          ? "border-emerald-200 bg-emerald-50"
          : stage === "checked"
            ? "border-sky-200 bg-sky-50"
            : "border-border bg-surface",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {stage !== "open" && (
          <ShieldCheck
            className={cn(
              "h-5 w-5 shrink-0",
              stage === "approved" ? "text-emerald-600" : "text-sky-600",
            )}
          />
        )}
        <div className="min-w-[200px] flex-1 basis-[200px] text-sm">
          {stage === "open" ? (
            <>
              <div className="font-medium">Day not checked yet</div>
              <div className="text-xs text-muted-foreground">
                {allTallied
                  ? "Every cash point is closed and tallied. Ready to check."
                  : "Close and tally every cash point first, then the day can be checked."}
              </div>
            </>
          ) : (
            <div className="space-y-0.5">
              <div>
                <span className="font-semibold">Checked by {signoff?.checked_by_name}</span>
                {signoff?.checked_at && (
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    · {fmtTime(signoff.checked_at)}
                  </span>
                )}
              </div>
              {stage === "approved" && signoff?.approved_at ? (
                <div>
                  <span className="font-semibold text-emerald-900">
                    Approved by {signoff.approved_by_name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    · {fmtTime(signoff.approved_at)}
                  </span>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">Waiting for approval</div>
              )}
              <div className="text-xs text-muted-foreground">
                {stage === "approved"
                  ? "Approved and locked. Only the admin can reopen it."
                  : "Checked and locked. An approver can send it back for changes."}
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {stage === "open" &&
            (canCheck ? (
              <Button size="sm" onClick={() => onAction("check")} disabled={!allTallied}>
                <Check className="h-4 w-4 mr-1.5" /> Mark day as checked
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">Waiting for check</span>
            ))}
          {stage === "checked" && canApprove && (
            <>
              <Button variant="outline" size="sm" onClick={() => onAction("sendback")}>
                Send back
              </Button>
              <Button size="sm" onClick={() => onAction("approve")}>
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

      {points.length > 0 && (
        <div className="flex flex-wrap gap-2" role="list" aria-label="Cash points">
          {points.map((p) => {
            const c = chip(p);
            return (
              <button
                key={p.section_key}
                type="button"
                role="listitem"
                onClick={() => onPick(p.section_key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs bg-background/70",
                  "hover:bg-background transition-colors",
                  activeKey === p.section_key && "ring-2 ring-primary/50",
                  c.tone === "ok" && "border-emerald-300",
                  c.tone === "bad" && "border-rose-300",
                  c.tone === "warn" && "border-amber-300",
                )}
              >
                {c.tone === "ok" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : c.tone === "idle" ? (
                  <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <AlertTriangle
                    className={cn(
                      "h-3.5 w-3.5",
                      c.tone === "bad" ? "text-rose-600" : "text-amber-600",
                    )}
                  />
                )}
                <span className="font-medium">{p.label}</span>
                <span
                  className={cn(
                    c.tone === "ok" && "text-emerald-700",
                    c.tone === "bad" && "text-rose-700",
                    c.tone === "warn" && "text-amber-700",
                    c.tone === "idle" && "text-muted-foreground",
                  )}
                >
                  {c.text}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {stage === "open" && !allTallied && pending.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Waiting on: {pending.map((p) => p.label).join(", ")}
        </p>
      )}
    </div>
  );
}

export function CashSignoffDialog({
  action,
  businessDate,
  points,
  busy,
  onClose,
  onConfirm,
}: {
  action: CashSignoffAction | null;
  businessDate: string;
  points: CashPointStatus[];
  busy: boolean;
  onClose: () => void;
  onConfirm: (a: CashSignoffAction) => void;
}) {
  const total = points.reduce((a, p) => a + (p.counted ?? 0), 0);
  return (
    <AlertDialog open={action !== null} onOpenChange={(o) => !busy && !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {action === "check" && "Mark this day as checked?"}
            {action === "approve" && "Approve this day?"}
            {action === "sendback" && "Send back for changes?"}
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
                <p>
                  {points.length} cash {points.length === 1 ? "point" : "points"} tallied · Cash
                  counted <strong className="text-foreground">{inr(total)}</strong>
                </p>
              )}
              {action === "check" && (
                <p>
                  After checking, the cash points are locked. Only an approver can send the day back
                  for changes. Your name and the time are recorded.
                </p>
              )}
              {action === "approve" && (
                <p>
                  After approval only the admin can reopen this day. Your name and the time are
                  recorded.
                </p>
              )}
              {action === "sendback" && (
                <p>The check is removed and the cash points can be edited again.</p>
              )}
              {action === "reopen" && (
                <p>The approval is removed and the day goes back to &quot;checked&quot;.</p>
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

/** Turns a database error from the sign-off or save functions into plain words. */
export function plainError(message: string): string {
  const m = message.replace(
    /^.*?(NOT_TALLIED|NOT_ALLOWED|ALREADY_CHECKED|ALREADY_APPROVED|NOT_CHECKED|NOT_APPROVED|FUTURE_DATE|NO_SECTIONS|DAY_CHECKED)/s,
    "$1",
  );
  if (m.startsWith("NOT_TALLIED")) return `Not tallied yet: ${m.split(":")[1]?.trim() ?? ""}`;
  if (m.startsWith("NOT_ALLOWED")) return "You don't have permission to do this.";
  if (m.startsWith("ALREADY_CHECKED")) return "This day was already checked.";
  if (m.startsWith("ALREADY_APPROVED")) return "This day is already approved.";
  if (m.startsWith("NOT_CHECKED")) return "This day has not been checked yet.";
  if (m.startsWith("NOT_APPROVED")) return "This day is not approved.";
  if (m.startsWith("FUTURE_DATE")) return "A future day cannot be checked.";
  if (m.startsWith("NO_SECTIONS")) return "There are no cash points to check.";
  if (m.startsWith("DAY_CHECKED")) return m.replace(/^DAY_CHECKED:\s*/, "");
  return message;
}
