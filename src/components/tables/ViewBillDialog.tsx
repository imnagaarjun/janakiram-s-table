import { useEffect, useRef, useState } from "react";
import { Loader2, Printer, Search } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { inr } from "@/lib/gst";
import { printBill } from "@/lib/print-bill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SettledBillControls, type BillPayment } from "@/components/billing/SettledBillControls";

interface LoadedInvoice {
  id: string;
  invoice_no: string;
  issued_at: string;
  status: string;
  base: number;
  cgst: number;
  sgst: number;
  service_charge: number;
  discount: number;
  round_off: number;
  total: number;
  bill_out: boolean;
  payment_edits: number;
  session_id: string;
}
interface Restaurant {
  id: string; name: string; address: string | null; gstin: string | null; fssai: string | null; phone: string | null;
}
interface ReprintLine { name: string; qty: number; inclusive_price: number; line_total: number }

export function ViewBillDialog({ open, onOpenChange, restaurantId, initialInvoiceNo }: { open: boolean; onOpenChange: (v: boolean) => void; restaurantId: string | null; initialInvoiceNo?: string }) {
  const [billNo, setBillNo] = useState("");
  const autoLoaded = useRef<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [inv, setInv] = useState<LoadedInvoice | null>(null);
  const [payments, setPayments] = useState<BillPayment[]>([]);
  const [session, setSession] = useState<{ table_code: string | null; channel: string; pax: number } | null>(null);
  const [rest, setRest] = useState<Restaurant | null>(null);
  const [lines, setLines] = useState<ReprintLine[]>([]);

  async function loadInvoice(invoiceId: string) {
    const [invRes, payRes, restRes] = await Promise.all([
      db.from("invoices").select("*").eq("id", invoiceId).maybeSingle(),
      db.from("payments").select("mode,amount,ref_no").eq("invoice_id", invoiceId),
      restaurantId
        ? db.from("restaurants").select("id,name,address,gstin,fssai,phone").eq("id", restaurantId).maybeSingle()
        : db.from("restaurants").select("id,name,address,gstin,fssai,phone").limit(1).maybeSingle(),
    ]);
    const invoice = invRes.data as LoadedInvoice | null;
    if (!invoice) { toast.error("Bill not found"); return; }
    setInv(invoice);
    setPayments((payRes.data ?? []) as BillPayment[]);
    setRest(restRes.data as Restaurant | null);

    // Session + items (for reprint)
    const { data: s } = await db
      .from("order_sessions").select("table_code,channel,pax").eq("id", invoice.session_id).maybeSingle();
    setSession(s as { table_code: string | null; channel: string; pax: number } | null);

    const { data: kots } = await db.from("kots").select("id").eq("session_id", invoice.session_id);
    const kotIds = ((kots ?? []) as { id: string }[]).map((k) => k.id);
    if (kotIds.length) {
      const { data: ki } = await db.from("kot_items").select("menu_item_id,qty,status").in("kot_id", kotIds);
      const items = ((ki ?? []) as { menu_item_id: string; qty: number; status: string }[]).filter((i) => i.status !== "void");
      const agg = new Map<string, number>();
      items.forEach((i) => agg.set(i.menu_item_id, (agg.get(i.menu_item_id) ?? 0) + Number(i.qty)));
      const ids = Array.from(agg.keys());
      const [miRes, mpRes] = await Promise.all([
        db.from("menu_items").select("id,name").in("id", ids),
        db.from("menu_prices").select("menu_item_id,inclusive_price").in("menu_item_id", ids).eq("channel_key", (s as { channel?: string } | null)?.channel ?? "dinein"),
      ]);
      const nameMap = new Map<string, string>(((miRes.data ?? []) as { id: string; name: string }[]).map((m) => [m.id, m.name]));
      const priceMap = new Map<string, number>(((mpRes.data ?? []) as { menu_item_id: string; inclusive_price: number }[]).map((p) => [p.menu_item_id, Number(p.inclusive_price)]));
      setLines(ids.map((id) => {
        const qty = agg.get(id) ?? 0;
        const price = priceMap.get(id) ?? 0;
        return { name: nameMap.get(id) ?? "Item", qty, inclusive_price: price, line_total: qty * price };
      }));
    } else {
      setLines([]);
    }
  }

  async function search() {
    if (!billNo.trim()) return;
    setSearching(true);
    setInv(null);
    const { data: id, error } = await db.rpc("find_invoice_by_no", { _invoice_no: billNo.trim() });
    if (error) { setSearching(false); toast.error(error.message); return; }
    if (!id) { setSearching(false); toast.error("No bill with that number"); return; }
    await loadInvoice(id as string);
    setSearching(false);
  }

  // When opened with a specific bill number (from the Bill Records browser),
  // auto-load it once.
  useEffect(() => {
    if (open && initialInvoiceNo && autoLoaded.current !== initialInvoiceNo) {
      autoLoaded.current = initialInvoiceNo;
      setBillNo(initialInvoiceNo);
      (async () => {
        setSearching(true);
        const { data: id } = await db.rpc("find_invoice_by_no", { _invoice_no: initialInvoiceNo });
        if (id) await loadInvoice(id as string);
        setSearching(false);
      })();
    }
    if (!open) autoLoaded.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialInvoiceNo]);

  function reprint() {
    if (!inv || !rest) return;
    printBill({
      restaurant: rest,
      invoice_no: inv.invoice_no,
      issued_at: inv.issued_at,
      table_label: session?.table_code ? `Table ${session.table_code}` : "Takeaway",
      pax: session?.pax ?? 0,
      lines,
      totals: {
        base: inv.base, cgst: inv.cgst, sgst: inv.sgst, service_charge: inv.service_charge,
        discount: inv.discount, round_off: inv.round_off, total: inv.total,
      },
      payments: payments.map((p) => ({ mode: p.mode, amount: p.amount, ref_no: p.ref_no })),
      duplicate: true,
      paidMarker: inv.status === "settled",
    });
  }

  function reset() {
    setBillNo("");
    setInv(null);
    setPayments([]);
    setSession(null);
    setLines([]);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>View bill</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs mb-1 block">Bill number</Label>
            <div className="flex gap-2">
              <Input
                value={billNo}
                onChange={(e) => setBillNo(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") search(); }}
                placeholder="e.g. INV-0042"
              />
              <Button onClick={search} disabled={searching}>
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {inv && (
            <div className="space-y-3">
              <div className="rounded-xl border bg-surface p-3 text-sm">
                <div className="flex justify-between font-semibold">
                  <span>{inv.invoice_no}</span>
                  <span className="tabular-nums">{inr(inv.total)}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(inv.issued_at).toLocaleString()} · {session?.table_code ? `Table ${session.table_code}` : "Takeaway"}
                  {inv.status !== "settled" ? ` · ${inv.status}` : ""}
                </div>
                {payments.length > 0 && (
                  <div className="mt-2 border-t border-border pt-2 space-y-0.5">
                    {payments.map((p, i) => (
                      <div key={i} className="flex justify-between text-xs tabular-nums">
                        <span className="uppercase">{p.mode}{p.ref_no ? ` · ${p.ref_no}` : ""}</span>
                        <span>{inr(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {inv.status === "settled" && (
                <SettledBillControls
                  invoiceId={inv.id}
                  total={inv.total}
                  payments={payments}
                  billOut={inv.bill_out}
                  paymentEdits={inv.payment_edits}
                  onChanged={() => loadInvoice(inv.id)}
                />
              )}

              <Button variant="outline" className="w-full" onClick={reprint}>
                <Printer className="h-4 w-4 mr-1" /> Reprint
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
