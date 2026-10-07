import { useState } from "react";
import { Check, Loader2, Smartphone, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { vendorKind } from "@/components/vendors/vendorKind";
import { inr } from "./numbers";
import type { PayMode, Vendor } from "./model";

export function DuesView({
  owing,
  dues,
  onPay,
}: {
  owing: Vendor[];
  dues: Record<string, number>;
  onPay: (v: Vendor) => void;
}) {
  const sorted = [...owing].sort((a, b) => (dues[b.id] ?? 0) - (dues[a.id] ?? 0));
  const total = sorted.reduce((s, v) => s + (dues[v.id] ?? 0), 0);

  if (sorted.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
        <Check className="h-6 w-6 mx-auto mb-2 text-emerald-600" />
        All clear — no outstanding vendor dues.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-end justify-between rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 mb-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Total outstanding · {sorted.length} {sorted.length === 1 ? "vendor" : "vendors"}
          </div>
          <div className="text-2xl font-bold text-amber-700 tabular-nums leading-tight">
            {inr(total)}
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-surface divide-y divide-border overflow-hidden shadow-sm">
        {sorted.map((v) => {
          const kind = vendorKind(v);
          return (
            <div key={v.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className={`h-9 w-9 shrink-0 rounded-xl grid place-items-center ${kind.tile}`}>
                <kind.Icon className="h-[18px] w-[18px]" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate flex items-center gap-2">
                  {v.name}
                  {v.is_adhoc && (
                    <span className="shrink-0 rounded-full bg-muted px-2 py-px text-[10px] font-medium text-muted-foreground">
                      One-time
                    </span>
                  )}
                </div>
              </div>
              <div className="tabular-nums font-semibold text-amber-700">
                {inr(dues[v.id] ?? 0)}
              </div>
              <Button size="sm" onClick={() => onPay(v)}>
                Pay
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PaymentDialog({
  vendor,
  due,
  businessDate,
  onClose,
  onSaved,
}: {
  vendor: Vendor;
  due: number;
  businessDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PayMode>("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    const a = parseFloat(amount);
    if (!isFinite(a) || a <= 0) {
      toast.error("Enter a positive amount");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("record_vendor_payment", {
      _vendor_id: vendor.id,
      _business_date: businessDate,
      _amount: a,
      _mode: mode,
      _note: note,
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Payment recorded");
      onSaved();
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pay {vendor.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label>Amount</Label>
              <button
                type="button"
                onClick={() => setAmount(String(due))}
                className="text-xs text-primary font-medium hover:underline"
              >
                Pay full {inr(due)}
              </button>
            </div>
            <Input
              type="number"
              inputMode="decimal"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label className="block mb-1.5">Mode</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={mode === "cash" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setMode("cash")}
              >
                <Wallet className="h-3.5 w-3.5 mr-1" /> Cash
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "online" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setMode("online")}
              >
                <Smartphone className="h-3.5 w-3.5 mr-1" /> Online
              </Button>
            </div>
          </div>
          <div>
            <Label className="block mb-1.5">Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="text-xs text-muted-foreground">
            Date: <strong>{businessDate}</strong>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
