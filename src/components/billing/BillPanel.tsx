import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Loader2, Plus, Trash2, Printer, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { db } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { useDeviceMode } from "@/hooks/use-device-mode";
import { useAuth } from "@/contexts/AuthContext";
import { computeBill, type BillLine } from "@/lib/billing";
import { inr } from "@/lib/gst";
import { printBill } from "@/lib/print-bill";
import { SettlementDialog } from "./SettlementDialog";

type Session = {
  id: string;
  table_code: string | null;
  channel: "dinein" | "takeaway";
  pax: number;
  status: string;
};
type KotItem = { id: string; kot_id: string; menu_item_id: string; qty: number; status: string };
type Kot = { id: string; session_id: string };
type MenuItem = { id: string; name: string };
type MenuPrice = { menu_item_id: string; inclusive_price: number; base_price: number; gst_rate: number };
type Restaurant = {
  id: string;
  name: string;
  address: string | null;
  gstin: string | null;
  fssai: string | null;
  phone: string | null;
  service_charge_pct: number;
  invoice_prefix: string;
};
type Invoice = {
  id: string;
  invoice_no: string;
  status: string;
  issued_at: string;
  base: number;
  cgst: number;
  sgst: number;
  service_charge: number;
  discount: number;
  round_off: number;
  total: number;
  complimentary: boolean;
};
type Payment = { mode: string; amount: number; ref_no: string | null };

type PayMode = "cash" | "upi" | "card" | "other";
interface DraftPayment {
  key: string;
  mode: PayMode;
  amount: string;
  ref_no: string;
}

export function BillPanel({ sessionId }: { sessionId: string }) {
  const nav = useNavigate();
  const mode = useDeviceMode();
  const { hasRole, profile } = useAuth();
  const waiterName = profile?.name ?? null;
  const isTablet = mode === "tablet";

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [lines, setLines] = useState<BillLine[]>([]);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [existingInvoice, setExistingInvoice] = useState<Invoice | null>(null);
  const [existingPayments, setExistingPayments] = useState<Payment[]>([]);

  // Inputs
  const [svcPct, setSvcPct] = useState<number>(0);
  const [discAmt, setDiscAmt] = useState<string>("");
  const [discPct, setDiscPct] = useState<string>("");
  const [discReason, setDiscReason] = useState("");
  const [complimentary, setComplimentary] = useState(false);
  const [managerPin, setManagerPin] = useState("");
  const [payments, setPayments] = useState<DraftPayment[]>([
    { key: crypto.randomUUID(), mode: "cash", amount: "", ref_no: "" },
  ]);
  const [notes, setNotes] = useState("");
  const defaultAmountSet = useRef(false);
  const [settling, setSettling] = useState(false);
  const [confirmation, setConfirmation] = useState<{
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
  } | null>(null);
  const [reopening, setReopening] = useState(false);
  const [reopenPin, setReopenPin] = useState("");
  const [reopenReason, setReopenReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [sRes, kRes, restRes, invRes] = await Promise.all([
      db.from("order_sessions").select("id,table_code,channel,pax,status").eq("id", sessionId).maybeSingle(),
      db.from("kots").select("id,session_id").eq("session_id", sessionId),
      db.from("restaurants").select("*").limit(1).maybeSingle(),
      db.from("invoices").select("*").eq("session_id", sessionId).eq("status", "settled").order("issued_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const s = sRes.data as Session | null;
    setSession(s);
    setRestaurant(restRes.data as Restaurant | null);
    setSvcPct((restRes.data as Restaurant | null)?.service_charge_pct ?? 0);

    const kots = (kRes.data ?? []) as Kot[];
    const kotIds = kots.map((k) => k.id);
    if (kotIds.length) {
      const { data: ki } = await db
        .from("kot_items")
        .select("id,kot_id,menu_item_id,qty,status")
        .in("kot_id", kotIds);
      const items = ((ki ?? []) as KotItem[]).filter((i) => i.status !== "void");

      // Aggregate qty per menu_item
      const agg = new Map<string, number>();
      items.forEach((i) => agg.set(i.menu_item_id, (agg.get(i.menu_item_id) ?? 0) + Number(i.qty)));
      const miIds = Array.from(agg.keys());
      const [miRes, mpRes] = await Promise.all([
        db.from("menu_items").select("id,name").in("id", miIds),
        db.from("menu_prices").select("menu_item_id,inclusive_price,base_price,gst_rate").in("menu_item_id", miIds).eq("channel_key", s?.channel ?? "dinein"),
      ]);
      const miMap: Record<string, MenuItem> = {};
      ((miRes.data ?? []) as MenuItem[]).forEach((m) => (miMap[m.id] = m));
      const mpMap: Record<string, MenuPrice> = {};
      ((mpRes.data ?? []) as MenuPrice[]).forEach((p) => (mpMap[p.menu_item_id] = p));
      const built: BillLine[] = miIds.map((id) => {
        const qty = agg.get(id) ?? 0;
        const p = mpMap[id];
        const inclusive = Number(p?.inclusive_price ?? 0);
        return {
          menu_item_id: id,
          name: miMap[id]?.name ?? "Item",
          qty,
          inclusive_price: inclusive,
          base_price: Number(p?.base_price ?? 0),
          gst_rate: Number(p?.gst_rate ?? 0),
          line_total: qty * inclusive,
        };
      });
      setLines(built);
    } else {
      setLines([]);
    }

    if (invRes.data) {
      const inv = invRes.data as Invoice;
      setExistingInvoice(inv);
      const { data: payRows } = await db.from("payments").select("mode,amount,ref_no").eq("invoice_id", inv.id);
      setExistingPayments(((payRows ?? []) as Payment[]));
    } else {
      setExistingInvoice(null);
      setExistingPayments([]);
    }
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

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
    if (!loading && totals.total > 0 && !defaultAmountSet.current) {
      defaultAmountSet.current = true;
      setPayments((prev) => {
        if (prev.length === 1 && prev[0].mode === "cash" && prev[0].amount === "") {
          return [{ ...prev[0], amount: totals.total.toFixed(2) }];
        }
        return prev;
      });
    }
  }, [loading, totals.total]);

  const tendered = useMemo(
    () => payments.reduce((s, p) => s + (Number(p.amount) || 0), 0),
    [payments],
  );
  const balance = totals.total - tendered;

  function addPayment() {
    setPayments((p) => [...p, { key: crypto.randomUUID(), mode: "upi", amount: "", ref_no: "" }]);
  }
  function setPayField(k: string, field: keyof DraftPayment, v: string) {
    setPayments((ps) => ps.map((p) => (p.key === k ? { ...p, [field]: v } : p)));
  }
  function removePayment(k: string) {
    setPayments((ps) => ps.filter((p) => p.key !== k));
  }
  function fillExactCash() {
    setPayments([{ key: crypto.randomUUID(), mode: "cash", amount: totals.total.toFixed(2), ref_no: "" }]);
  }

  async function settle() {
    if (lines.length === 0 && !complimentary) {
      toast.error("No items to bill");
      return;
    }
    setSettling(true);
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
      const { data, error } = await supabase.rpc("settle_bill", {
        _session_id: sessionId,
        _params: params,
        _payments: payArr,
      });
      if (error) throw error;
      const r = data as {
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
      };
      setConfirmation(r);
      toast.success(`Invoice ${r.invoice_no} settled`);
      await load();
    } catch (e) {
      const msg = (e as Error).message ?? "Settle failed";
      toast.error(humanError(msg));
    } finally {
      setSettling(false);
    }
  }

  async function doReopen() {
    if (!existingInvoice) return;
    if (!reopenReason.trim() || reopenPin.length !== 4) {
      toast.error("Reason + 4-digit manager PIN required");
      return;
    }
    const { error } = await supabase.rpc("reopen_invoice", {
      _invoice_id: existingInvoice.id,
      _manager_pin: reopenPin,
      _reason: reopenReason,
    });
    if (error) {
      toast.error(humanError(error.message));
      return;
    }
    toast.success("Bill re-opened");
    setReopening(false);
    setReopenPin("");
    setReopenReason("");
    nav({ to: "/order/$sessionId", params: { sessionId } });
  }

  function reprint() {
    if (!existingInvoice || !restaurant || !session) return;
    printBill({
      restaurant,
      invoice_no: existingInvoice.invoice_no,
      issued_at: existingInvoice.issued_at,
      table_label: session.table_code ? `Table ${session.table_code}` : "Takeaway",
      pax: session.pax,
      lines,
      totals: {
        base: existingInvoice.base,
        cgst: existingInvoice.cgst,
        sgst: existingInvoice.sgst,
        service_charge: existingInvoice.service_charge,
        discount: existingInvoice.discount,
        round_off: existingInvoice.round_off,
        total: existingInvoice.total,
      },
      payments: existingPayments,
      duplicate: true,
      waiterName,
    });
  }

  function printFresh() {
    if (!confirmation || !restaurant || !session) return;
    printBill({
      restaurant,
      invoice_no: confirmation.invoice_no,
      issued_at: new Date().toISOString(),
      table_label: session.table_code ? `Table ${session.table_code}` : "Takeaway",
      pax: session.pax,
      lines,
      totals: {
        base: confirmation.base,
        cgst: confirmation.cgst,
        sgst: confirmation.sgst,
        service_charge: confirmation.service_charge,
        discount: confirmation.discount,
        round_off: confirmation.round_off,
        total: confirmation.total,
      },
      payments: payments
        .filter((p) => Number(p.amount) > 0)
        .map((p) => ({ mode: p.mode, amount: Number(p.amount), ref_no: p.ref_no || null })),
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) return <div className="p-6">Session not found.</div>;

  // ============= Already settled view (reprint / reopen) =============
  if (existingInvoice && session.status === "settled") {
    return (
      <div className="min-h-screen flex flex-col">
        <Header session={session} title={`Invoice ${existingInvoice.invoice_no}`} onBack={() => nav({ to: "/tables" })} />
        <div className="p-4 max-w-xl mx-auto w-full space-y-4">
          <div className="rounded-2xl border bg-surface p-4 shadow-sm">
            <SummaryRows totals={existingInvoice} />
            <div className="border-t border-border mt-2 pt-2 flex items-center justify-between">
              <span className="font-bold">Total</span>
              <span className="font-bold text-2xl tabular-nums">{inr(existingInvoice.total)}</span>
            </div>
          </div>
          {existingPayments.length > 0 && (
            <div className="rounded-2xl border bg-surface p-4 shadow-sm">
              <div className="text-sm font-semibold mb-2">Payments</div>
              {existingPayments.map((p, i) => (
                <div key={i} className="flex justify-between text-sm tabular-nums">
                  <span className="uppercase">{p.mode}{p.ref_no ? ` · ${p.ref_no}` : ""}</span>
                  <span>{inr(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={reprint}>
              <Printer className="h-4 w-4 mr-1" /> Reprint
            </Button>
            {hasRole("admin", "manager") && (
              <Button variant="destructive" className="flex-1" onClick={() => setReopening(true)}>
                <Undo2 className="h-4 w-4 mr-1" /> Re-open bill
              </Button>
            )}
          </div>
        </div>

        <Dialog open={reopening} onOpenChange={setReopening}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Re-open settled bill</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">
                This voids the invoice and re-opens the order session. Allowed only on the same business day.
              </div>
              <div>
                <Label className="text-xs">Reason</Label>
                <Input value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Manager PIN</Label>
                <Input
                  inputMode="numeric"
                  maxLength={4}
                  value={reopenPin}
                  onChange={(e) => setReopenPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="••••"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setReopening(false)}>Cancel</Button>
              <Button onClick={doReopen}>Re-open</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ============= Active bill view =============
  const linesPanel = (
    <div className="space-y-3">
      <div className="rounded-2xl border bg-surface shadow-sm overflow-hidden">
        <div className="px-3 py-2 bg-muted text-xs font-semibold flex justify-between">
          <span>Item</span>
          <span>Qty × Rate · Total</span>
        </div>
        <div className="divide-y divide-border">
          {lines.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground text-center">No items on this bill</div>
          )}
          {lines.map((l) => (
            <div key={l.menu_item_id} className="flex items-start justify-between px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{l.name}</div>
                <div className="text-[11px] text-muted-foreground">GST {l.gst_rate}%</div>
              </div>
              <div className="text-right shrink-0 tabular-nums">
                <div>{l.qty} × {l.inclusive_price.toFixed(2)}</div>
                <div className="font-semibold">{inr(l.line_total)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border bg-surface p-3 shadow-sm space-y-1.5 text-sm tabular-nums">
        <Row k="Taxable" v={inr(totals.base - totals.service_charge)} />
        {totals.service_charge > 0 && <Row k={`Service (${svcPct}%)`} v={inr(totals.service_charge)} />}
        <Row k="CGST" v={inr(totals.cgst)} />
        <Row k="SGST" v={inr(totals.sgst)} />
        {totals.discount > 0 && <Row k="Discount" v={`− ${inr(totals.discount)}`} />}
        <Row k="Round off" v={inr(totals.round_off)} />
        <div className="border-t border-border pt-1.5 mt-1.5 flex justify-between">
          <span className="font-bold">Total</span>
          <span className="font-bold text-2xl">{inr(totals.total)}</span>
        </div>
      </div>
    </div>
  );

  const actionsPanel = (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-surface p-3 shadow-sm space-y-3">
        <div className="text-sm font-semibold">Adjustments</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Service charge %</Label>
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
        </div>
        {(totals.discount > 0 || complimentary || totals.service_charge > 0) && (
          <div className="space-y-2">
            <div>
              <Label className="text-xs">Reason {complimentary || totals.discount > 0 ? "*" : ""}</Label>
              <Input value={discReason} onChange={(e) => setDiscReason(e.target.value)} placeholder="e.g. Loyal customer" />
            </div>
            <div>
              <Label className="text-xs">Manager PIN *</Label>
              <Input
                inputMode="numeric"
                maxLength={4}
                value={managerPin}
                onChange={(e) => setManagerPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="••••"
              />
            </div>
          </div>
        )}
        <div className="flex items-center justify-between pt-1">
          <Label htmlFor="comp" className="text-sm">Mark complimentary</Label>
          <Switch id="comp" checked={complimentary} onCheckedChange={setComplimentary} />
        </div>
      </div>

      {!complimentary && (
        <div className="rounded-2xl border bg-surface p-3 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Payments</div>
            <Button variant="ghost" size="sm" onClick={fillExactCash}>Exact cash</Button>
          </div>
          {payments.map((p) => (
            <div key={p.key} className="grid grid-cols-[110px_1fr_auto] gap-2 items-end">
              <div>
                <Label className="text-xs">Mode</Label>
                <Select value={p.mode} onValueChange={(v) => setPayField(p.key, "mode", v)}>
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
                <Input inputMode="decimal" value={p.amount} onChange={(e) => setPayField(p.key, "amount", e.target.value)} />
              </div>
              <Button variant="ghost" size="icon" onClick={() => removePayment(p.key)} disabled={payments.length === 1}>
                <Trash2 className="h-4 w-4" />
              </Button>
              {p.mode !== "cash" && (
                <div className="col-span-3">
                  <Label className="text-xs">Reference / Txn No</Label>
                  <Input value={p.ref_no} onChange={(e) => setPayField(p.key, "ref_no", e.target.value)} placeholder="optional" />
                </div>
              )}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addPayment} className="w-full">
            <Plus className="h-4 w-4 mr-1" /> Add payment
          </Button>
          <div className="border-t border-border pt-2 text-sm tabular-nums space-y-1">
            <Row k="Tendered" v={inr(tendered)} />
            <Row
              k={balance > 0 ? "Balance due" : "Change"}
              v={<span className={balance > 0 ? "text-destructive font-bold" : "text-emerald-600 font-bold"}>{inr(Math.abs(balance))}</span>}
            />
          </div>
        </div>
      )}

      <Button
        size="lg"
        className="w-full h-14 text-base font-bold"
        onClick={settle}
        disabled={settling || (!complimentary && lines.length === 0)}
      >
        {settling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        {complimentary ? "Mark complimentary" : `Settle · ${inr(totals.total)}`}
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header session={session} title="Bill" onBack={() => nav({ to: "/tables" })} />
      {isTablet ? (
        <div className="flex-1 grid grid-cols-[1.2fr_1fr] gap-4 p-4 overflow-hidden">
          <div className="overflow-y-auto pr-1">{linesPanel}</div>
          <div className="overflow-y-auto pr-1">{actionsPanel}</div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {linesPanel}
          {actionsPanel}
        </div>
      )}

      <SettlementDialog
        open={!!confirmation}
        result={confirmation}
        onClose={() => {
          setConfirmation(null);
          nav({ to: "/tables" });
        }}
        onPrint={printFresh}
      />
    </div>
  );
}

function Header({ session, title, onBack }: { session: Session; title: string; onBack: () => void }) {
  return (
    <header className="border-b bg-surface px-3 py-2 flex items-center gap-2 shadow-sm sticky top-0 z-10">
      <Button variant="ghost" size="icon" onClick={onBack}>
        <ChevronLeft className="h-5 w-5" />
      </Button>
      <div className="flex-1 min-w-0">
        <div className="font-bold leading-tight truncate">{title}</div>
        <div className="text-[11px] text-muted-foreground">
          {session.table_code ? `Table ${session.table_code}` : "Takeaway"} · {session.pax} pax · {session.channel === "dinein" ? "Dine-in" : "Takeaway"}
        </div>
      </div>
    </header>
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

function SummaryRows({ totals }: { totals: Invoice }) {
  return (
    <div className="space-y-1 tabular-nums text-sm">
      <Row k="Taxable" v={inr(totals.base - totals.service_charge)} />
      {totals.service_charge > 0 && <Row k="Service" v={inr(totals.service_charge)} />}
      <Row k="CGST" v={inr(totals.cgst)} />
      <Row k="SGST" v={inr(totals.sgst)} />
      {totals.discount > 0 && <Row k="Discount" v={`− ${inr(totals.discount)}`} />}
      <Row k="Round off" v={inr(totals.round_off)} />
    </div>
  );
}

function humanError(msg: string): string {
  if (msg.includes("BAD_PIN")) return "Invalid manager PIN";
  if (msg.includes("NOT_MANAGER")) return "PIN is not for a manager";
  if (msg.includes("PIN_REQUIRED")) return "Manager PIN required";
  if (msg.includes("REASON_REQUIRED")) return "Reason required";
  if (msg.includes("EMPTY_BILL")) return "No items to bill";
  if (msg.includes("UNDERPAID")) return "Tendered amount is less than total";
  if (msg.includes("OLD_INVOICE")) return "Only same-day invoices can be re-opened";
  if (msg.includes("NOT_SETTLED")) return "Invoice is not in a settled state";
  if (msg.includes("PAYMENTS_REQUIRED")) return "Add at least one payment";
  return msg;
}
