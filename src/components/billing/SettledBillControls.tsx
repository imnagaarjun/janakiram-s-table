import { useState } from "react";
import { Loader2, Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { inr } from "@/lib/gst";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type PayMode = "cash" | "upi" | "card" | "other";
export interface BillPayment {
  mode: string;
  amount: number;
  ref_no: string | null;
}

interface Props {
  invoiceId: string;
  total: number;
  payments: BillPayment[];
  billOut: boolean;
  paymentEdits?: number;
  /** Called after a successful change so the parent can reload. */
  onChanged: () => void;
}

interface DraftPayment {
  key: string;
  mode: PayMode;
  amount: string;
  ref_no: string;
}

/**
 * Post-settlement controls for a settled invoice:
 *  - "Bill out" toggle (records whether the customer took the physical bill).
 *  - "Change payment mode" editor. Admins may change any number of times;
 *    cashiers / opted-in users may change exactly once (enforced server-side).
 */
export function SettledBillControls({ invoiceId, total, payments, billOut, paymentEdits = 0, onChanged }: Props) {
  const { hasRole, profile } = useAuth();
  const isAdmin = hasRole("admin");
  const mayEditPayment =
    isAdmin || hasRole("cashier") || Boolean(profile?.can_edit_payment);
  // Non-admins get one edit per bill, ever.
  const editUsedUp = !isAdmin && paymentEdits >= 1;

  const [savingOut, setSavingOut] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<DraftPayment[]>([]);

  async function toggleBillOut(next: boolean) {
    setSavingOut(true);
    const { error } = await db.rpc("set_bill_out", { _invoice_id: invoiceId, _bill_out: next });
    setSavingOut(false);
    if (error) toast.error(error.message);
    else {
      toast.success(next ? "Marked bill out" : "Bill out cleared");
      onChanged();
    }
  }

  function openEditor() {
    setDraft(
      payments.length
        ? payments.map((p) => ({
            key: crypto.randomUUID(),
            mode: (["cash", "upi", "card", "other"].includes(p.mode) ? p.mode : "other") as PayMode,
            amount: Number(p.amount).toFixed(2),
            ref_no: p.ref_no ?? "",
          }))
        : [{ key: crypto.randomUUID(), mode: "cash", amount: total.toFixed(2), ref_no: "" }],
    );
    setEditing(true);
  }

  const draftTotal = draft.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const mismatch = total > 0 && Math.abs(draftTotal - total) > 0.01;

  async function savePayments() {
    if (mismatch) {
      toast.error(`Payments must total ${inr(total)}`);
      return;
    }
    setSaving(true);
    const { error } = await db.rpc("change_payment_modes", {
      _invoice_id: invoiceId,
      _payments: draft.map((p) => ({ mode: p.mode, amount: Number(p.amount) || 0, ref_no: p.ref_no || null })),
    });
    setSaving(false);
    if (error) {
      toast.error(mapErr(error.message));
      return;
    }
    toast.success("Payment updated");
    setEditing(false);
    onChanged();
  }

  return (
    <div className="rounded-2xl border bg-surface p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Bill out</div>
          <div className="text-xs text-muted-foreground">Did the customer take the printed bill?</div>
        </div>
        <div className="flex items-center gap-2">
          {savingOut && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Switch checked={billOut} onCheckedChange={toggleBillOut} disabled={savingOut} />
        </div>
      </div>

      <div className="border-t border-border pt-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Payment mode</div>
          <div className="text-xs text-muted-foreground">
            {isAdmin
              ? "Admin can change any number of times."
              : editUsedUp
                ? "Already changed once — only an admin can change it now."
                : mayEditPayment
                  ? "You can change this once."
                  : "You don't have permission to change this."}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={openEditor}
          disabled={!mayEditPayment || editUsedUp}
        >
          <Pencil className="h-4 w-4 mr-1" /> Change
        </Button>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change payment mode</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {draft.map((p) => (
              <div key={p.key} className="flex gap-2 items-center">
                <Select value={p.mode} onValueChange={(v) => setDraft((d) => d.map((x) => (x.key === p.key ? { ...x, mode: v as PayMode } : x)))}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  inputMode="decimal"
                  className="flex-1"
                  value={p.amount}
                  onChange={(e) => setDraft((d) => d.map((x) => (x.key === p.key ? { ...x, amount: e.target.value } : x)))}
                  placeholder="Amount"
                />
                {draft.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setDraft((d) => d.filter((x) => x.key !== p.key))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setDraft((d) => [...d, { key: crypto.randomUUID(), mode: "upi", amount: "", ref_no: "" }])}>
              <Plus className="h-4 w-4 mr-1" /> Add split
            </Button>
            <div className={`text-sm flex justify-between tabular-nums ${mismatch ? "text-danger" : "text-muted-foreground"}`}>
              <span>Entered</span>
              <span>{inr(draftTotal)} / {inr(total)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button onClick={savePayments} disabled={saving || mismatch}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function mapErr(msg: string): string {
  if (msg.includes("ALREADY_EDITED")) return "This bill's payment was already changed once. Only an admin can change it again.";
  if (msg.includes("NOT_ALLOWED")) return "You don't have permission to change payment mode.";
  if (msg.includes("AMOUNT_MISMATCH")) return "Payments must add up to the bill total.";
  if (msg.includes("NOT_SETTLED")) return "Bill is not settled.";
  if (msg.includes("NOT_FOUND")) return "Bill not found.";
  return msg;
}
