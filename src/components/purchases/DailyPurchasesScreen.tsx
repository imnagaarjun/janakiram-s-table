import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Save,
  Lock,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ChevronsDownUp,
  ChevronsUpDown,
  Wallet,
  Smartphone,
  Download,
  Search,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { inr } from "@/lib/gst";
import { cn } from "@/lib/utils";
import { vendorKind } from "@/components/vendors/vendorKind";

type PayMode = "cash" | "online";
type Settle = "full" | "custom";
type Filter = "all" | "pending";
type VendorType = "multi" | "fixed" | "single";

interface Vendor {
  id: string;
  name: string;
  name_tamil: string | null;
  is_multi_product: boolean;
  is_fixed_amount: boolean;
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

// Column layout shared by the header and every entry row (desktop); rows stack on phones.
const GRID = "sm:grid-cols-[minmax(0,1fr)_72px_88px_88px_88px]";

function todayIST(): string {
  const d = new Date();
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const ist = new Date(utc + 5.5 * 3600 * 1000);
  return ist.toISOString().slice(0, 10);
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function num(s: string): number {
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function typeOf(v: Vendor): VendorType {
  return v.is_multi_product ? "multi" : v.is_fixed_amount ? "fixed" : "single";
}

function lineAmount(r: DraftLine): number {
  const q = num(r.qty);
  const p = num(r.unit_price);
  return q > 0 && p > 0 ? round2(q * p) : 0;
}

function paidOf(r: DraftLine, settle: Settle, fixed: boolean): number {
  const a = lineAmount(r);
  if (a <= 0) return 0;
  if (fixed || settle === "full") return a;
  return Math.min(num(r.paid_amount), a);
}

function buildDraft(ven: Vendor, vProds: VendorProduct[], vLines: PurchaseLine[]) {
  const mode: PayMode = (vLines[0]?.pay_mode as PayMode) ?? "cash";
  const settle: Settle =
    vLines.length === 0 || vLines.every((l) => Number(l.paid_amount) >= Number(l.amount))
      ? "full"
      : "custom";
  let rows: DraftLine[];
  if (ven.is_multi_product) {
    rows = vProds.map((pr) => {
      const ex = vLines.find((x) => x.vendor_product_id === pr.id);
      return {
        vendor_product_id: pr.id,
        qty: ex ? String(ex.qty) : "",
        unit_price:
          pr.price_mode === "fixed" ? String(pr.fixed_price ?? 0) : ex ? String(ex.unit_price) : "",
        pay_mode: ex?.pay_mode ?? "cash",
        paid_amount: ex ? String(ex.paid_amount) : "",
        description: "",
      };
    });
  } else if (ven.is_fixed_amount) {
    const ex = vLines[0];
    rows = [
      {
        vendor_product_id: null,
        qty: "1",
        unit_price: ex ? String(ex.amount) : "",
        pay_mode: ex?.pay_mode ?? "cash",
        paid_amount: ex ? String(ex.paid_amount) : "",
        description: ex?.description ?? "",
      },
    ];
  } else {
    const ex = vLines[0];
    rows = [
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
  return { rows, mode, settle };
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
  const [vendorPayMode, setVendorPayMode] = useState<Record<string, PayMode>>({});
  const [settleMap, setSettleMap] = useState<Record<string, Settle>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [payDialog, setPayDialog] = useState<Vendor | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [exporting, setExporting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

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
      db.from("vendors").select("*").eq("is_active", true).order("display_order").order("name"),
      db
        .from("vendor_products")
        .select("*")
        .eq("is_active", true)
        .order("display_order")
        .order("name"),
      db.from("purchase_lines").select("*").eq("business_date", businessDate),
    ]);
    if (v.error) toast.error(v.error.message);
    const vList: Vendor[] = v.data ?? [];
    const pList: VendorProduct[] = p.data ?? [];
    const lList: PurchaseLine[] = l.data ?? [];
    setVendors(vList);
    setProducts(pList);
    setLines(lList);

    const d: Record<string, DraftLine[]> = {};
    const vp: Record<string, PayMode> = {};
    const st: Record<string, Settle> = {};
    const open = new Set<string>();
    for (const ven of vList) {
      const vLines = lList.filter((x) => x.vendor_id === ven.id);
      const b = buildDraft(
        ven,
        pList.filter((x) => x.vendor_id === ven.id),
        vLines,
      );
      d[ven.id] = b.rows;
      vp[ven.id] = b.mode;
      st[ven.id] = b.settle;
      // Work-in-progress first: only vendors with nothing saved today start open.
      if (vLines.length === 0) open.add(ven.id);
    }
    setDrafts(d);
    setVendorPayMode(vp);
    setSettleMap(st);
    setExpanded(open);
    setDirty(new Set());
    setLoading(false);
    loadDues(vList);
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

  const savedIds = useMemo(() => new Set(lines.map((l) => l.vendor_id)), [lines]);
  const isPending = (v: Vendor) => !savedIds.has(v.id) && !dirty.has(v.id);
  const pendingCount = vendors.filter(isPending).length;
  const owing = vendors.filter((v) => (dues[v.id] ?? 0) > 0.005);

  const q = query.trim().toLowerCase();
  const matches = (v: Vendor) =>
    !q ||
    v.name.toLowerCase().includes(q) ||
    (v.name_tamil ?? "").toLowerCase().includes(q) ||
    products.some((p) => p.vendor_id === v.id && p.name.toLowerCase().includes(q));
  const visible = vendors.filter((v) => (filter === "pending" ? isPending(v) : true) && matches(v));
  const allOpen = visible.length > 0 && visible.every((v) => expanded.has(v.id));

  function onSearch(val: string) {
    setQuery(val);
    const t = val.trim().toLowerCase();
    if (!t) return;
    setExpanded((s) => {
      const n = new Set(s);
      for (const v of vendors) {
        if (
          v.name.toLowerCase().includes(t) ||
          (v.name_tamil ?? "").toLowerCase().includes(t) ||
          products.some((p) => p.vendor_id === v.id && p.name.toLowerCase().includes(t))
        )
          n.add(v.id);
      }
      return n;
    });
  }

  function toggleExpand(id: string) {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleAll() {
    setExpanded((s) => {
      const n = new Set(s);
      for (const v of visible) {
        if (allOpen) n.delete(v.id);
        else n.add(v.id);
      }
      return n;
    });
  }

  function markDirty(vendorId: string) {
    setDirty((s) => {
      if (s.has(vendorId)) return s;
      const n = new Set(s);
      n.add(vendorId);
      return n;
    });
  }

  function updateDraft(vendorId: string, idx: number, patch: Partial<DraftLine>) {
    markDirty(vendorId);
    setDrafts((d) => {
      const arr = [...(d[vendorId] ?? [])];
      arr[idx] = { ...arr[idx], ...patch };
      return { ...d, [vendorId]: arr };
    });
  }

  function setPayMode(vendorId: string, mode: PayMode) {
    markDirty(vendorId);
    setVendorPayMode((m) => ({ ...m, [vendorId]: mode }));
  }

  function setSettle(vendorId: string, s: Settle) {
    markDirty(vendorId);
    setSettleMap((m) => ({ ...m, [vendorId]: s }));
    if (s === "custom") {
      // Start from "fully paid" so only the exceptions need editing.
      setDrafts((d) => ({
        ...d,
        [vendorId]: (d[vendorId] ?? []).map((r) => {
          const a = lineAmount(r);
          return a > 0 && !r.paid_amount ? { ...r, paid_amount: String(a) } : r;
        }),
      }));
    }
  }

  function draftSummary(v: Vendor) {
    const settle = settleMap[v.id] ?? "full";
    const fixed = typeOf(v) === "fixed";
    let amount = 0;
    let paid = 0;
    for (const r of drafts[v.id] ?? []) {
      amount += lineAmount(r);
      paid += paidOf(r, settle, fixed);
    }
    return { amount, paid, due: round2(amount - paid) };
  }

  async function persistVendor(v: Vendor): Promise<boolean> {
    const settle = settleMap[v.id] ?? "full";
    const mode = vendorPayMode[v.id] ?? "cash";
    const fixed = typeOf(v) === "fixed";
    const payload = (drafts[v.id] ?? [])
      .filter((r) => lineAmount(r) > 0)
      .map((r) => ({
        vendor_product_id: r.vendor_product_id,
        qty: num(r.qty),
        unit_price: num(r.unit_price),
        pay_mode: mode,
        paid_amount: paidOf(r, settle, fixed),
        description: r.description || null,
      }));
    const { error } = await supabase.rpc("save_vendor_day_purchases", {
      _business_date: businessDate,
      _vendor_id: v.id,
      _lines: payload,
    });
    if (error) {
      toast.error(`${v.name}: ${error.message}`);
      return false;
    }
    return true;
  }

  // Re-read saved lines and reset only the vendors just saved, so other unsaved edits survive.
  async function refreshVendors(ids: string[]) {
    const { data, error } = await db
      .from("purchase_lines")
      .select("*")
      .eq("business_date", businessDate);
    if (error) {
      toast.error(error.message);
      return;
    }
    const all: PurchaseLine[] = data ?? [];
    setLines(all);
    const nd: Record<string, DraftLine[]> = {};
    const nm: Record<string, PayMode> = {};
    const ns: Record<string, Settle> = {};
    for (const id of ids) {
      const ven = vendors.find((x) => x.id === id);
      if (!ven) continue;
      const b = buildDraft(
        ven,
        products.filter((p) => p.vendor_id === id),
        all.filter((l) => l.vendor_id === id),
      );
      nd[id] = b.rows;
      nm[id] = b.mode;
      ns[id] = b.settle;
    }
    setDrafts((d) => ({ ...d, ...nd }));
    setVendorPayMode((m) => ({ ...m, ...nm }));
    setSettleMap((m) => ({ ...m, ...ns }));
    setDirty((s) => {
      const n = new Set(s);
      ids.forEach((i) => n.delete(i));
      return n;
    });
    setExpanded((s) => {
      const n = new Set(s);
      ids.forEach((i) => n.delete(i));
      return n;
    });
    loadDues(vendors);
  }

  async function saveVendors(list: Vendor[]) {
    setSaving((s) => new Set([...s, ...list.map((v) => v.id)]));
    const ok: string[] = [];
    for (const v of list) {
      if (await persistVendor(v)) ok.push(v.id);
    }
    if (ok.length) {
      await refreshVendors(ok);
      toast.success(
        ok.length === 1
          ? `${list.find((v) => v.id === ok[0])?.name} saved`
          : `${ok.length} vendors saved`,
      );
    }
    setSaving((s) => {
      const n = new Set(s);
      list.forEach((v) => n.delete(v.id));
      return n;
    });
  }

  function changeDate(d: string) {
    if (!d || d === businessDate) return;
    if (
      dirty.size > 0 &&
      !window.confirm("You have unsaved entries. Discard them and change the date?")
    )
      return;
    setBusinessDate(d);
  }

  async function downloadPdf() {
    setExporting(true);
    try {
      const { downloadPurchasesPdf } = await import("@/lib/purchases-pdf");
      const order = new Map(vendors.map((v, i) => [v.id, i]));
      const byVendor = new Map<string, PurchaseLine[]>();
      for (const l of lines) byVendor.set(l.vendor_id, [...(byVendor.get(l.vendor_id) ?? []), l]);
      const groups = [...byVendor.entries()]
        .sort((a, b) => (order.get(a[0]) ?? 999) - (order.get(b[0]) ?? 999))
        .map(([vid, ls]) => {
          const ven = vendors.find((x) => x.id === vid);
          return {
            vendor: ven?.name ?? "Other vendor",
            rows: ls.map((l) => ({
              item:
                products.find((p) => p.id === l.vendor_product_id)?.name ??
                l.description ??
                ven?.name ??
                "-",
              qty: Number(l.qty),
              price: Number(l.unit_price),
              amount: Number(l.amount),
              paid: Number(l.paid_amount),
              due: Number(l.due_amount),
              mode: l.pay_mode,
            })),
          };
        });
      await downloadPurchasesPdf({
        restaurant: "Hotel Sri Janakiram",
        date: businessDate,
        groups,
        totals,
        outstanding: owing
          .map((v) => ({ vendor: v.name, due: dues[v.id] ?? 0 }))
          .sort((a, b) => b.due - a.due),
      });
      if (dirty.size > 0)
        toast.message(`${dirty.size} unsaved vendor(s) are not included in the PDF`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create PDF");
    } finally {
      setExporting(false);
    }
  }

  function onListKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Enter") return;
    const t = e.target as HTMLElement;
    if (!t.matches?.("input[data-entry]")) return;
    e.preventDefault();
    const all = Array.from(
      listRef.current?.querySelectorAll<HTMLInputElement>("input[data-entry]:not([readonly])") ??
        [],
    );
    all[all.indexOf(t as HTMLInputElement) + 1]?.focus();
  }

  if (!profile) return null;

  const isToday = businessDate === todayIST();

  return (
    <div>
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <TabsList>
            <TabsTrigger value="entry">Day entry</TabsTrigger>
            <TabsTrigger value="dues" className="gap-1.5">
              Vendor dues
              {owing.length > 0 && (
                <span className="rounded-full bg-warning/25 text-warning-foreground px-1.5 text-[10px] font-semibold">
                  {owing.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => changeDate(shiftDate(businessDate, -1))}
              aria-label="Previous day"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input
              type="date"
              value={businessDate}
              onChange={(e) => changeDate(e.target.value)}
              className="w-[150px] h-9"
            />
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => changeDate(shiftDate(businessDate, 1))}
              aria-label="Next day"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            {!isToday && (
              <Button variant="ghost" size="sm" onClick={() => changeDate(todayIST())}>
                Today
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={downloadPdf}
              disabled={exporting || loading}
              aria-label="Download PDF"
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin sm:mr-1.5" />
              ) : (
                <Download className="h-4 w-4 sm:mr-1.5" />
              )}
              <span className="hidden sm:inline">PDF</span>
            </Button>
          </div>
        </div>

        <TabsContent value="entry" className="mt-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border rounded-2xl border border-border overflow-hidden shadow-sm mb-3">
            <Stat label="Gross purchases" value={inr(totals.gross)} />
            <Stat label="Cash paid" value={inr(totals.cash)} tone="text-emerald-700" />
            <Stat label="Online paid" value={inr(totals.online)} tone="text-sky-700" />
            <Stat
              label="Due today"
              value={inr(totals.due)}
              tone={totals.due > 0 ? "text-amber-700" : undefined}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Find vendor or item…"
                className="pl-9 h-9"
              />
            </div>
            <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs font-medium">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={cn(
                  "px-3 h-9",
                  filter === "all" ? "bg-foreground text-background" : "bg-surface hover:bg-accent",
                )}
              >
                All {vendors.length}
              </button>
              <button
                type="button"
                onClick={() => setFilter("pending")}
                className={cn(
                  "px-3 h-9 border-l border-border",
                  filter === "pending"
                    ? "bg-foreground text-background"
                    : "bg-surface hover:bg-accent",
                )}
              >
                Pending {pendingCount}
              </button>
            </div>
            <Button variant="outline" size="sm" className="h-9" onClick={toggleAll}>
              {allOpen ? (
                <ChevronsDownUp className="h-4 w-4 sm:mr-1.5" />
              ) : (
                <ChevronsUpDown className="h-4 w-4 sm:mr-1.5" />
              )}
              <span className="hidden sm:inline">{allOpen ? "Collapse all" : "Expand all"}</span>
            </Button>
            {dirty.size > 0 && (
              <Button
                size="sm"
                className="h-9"
                disabled={saving.size > 0}
                onClick={() => saveVendors(vendors.filter((v) => dirty.has(v.id)))}
              >
                {saving.size > 0 ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1.5" />
                )}
                Save all ({dirty.size})
              </Button>
            )}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : vendors.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
              No active vendors. Add some under More → Vendors & products.
            </div>
          ) : visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
              {filter === "pending" && !q
                ? "All vendors are entered for this day."
                : "No vendors match your search."}
            </div>
          ) : (
            <div ref={listRef} onKeyDown={onListKeyDown} className="space-y-2">
              {visible.map((v) => {
                const kind = vendorKind(v);
                const type = typeOf(v);
                const draft = draftSummary(v);
                const open = expanded.has(v.id);
                const isDirty = dirty.has(v.id);
                const isSaved = savedIds.has(v.id);
                const vProds = products.filter((p) => p.vendor_id === v.id);
                const rows = drafts[v.id] ?? [];
                const settle = settleMap[v.id] ?? "full";
                const mode = vendorPayMode[v.id] ?? "cash";
                const owed = dues[v.id] ?? 0;
                return (
                  <div
                    key={v.id}
                    className={cn(
                      "relative rounded-2xl border bg-surface overflow-hidden shadow-sm",
                      open ? "border-primary/40" : "border-border",
                    )}
                  >
                    <span className={`absolute inset-y-0 left-0 w-1.5 ${kind.bar}`} aria-hidden />
                    <button
                      type="button"
                      onClick={() => toggleExpand(v.id)}
                      aria-expanded={open}
                      className={cn(
                        "flex w-full items-center gap-3 py-2.5 pl-5 pr-3 text-left",
                        open && kind.tint,
                      )}
                    >
                      <span
                        className={`h-9 w-9 shrink-0 rounded-xl grid place-items-center ${kind.tile}`}
                      >
                        <kind.Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2 min-w-0">
                          <span className="font-semibold truncate">{v.name}</span>
                          {v.name_tamil && (
                            <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                              {v.name_tamil}
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-muted-foreground truncate">
                          {kind.label}
                          {type === "multi" &&
                            ` · ${vProds.length} ${vProds.length === 1 ? "item" : "items"}`}
                        </span>
                      </span>
                      {owed > 0.005 && (
                        <span className="hidden sm:block shrink-0 text-right leading-tight">
                          <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                            Owed
                          </span>
                          <span className="block text-sm font-semibold text-amber-700 tabular-nums">
                            {inr(owed)}
                          </span>
                        </span>
                      )}
                      <span className="shrink-0 text-right leading-tight min-w-[84px]">
                        <span className="block font-semibold tabular-nums">
                          {draft.amount > 0 ? inr(draft.amount) : "—"}
                        </span>
                        <span className="block text-[11px]">
                          {isDirty ? (
                            <span className="text-amber-700 font-medium">Unsaved</span>
                          ) : isSaved ? (
                            <span className="text-emerald-700 font-medium inline-flex items-center gap-0.5">
                              <Check className="h-3 w-3" /> Saved
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Pending</span>
                          )}
                          {draft.due > 0 && (
                            <span className="text-amber-700 font-medium">
                              {" "}
                              · Due {inr(draft.due)}
                            </span>
                          )}
                        </span>
                      </span>
                      {open ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>

                    {open && (
                      <div className={cn("border-t border-border pl-5 pr-3 py-2", kind.tint)}>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-1">
                          <Segmented
                            value={mode}
                            onChange={(m) => setPayMode(v.id, m)}
                            options={[
                              {
                                value: "cash",
                                label: (
                                  <>
                                    <Wallet className="h-3.5 w-3.5" /> Cash
                                  </>
                                ),
                                active: "bg-emerald-600 text-white",
                              },
                              {
                                value: "online",
                                label: (
                                  <>
                                    <Smartphone className="h-3.5 w-3.5" /> Online
                                  </>
                                ),
                                active: "bg-sky-600 text-white",
                              },
                            ]}
                          />
                          {type !== "fixed" && (
                            <Segmented
                              value={settle}
                              onChange={(s) => setSettle(v.id, s)}
                              options={[
                                {
                                  value: "full",
                                  label: "Paid in full",
                                  active: "bg-foreground text-background",
                                },
                                {
                                  value: "custom",
                                  label: "Part / credit",
                                  active: "bg-foreground text-background",
                                },
                              ]}
                            />
                          )}
                        </div>

                        {type === "multi" && vProds.length === 0 ? (
                          <div className="text-xs text-muted-foreground italic py-3 text-center">
                            No products configured for {v.name}. Add them under More → Vendors &
                            products.
                          </div>
                        ) : (
                          <div>
                            {type !== "fixed" && (
                              <div
                                className={cn(
                                  "hidden sm:grid gap-x-2 pb-1 border-b border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground",
                                  GRID,
                                )}
                              >
                                <span>{type === "multi" ? "Item" : "Description"}</span>
                                <span className="text-right">Qty</span>
                                <span className="text-right">Price</span>
                                <span className="text-right">Amount</span>
                                <span className="text-right">Paid</span>
                              </div>
                            )}
                            <div className="divide-y divide-border/60">
                              {type === "multi"
                                ? vProds.map((p, idx) =>
                                    rows[idx] ? (
                                      <EntryRow
                                        key={p.id}
                                        type="multi"
                                        name={p.name}
                                        unit={p.unit}
                                        locked={p.price_mode === "fixed"}
                                        draft={rows[idx]}
                                        settle={settle}
                                        onChange={(patch) => updateDraft(v.id, idx, patch)}
                                      />
                                    ) : null,
                                  )
                                : rows[0] && (
                                    <EntryRow
                                      type={type}
                                      name={v.name}
                                      draft={rows[0]}
                                      settle={settle}
                                      onChange={(patch) => updateDraft(v.id, 0, patch)}
                                    />
                                  )}
                            </div>
                          </div>
                        )}

                        {isDirty && (
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 mt-1 border-t border-border/60">
                            <div className="text-xs text-muted-foreground space-x-3">
                              <span>
                                Amount{" "}
                                <strong className="text-foreground">{inr(draft.amount)}</strong>
                              </span>
                              <span>
                                Paid <strong className="text-emerald-700">{inr(draft.paid)}</strong>
                              </span>
                              <span>
                                Due{" "}
                                <strong
                                  className={draft.due > 0 ? "text-amber-700" : "text-foreground"}
                                >
                                  {inr(draft.due)}
                                </strong>
                              </span>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => saveVendors([v])}
                              disabled={saving.has(v.id)}
                            >
                              {saving.has(v.id) ? (
                                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4 mr-1.5" />
                              )}
                              {saving.has(v.id) ? "Saving…" : "Save"}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="dues" className="mt-0">
          <DuesView owing={owing} dues={dues} onPay={(v) => setPayDialog(v)} />
        </TabsContent>
      </Tabs>

      {payDialog && (
        <PaymentDialog
          vendor={payDialog}
          due={dues[payDialog.id] ?? 0}
          businessDate={businessDate}
          onClose={() => setPayDialog(null)}
          onSaved={() => {
            setPayDialog(null);
            loadDues(vendors);
            db.from("purchase_lines")
              .select("*")
              .eq("business_date", businessDate)
              .then((r: { data: PurchaseLine[] | null }) => setLines(r.data ?? []));
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-surface px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-bold tabular-nums leading-tight", tone)}>{value}</div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: React.ReactNode; active: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border overflow-hidden bg-surface">
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "px-3 py-1.5 text-xs font-medium flex items-center gap-1",
            i > 0 && "border-l border-border",
            value === o.value ? o.active : "hover:bg-accent",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Cell({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5 min-w-0", className)}>
      <span className="sm:hidden text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function NumInput({
  value,
  onChange,
  readOnly,
  locked,
  label,
}: {
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  locked?: boolean;
  label: string;
}) {
  return (
    <div className="relative">
      <Input
        data-entry
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        value={value}
        readOnly={readOnly}
        aria-label={label}
        onChange={(e) => onChange?.(e.target.value)}
        onFocus={(e) => e.target.select()}
        placeholder="0"
        className={cn(
          "h-9 px-2 text-right text-sm tabular-nums",
          readOnly && "bg-muted/60 text-muted-foreground",
          locked && "pr-6",
        )}
      />
      {locked && (
        <Lock className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
      )}
    </div>
  );
}

function ValueCell({ amount, muted }: { amount: number; muted?: boolean }) {
  return (
    <div
      className={cn(
        "h-9 flex items-center justify-end text-sm tabular-nums px-1",
        muted ? "text-muted-foreground" : "font-medium",
      )}
    >
      {amount > 0 ? inr(amount) : "—"}
    </div>
  );
}

function EntryRow({
  type,
  name,
  unit,
  locked,
  draft,
  settle,
  onChange,
}: {
  type: VendorType;
  name: string;
  unit?: string;
  locked?: boolean;
  draft: DraftLine;
  settle: Settle;
  onChange: (patch: Partial<DraftLine>) => void;
}) {
  const amt = lineAmount(draft);
  const paid = paidOf(draft, settle, type === "fixed");
  return (
    <div className={cn("grid grid-cols-4 gap-x-2 gap-y-1 items-end sm:items-center py-1.5", GRID)}>
      <div className="col-span-4 sm:col-span-1 min-w-0">
        {type === "multi" ? (
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="font-medium text-sm truncate">{name}</span>
            <span className="text-[11px] text-muted-foreground shrink-0">/{unit}</span>
          </div>
        ) : (
          <Input
            data-entry
            value={draft.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder={type === "fixed" ? "Note (optional)" : "Description, e.g. 1 cylinder"}
            aria-label="Description"
            className="h-9"
          />
        )}
      </div>

      {type === "fixed" ? (
        <>
          <div className="hidden sm:block" />
          <div className="hidden sm:block" />
          <Cell label="Amount" className="col-span-2 sm:col-span-1">
            <NumInput
              label="Amount"
              value={draft.unit_price}
              onChange={(v) => onChange({ unit_price: v, qty: "1", paid_amount: v })}
            />
          </Cell>
          <div className="hidden sm:block" />
        </>
      ) : (
        <>
          <Cell label="Qty">
            <NumInput label="Quantity" value={draft.qty} onChange={(v) => onChange({ qty: v })} />
          </Cell>
          <Cell label="Price">
            <NumInput
              label="Price"
              value={draft.unit_price}
              readOnly={locked}
              locked={locked}
              onChange={(v) => onChange({ unit_price: v })}
            />
          </Cell>
          <Cell label="Amount">
            <ValueCell amount={amt} />
          </Cell>
          <Cell label="Paid">
            {settle === "full" ? (
              <ValueCell amount={paid} muted />
            ) : (
              <NumInput
                label="Paid"
                value={draft.paid_amount}
                onChange={(v) => onChange({ paid_amount: v })}
              />
            )}
          </Cell>
        </>
      )}
    </div>
  );
}

function DuesView({
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
                <div className="font-semibold truncate">{v.name}</div>
                {v.name_tamil && (
                  <div className="text-xs text-muted-foreground truncate">{v.name_tamil}</div>
                )}
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

function PaymentDialog({
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
