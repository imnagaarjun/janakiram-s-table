import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { computeBill, type BillLine } from "@/lib/billing";
import { inr } from "@/lib/gst";

type PayMode = "cash" | "upi" | "card" | "other";
interface DraftPayment {
  key: string;
  mode: PayMode;
  amount: string;
  ref_no: string;
}

export interface TakeawaySettleResult {
  kot_no: number;
  invoice_no: string;
  total: number;
  tendered: number;
  change: number;
  base: number;
  cgst: number;
  sgst: number;
  service_charge: number;
  discount: number;
  round_off: number;
}

export function TakeawaySettleDialog({
  open,
  onOpenChange,
  sessionId,
  lines,
  draftItems,
  kotNote,
  serviceChargePctDefault,
  onSettled,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sessionId: string;
  lines: BillLine[];
  draftItems: { menu_item_id: string; qty: number; note: string | null }[];
  kotNote: string | null;
  serviceChargePctDefault: number;
  onSettled: (r: TakeawaySettleResult) => void;
}) {
  const [svcPct, setSvcPct] = useState<number>(serviceChargePctDefault);
  const [discAmt, setDiscAmt] = useState("");
  const [discPct, setDiscPct] = useState("");
  const [discReason, setDiscReason] = useState("");
  const [complimentary, setComplimentary] = useState(false);
  const [managerPin, setManagerPin] = useState("");
  const [notes, setNotes] = useState("");
  const [payments, setPayments] = useState<DraftPayment[]>([
    { key: crypto.randomUUID(), mode: "cash", amount: "", ref_no: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const defaultsSet = useRef(false);

  useEffect(() => {
    if (open) {
      setSvcPct(serviceChargePctDefault);
      setDiscAmt("");
      setDiscPct("");
      setDiscReason("");
      setComplimentary(false);
      setManagerPin("");
      setNotes("");
      setPayments([{ key: crypto.randomUUID(), mode: "cash", amount: "", ref_no: "" }]);
      defaultsSet.current = false;
    }
  }, [open, serviceChargePctDefault]);

  const totals = useMemo(
    () =>
      computeBill(lines, {
        service_charge_pct: svcPct || 0,
        discount_amt: Number(discAmt) || 0,
        discount_pct: Number(discPct) || 0,
        complimentary,
      }),
    [lines, svcPct, discAmt, discPct, complimentary],
  );

  useEffect(() => {
    if (!open) return;
    if (totals.total > 0 && !defaultsSet.current) {
      defaultsSet.current = true;
      setPayments((prev) =>
        prev.length === 1 && prev[0].mode === "cash" && prev[0].amount === ""
          ? [{ ...prev[0], amount: totals.total.toFixed(2) }]
          : prev,
      );
    }
  }, [open, totals.total]);

  const tendered = useMemo(
    () => payments.reduce((s, p) => s + (Number(p.amount) || 0), 0),
    [payments],
  );
  const balance = totals.total - tendered;

  function setField(k: string, field: keyof DraftPayment, v: string) {
    setPayments((ps) => ps.map((p) => (p.key === k ? { ...p, [field]: v } : p)));
  }
  function addPayment() {
    setPayments((p) => [...p, { key: crypto.randomUUID(), mode: "upi", amount: "", ref_no: "" }]);
  }
  function removePayment(k: string) {
    setPayments((ps) => ps.filter((p) => p.key !== k));
  }
  function fillExactCash() {
    setPayments([{ key: crypto.randomUUID(), mode: "cash", amount: totals.total.toFixed(2), ref_no: "" }]);
  }

  async function submit() {
    if (draftItems.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    setSubmitting(true);
    try {
      const params = {
        service_charge_pct: svcPct || 0,
        discount_amt: Number(discAmt) || 0,
        discount_pct: Number(discPct) || 0,
        discount_reason: discReason,
        complimentary,
        manager_pin: managerPin,
        notes,
      };
      const payArr = complimentary
        ? []
        : payments
            .filter((p) => Number(p.amount) > 0)
            .map((p) => ({ mode: p.mode, amount: Number(p.amount), ref_no: p.ref_no || null }));
      const { data, error } = await supabase.rpc("settle_takeaway", {
        _session_id: sessionId,
        _items: draftItems,
        _kot_note: kotNote ?? "",
        _params: params,
        _payments: payArr,
      });
      if (error) throw error;
      onSettled(data as unknown as TakeawaySettleResult);
    } catch (e) {
      toast.error(humanError((e as Error).message ?? "Settle failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Takeaway · Collect payment & send KOT</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm tabular-nums">
            <Row k="Taxable" v={inr(totals.base - totals.service_charge)} />
            {totals.service_charge > 0 && <Row k={`Service (${svcPct}%)`} v={inr(totals.service_charge)} />}
            <Row k="CGST" v={inr(totals.cgst)} />
            <Row k="SGST" v={inr(totals.sgst)} />
            {totals.discount > 0 && <Row k="Discount" v={`− ${inr(totals.discount)}`} />}
            <Row k="Round off" v={inr(totals.round_off)} />
            <div className="border-t border-border pt-1.5 mt-1 flex justify-between">
              <span className="font-bold">Total</span>
              <span className="font-bold text-xl">{inr(totals.total)}</span>
            </div>
          </div>

          <details className="rounded-lg border p-2">
            <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
              Adjustments (service / discount / complimentary)
            </summary>
            <div className="pt-2 grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Service %</Label>
                <Input
                  inputMode="decimal"
                  value={svcPct === 0 ? "" : String(svcPct)}
                  onChange={(e) => setSvcPct(Number(e.target.value) || 0)}
                  placeholder="0"
                />
              </div>
              <div />
              <div>
                <Label className="text-xs">Discount ₹</Label>
                <Input
                  inputMode="decimal"
                  value={discAmt}
                  onChange={(e) => {
                    setDiscAmt(e.target.value);
                    if (e.target.value) setDiscPct("");
                  }}
                  disabled={complimentary}
                />
              </div>
              <div>
                <Label className="text-xs">Discount %</Label>
                <Input
                  inputMode="decimal"
                  value={discPct}
                  onChange={(e) => {
                    setDiscPct(e.target.value);
                    if (e.target.value) setDiscAmt("");
                  }}
                  disabled={complimentary}
                />
              </div>
              {(totals.discount > 0 || complimentary || totals.service_charge > 0) && (
                <>
                  <div className="col-span-2">
                    <Label className="text-xs">Reason {complimentary || totals.discount > 0 ? "*" : ""}</Label>
                    <Input value={discReason} onChange={(e) => setDiscReason(e.target.value)} placeholder="e.g. Loyal customer" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Manager PIN *</Label>
                    <Input
                      inputMode="numeric"
                      maxLength={4}
                      value={managerPin}
                      onChange={(e) => setManagerPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="••••"
                    />
                  </div>
                </>
              )}
              <div className="col-span-2 flex items-center justify-between pt-1">
                <Label htmlFor="comp-ta" className="text-sm">Mark complimentary</Label>
                <Switch id="comp-ta" checked={complimentary} onCheckedChange={setComplimentary} />
              </div>
            </div>
          </details>

          {!complimentary && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Payments</div>
                <Button variant="ghost" size="sm" onClick={fillExactCash}>Exact cash</Button>
              </div>
              {payments.map((p) => (
                <div key={p.key} className="grid grid-cols-[110px_1fr_auto] gap-2 items-end">
                  <div>
                    <Label className="text-xs">Mode</Label>
                    <Select value={p.mode} onValueChange={(v) => setField(p.key, "mode", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="upi">UPI</SelectItem>
                        <SelectItem value="card">Card</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Amount ₹</Label>
                    <Input inputMode="decimal" value={p.amount} onChange={(e) => setField(p.key, "amount", e.target.value)} />
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removePayment(p.key)} disabled={payments.length === 1}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  {p.mode !== "cash" && (
                    <div className="col-span-3">
                      <Label className="text-xs">Reference / Txn No</Label>
                      <Input value={p.ref_no} onChange={(e) => setField(p.key, "ref_no", e.target.value)} placeholder="optional" />
                    </div>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addPayment} className="w-full">
                <Plus className="h-4 w-4 mr-1" /> Add payment
              </Button>
              <div className="border-t pt-2 text-sm tabular-nums space-y-1">
                <Row k="Tendered" v={inr(tendered)} />
                <Row
                  k={balance > 0 ? "Balance due" : "Change"}
                  v={
                    <span className={balance > 0 ? "text-destructive font-bold" : "text-emerald-600 font-bold"}>
                      {inr(Math.abs(balance))}
                    </span>
                  }
                />
              </div>
            </div>
          )}

          <Button
            size="lg"
            className="w-full h-14 text-base font-bold"
            onClick={submit}
            disabled={submitting || draftItems.length === 0}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {complimentary ? "Mark complimentary & send KOT" : `Settle ${inr(totals.total)} & Send KOT`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}

function humanError(msg: string): string {
  if (msg.includes("BAD_PIN")) return "Invalid manager PIN";
  if (msg.includes("NOT_MANAGER")) return "PIN is not for a manager";
  if (msg.includes("PIN_REQUIRED")) return "Manager PIN required";
  if (msg.includes("REASON_REQUIRED")) return "Reason required";
  if (msg.includes("EMPTY_BILL") || msg.includes("EMPTY_KOT")) return "No items to bill";
  if (msg.includes("UNDERPAID")) return "Tendered amount is less than total";
  if (msg.includes("PAYMENTS_REQUIRED")) return "Add at least one payment";
  if (msg.includes("INSUFFICIENT_STOCK")) return "Not enough stock for one of the items";
  if (msg.includes("ITEM_86")) return "An item is marked 86 (unavailable)";
  if (msg.includes("ITEM_INACTIVE")) return "An item is inactive";
  if (msg.includes("NOT_TAKEAWAY")) return "Session is not a takeaway";
  if (msg.includes("SESSION_CLOSED")) return "Session is already closed";
  return msg;
}
