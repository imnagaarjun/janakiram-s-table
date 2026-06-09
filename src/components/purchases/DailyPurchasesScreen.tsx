import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Save,
  Lock,
  ChevronDown,
  ChevronRight,
  Wallet,
  Smartphone,
  Receipt,
  Calendar as CalendarIcon,
  IndianRupee,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { inr } from "@/lib/gst";
import { cn } from "@/lib/utils";

type PayMode = "cash" | "online";

interface Vendor {
  id: string;
  name: string;
  name_tamil: string | null;
  is_multi_product: boolean;
  default_category_id: string | null;
  is_active: boolean;
  display_order: number;
}

interface VendorProduct {
  id: string;
  vendor_id: string;
  name: string;
  unit: string;
  price_mode: "fixed" | "variable";
  fixed_price: number | null;
  is_active: boolean;
  display_order: number;
}

interface PurchaseLine {
  id: string;
  business_date: string;
  vendor_id: string;
  vendor_product_id: string | null;
  description: string | null;
  qty: number;
  unit_price: number;
  amount: number;
  pay_mode: PayMode;
  paid_amount: number;
  due_amount: number;
}

interface DraftLine {
  vendor_product_id: string | null;
  qty: string;
  unit_price: string;
  pay_mode: PayMode;
  paid_amount: string;
  description: string;
}

function todayIST(): string {
  const d = new Date();
  // Convert to IST (+05:30) date
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const ist = new Date(utc + 5.5 * 3600 * 1000);
  return ist.toISOString().slice(0, 10);
}

function num(s: string): number {
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

export function DailyPurchasesScreen() {
  const { profile } = useAuth();
  const [businessDate, setBusinessDate] = useState<string>(todayIST());
  const [tab, setTab] = useState("entry");
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [dues, setDues] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, DraftLine[]>>({});
  const [savingVendor, setSavingVendor] = useState<string | null>(null);
  const [payDialog, setPayDialog] = useState<Vendor | null>(null);

  const loadDues = useCallback(async (vList: Vendor[]) => {
    const map: Record<string, number> = {};
    await Promise.all(
      vList.map(async (v) => {
        const { data, error } = await supabase.rpc("vendor_due_balance", { _vendor_id: v.id });
        if (!error) map[v.id] = Number(data) || 0;
      }),
    );
    setDues(map);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [v, p, l] = await Promise.all([
      db
        .from("vendors")
        .select("*")
        .eq("is_active", true)
        .order("display_order")
        .order("name"),
      db
        .from("vendor_products")
        .select("*")
        .eq("is_active", true)
        .order("display_order")
        .order("name"),
      db.from("purchase_lines").select("*").eq("business_date", businessDate),
    ]);
    if (v.error) toast.error(v.error.message);
    setVendors(v.data ?? []);
    setProducts(p.data ?? []);
    setLines(l.data ?? []);

    // Build drafts: one row per product for multi-product vendors, one row for single-line
    const d: Record<string, DraftLine[]> = {};
    for (const ven of v.data ?? []) {
      const vLines = (l.data ?? []).filter((x: PurchaseLine) => x.vendor_id === ven.id);
      if (ven.is_multi_product) {
        const vProds = (p.data ?? []).filter((x: VendorProduct) => x.vendor_id === ven.id);
        d[ven.id] = vProds.map((pr: VendorProduct) => {
          const ex = vLines.find((x: PurchaseLine) => x.vendor_product_id === pr.id);
          return {
            vendor_product_id: pr.id,
            qty: ex ? String(ex.qty) : "",
            unit_price:
              pr.price_mode === "fixed"
                ? String(pr.fixed_price ?? 0)
                : ex
                  ? String(ex.unit_price)
                  : "",
            pay_mode: ex?.pay_mode ?? "cash",
            paid_amount: ex ? String(ex.paid_amount) : "",
            description: "",
          };
        });
      } else {
        const ex = vLines[0];
        d[ven.id] = [
          {
            vendor_product_id: null,
            qty: ex ? String(ex.qty) : "",
            unit_price: ex ? String(ex.unit_price) : "",
            pay_mode: ex?.pay_mode ?? "cash",
            paid_amount: ex ? String(ex.paid_amount) : "",
            description: ex?.description ?? "",
          },
        ];
      }
    }
    setDrafts(d);
    setLoading(false);
    loadDues(v.data ?? []);
  }, [businessDate, loadDues]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    let cash = 0;
    let online = 0;
    let due = 0;
    let gross = 0;
    for (const l of lines) {
      gross += Number(l.amount);
      due += Number(l.due_amount);
      if (l.pay_mode === "cash") cash += Number(l.paid_amount);
      else online += Number(l.paid_amount);
    }
    return { cash, online, due, gross };
  }, [lines]);

  function toggleExpand(id: string) {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function updateDraft(vendorId: string, idx: number, patch: Partial<DraftLine>) {
    setDrafts((d) => {
      const arr = [...(d[vendorId] ?? [])];
      arr[idx] = { ...arr[idx], ...patch };
      return { ...d, [vendorId]: arr };
    });
  }

  async function saveVendor(v: Vendor) {
    setSavingVendor(v.id);
    const rows = drafts[v.id] ?? [];
    const payload = rows
      .filter((r) => num(r.qty) > 0)
      .map((r) => ({
        vendor_product_id: r.vendor_product_id,
        qty: num(r.qty),
        unit_price: num(r.unit_price),
        pay_mode: r.pay_mode,
        paid_amount: num(r.paid_amount),
        description: r.description || null,
      }));
    const { error } = await supabase.rpc("save_vendor_day_purchases", {
      _business_date: businessDate,
      _vendor_id: v.id,
      _lines: payload,
    });
    setSavingVendor(null);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`${v.name} saved`);
      load();
    }
  }

  function vendorSummary(v: Vendor) {
    const vLines = lines.filter((l) => l.vendor_id === v.id);
    const amount = vLines.reduce((s, l) => s + Number(l.amount), 0);
    const paid = vLines.reduce((s, l) => s + Number(l.paid_amount), 0);
    const due = vLines.reduce((s, l) => s + Number(l.due_amount), 0);
    return { amount, paid, due, hasData: vLines.length > 0 };
  }

  function draftSummary(v: Vendor) {
    let amount = 0;
    let paid = 0;
    let cashTotal = 0;
    let onlineTotal = 0;
    for (const r of drafts[v.id] ?? []) {
      const q = num(r.qty);
      if (q <= 0) continue;
      const a = q * num(r.unit_price);
      amount += a;
      const p = Math.min(num(r.paid_amount), a);
      paid += p;
      if (r.pay_mode === "cash") cashTotal += p;
      else onlineTotal += p;
    }
    return { amount, paid, due: amount - paid, cashTotal, onlineTotal };
  }

  if (!profile) return null;

  return (
    <div>
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <TabsList>
            <TabsTrigger value="entry">Day entry</TabsTrigger>
            <TabsTrigger value="dues">Vendor dues</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <Input
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
              className="w-[160px]"
            />
          </div>
        </div>

        <TabsContent value="entry" className="mt-0">
          {/* Roll-up cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <SummaryCard
              icon={<Receipt className="h-4 w-4" />}
              label="Gross purchases"
              value={inr(totals.gross)}
            />
            <SummaryCard
              icon={<Wallet className="h-4 w-4 text-emerald-600" />}
              label="Cash paid"
              value={inr(totals.cash)}
              tone="cash"
            />
            <SummaryCard
              icon={<Smartphone className="h-4 w-4 text-sky-600" />}
              label="Online paid"
              value={inr(totals.online)}
              tone="online"
            />
            <SummaryCard
              icon={<IndianRupee className="h-4 w-4 text-amber-600" />}
              label="Due today"
              value={inr(totals.due)}
              tone="due"
            />
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : vendors.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
              No active vendors. Add some under More → Vendors & products.
            </div>
          ) : (
            <div className="space-y-2">
              {vendors.map((v) => {
                const sum = vendorSummary(v);
                const draft = draftSummary(v);
                const open = expanded.has(v.id);
                const vProds = products.filter((p) => p.vendor_id === v.id);
                const single = drafts[v.id]?.[0];
                return (
                  <div
                    key={v.id}
                    className="rounded-2xl border border-border bg-surface overflow-hidden shadow-sm"
                  >
                    <div className="flex items-center gap-3 p-3">
                      <button
                        onClick={() => toggleExpand(v.id)}
                        className="p-1.5 rounded hover:bg-accent shrink-0"
                      >
                        {open ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{v.name}</span>
                          {v.name_tamil && (
                            <span className="text-sm text-muted-foreground truncate">
                              {v.name_tamil}
                            </span>
                          )}
                          {v.is_multi_product && (
                            <Badge variant="secondary" className="text-[10px]">
                              {vProds.length} items
                            </Badge>
                          )}
                          {sum.hasData && (
                            <Badge variant="outline" className="text-[10px]">
                              saved
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Amount {inr(sum.amount)} · Paid {inr(sum.paid)} · Due {inr(sum.due)}
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground shrink-0 hidden sm:block">
                        Carry-forward due
                        <div className="text-amber-700 font-semibold text-sm">
                          {inr(dues[v.id] ?? 0)}
                        </div>
                      </div>
                    </div>

                    {open && (
                      <div className="border-t border-border bg-muted/30 p-3 space-y-3">
                        {v.is_multi_product ? (
                          <MultiProductGrid
                            vendor={v}
                            products={vProds}
                            draft={drafts[v.id] ?? []}
                            onChange={(i, p) => updateDraft(v.id, i, p)}
                          />
                        ) : (
                          single && (
                            <SingleLineRow
                              draft={single}
                              onChange={(p) => updateDraft(v.id, 0, p)}
                            />
                          )
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
                          <div className="text-xs text-muted-foreground space-x-3">
                            <span>
                              Amount: <strong>{inr(draft.amount)}</strong>
                            </span>
                            <span className="text-emerald-700">
                              Cash: <strong>{inr(draft.cashTotal)}</strong>
                            </span>
                            <span className="text-sky-700">
                              Online: <strong>{inr(draft.onlineTotal)}</strong>
                            </span>
                            <span className="text-amber-700">
                              Due: <strong>{inr(draft.due)}</strong>
                            </span>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => saveVendor(v)}
                            disabled={savingVendor === v.id}
                          >
                            {savingVendor === v.id ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4 mr-2" />
                            )}
                            Save vendor day
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="dues" className="mt-0">
          <DuesView vendors={vendors} dues={dues} onPay={(v) => setPayDialog(v)} />
        </TabsContent>
      </Tabs>

      {payDialog && (
        <PaymentDialog
          vendor={payDialog}
          businessDate={businessDate}
          onClose={() => setPayDialog(null)}
          onSaved={() => {
            setPayDialog(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "cash" | "online" | "due";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface p-3 shadow-sm",
        tone === "cash" && "bg-emerald-50/50 border-emerald-200",
        tone === "online" && "bg-sky-50/50 border-sky-200",
        tone === "due" && "bg-amber-50/50 border-amber-200",
      )}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-xl font-bold mt-1 tabular-nums">{value}</div>
    </div>
  );
}

function MultiProductGrid({
  vendor,
  products,
  draft,
  onChange,
}: {
  vendor: Vendor;
  products: VendorProduct[];
  draft: DraftLine[];
  onChange: (idx: number, patch: Partial<DraftLine>) => void;
}) {
  if (products.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic py-3 text-center">
        No products configured for {vendor.name}. Add them under More → Vendors & products.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="text-xs uppercase tracking-wider text-muted-foreground">
            <th className="text-left py-1.5 pl-1">Product</th>
            <th className="text-right py-1.5 w-[90px]">Qty</th>
            <th className="text-right py-1.5 w-[110px]">Price</th>
            <th className="text-right py-1.5 w-[90px]">Amount</th>
            <th className="text-center py-1.5 w-[120px]">Pay</th>
            <th className="text-right py-1.5 w-[100px] pr-1">Paid</th>
            <th className="text-right py-1.5 w-[90px] pr-1">Due</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p, idx) => {
            const r = draft[idx];
            if (!r) return null;
            const qty = num(r.qty);
            const price = p.price_mode === "fixed" ? Number(p.fixed_price ?? 0) : num(r.unit_price);
            const amt = qty * price;
            const paid = Math.min(num(r.paid_amount), amt);
            const due = amt - paid;
            return (
              <tr key={p.id} className="border-t border-border">
                <td className="py-1.5 pl-1">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-[10px] text-muted-foreground">per {p.unit}</div>
                </td>
                <td className="py-1.5">
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={r.qty}
                    onChange={(e) => onChange(idx, { qty: e.target.value })}
                    className="text-right h-9"
                    placeholder="0"
                  />
                </td>
                <td className="py-1.5">
                  <div className="relative">
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={r.unit_price}
                      onChange={(e) => onChange(idx, { unit_price: e.target.value })}
                      readOnly={p.price_mode === "fixed"}
                      className={cn(
                        "text-right h-9",
                        p.price_mode === "fixed" && "bg-muted pr-7 text-muted-foreground",
                      )}
                    />
                    {p.price_mode === "fixed" && (
                      <Lock className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                </td>
                <td className="py-1.5 text-right tabular-nums font-medium">
                  {amt > 0 ? inr(amt) : "—"}
                </td>
                <td className="py-1.5 px-1">
                  <Select
                    value={r.pay_mode}
                    onValueChange={(v) => onChange(idx, { pay_mode: v as PayMode })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="online">Online</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="py-1.5">
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={r.paid_amount}
                    onChange={(e) => onChange(idx, { paid_amount: e.target.value })}
                    className="text-right h-9"
                    placeholder="0"
                  />
                </td>
                <td className="py-1.5 pr-1 text-right tabular-nums text-amber-700">
                  {due > 0 ? inr(due) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SingleLineRow({
  draft,
  onChange,
}: {
  draft: DraftLine;
  onChange: (patch: Partial<DraftLine>) => void;
}) {
  const qty = num(draft.qty);
  const price = num(draft.unit_price);
  const amt = qty * price;
  const paid = Math.min(num(draft.paid_amount), amt);
  const due = amt - paid;
  return (
    <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
      <div className="md:col-span-2">
        <Label className="text-xs">Description</Label>
        <Input
          value={draft.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="e.g. 1 cylinder"
          className="h-9"
        />
      </div>
      <div>
        <Label className="text-xs">Qty</Label>
        <Input
          type="number"
          inputMode="decimal"
          value={draft.qty}
          onChange={(e) => onChange({ qty: e.target.value })}
          className="h-9 text-right"
        />
      </div>
      <div>
        <Label className="text-xs">Price</Label>
        <Input
          type="number"
          inputMode="decimal"
          value={draft.unit_price}
          onChange={(e) => onChange({ unit_price: e.target.value })}
          className="h-9 text-right"
        />
      </div>
      <div>
        <Label className="text-xs">Pay</Label>
        <Select
          value={draft.pay_mode}
          onValueChange={(v) => onChange({ pay_mode: v as PayMode })}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="online">Online</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Paid</Label>
        <Input
          type="number"
          inputMode="decimal"
          value={draft.paid_amount}
          onChange={(e) => onChange({ paid_amount: e.target.value })}
          className="h-9 text-right"
        />
      </div>
      <div className="md:col-span-6 flex flex-wrap gap-4 text-xs text-muted-foreground pt-1">
        <span>
          Amount: <strong className="text-foreground">{inr(amt)}</strong>
        </span>
        <span className="text-amber-700">
          Due: <strong>{inr(due)}</strong>
        </span>
      </div>
    </div>
  );
}

function DuesView({
  vendors,
  dues,
  onPay,
}: {
  vendors: Vendor[];
  dues: Record<string, number>;
  onPay: (v: Vendor) => void;
}) {
  const withDue = vendors
    .map((v) => ({ v, due: dues[v.id] ?? 0 }))
    .sort((a, b) => b.due - a.due);
  const total = withDue.reduce((s, x) => s + x.due, 0);

  return (
    <div>
      <div className="rounded-2xl border border-border bg-amber-50/40 p-3 mb-3 flex items-center justify-between">
        <div className="text-sm">
          <div className="text-xs text-muted-foreground">Total outstanding due</div>
          <div className="text-2xl font-bold text-amber-700 tabular-nums">{inr(total)}</div>
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-surface divide-y overflow-hidden">
        {withDue.map(({ v, due }) => (
          <div key={v.id} className="flex items-center gap-3 p-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{v.name}</div>
              {v.name_tamil && (
                <div className="text-xs text-muted-foreground truncate">{v.name_tamil}</div>
              )}
            </div>
            <div
              className={cn(
                "tabular-nums font-semibold",
                due > 0 ? "text-amber-700" : "text-muted-foreground",
              )}
            >
              {inr(due)}
            </div>
            <Button size="sm" variant="outline" onClick={() => onPay(v)}>
              Record payment
            </Button>
          </div>
        ))}
        {withDue.length === 0 && (
          <div className="p-6 text-center text-muted-foreground text-sm">No vendors.</div>
        )}
      </div>
    </div>
  );
}

function PaymentDialog({
  vendor,
  businessDate,
  onClose,
  onSaved,
}: {
  vendor: Vendor;
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
          <DialogTitle>Record payment · {vendor.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="block mb-1.5">Amount</Label>
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
