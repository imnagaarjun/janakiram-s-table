import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Save,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Download,
  Search,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useDeviceMode } from "@/hooks/use-device-mode";
import { cn } from "@/lib/utils";
import { mergeUnits } from "@/lib/units";
import { AddVendorDialog } from "./AddVendorDialog";
import { DetailCard } from "./DetailCard";
import { DuesView, PaymentDialog } from "./DuesPanel";
import { MasterTable } from "./MasterTable";
import { SignoffBanner, SignoffDialog } from "./Signoff";
import { inr, num, round2 } from "./numbers";
import {
  SIGNOFF_DONE,
  SIGNOFF_RPC,
  buildPayload,
  buildVendorDraft,
  draftAmount,
  draftPaid,
  emptyDraft,
  fmtTime,
  friendlyApproval,
  shiftDate,
  stageOf,
  todayIST,
  vendorType,
  type Approval,
  type ItemRow,
  type PurchaseLine,
  type SignoffAction,
  type Vendor,
  type VendorDraft,
  type VendorProduct,
} from "./model";

const byOrder = (a: Vendor, b: Vendor) =>
  a.display_order - b.display_order || a.name.localeCompare(b.name);

export function DailyPurchasesScreen() {
  const { profile, hasRole, can } = useAuth();
  const isAdmin = hasRole("admin");
  const canCheck = can("purchases:check");
  const canApprove = can("purchases:approve");
  const deviceMode = useDeviceMode();
  const phone = deviceMode === "phone";

  const [businessDate, setBusinessDate] = useState<string>(todayIST());
  const [tab, setTab] = useState("entry");
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [dueVendors, setDueVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [dues, setDues] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, VendorDraft>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [lastPrice, setLastPrice] = useState<Record<string, number>>({});
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [focusUid, setFocusUid] = useState<string | null>(null);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [payDialog, setPayDialog] = useState<Vendor | null>(null);
  const [exporting, setExporting] = useState(false);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [confirm, setConfirm] = useState<SignoffAction | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1100);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // Cards instead of the table whenever the room next to the sidebar is too narrow for 8 columns.
  const compact = width < 780;

  const stage = stageOf(approval);
  const locked = stage === "checked" ? !canApprove : stage === "approved" ? !isAdmin : false;

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

  const load = useCallback(
    async (opts?: { keepDirty?: boolean }) => {
      const keep = !!opts?.keepDirty;
      if (!keep) setLoading(true);
      const [v, p, l, prev, ap] = await Promise.all([
        db.from("vendors").select("*").eq("is_active", true).order("display_order").order("name"),
        db
          .from("vendor_products")
          .select("*")
          .eq("is_active", true)
          .order("display_order")
          .order("name"),
        db.from("purchase_lines").select("*").eq("business_date", businessDate),
        db
          .from("purchase_lines")
          .select("vendor_id,vendor_product_id,unit_price")
          .lt("business_date", businessDate)
          .order("business_date", { ascending: false })
          .limit(800),
        db
          .from("purchase_day_approvals")
          .select("*")
          .eq("business_date", businessDate)
          .maybeSingle(),
      ]);
      if (v.error) toast.error(v.error.message);
      const lp: Record<string, number> = {};
      for (const x of (prev.data ?? []) as {
        vendor_id: string;
        vendor_product_id: string | null;
        unit_price: number;
      }[]) {
        const key = x.vendor_product_id ? `p:${x.vendor_product_id}` : `v:${x.vendor_id}`;
        if (!(key in lp) && Number(x.unit_price) > 0) lp[key] = Number(x.unit_price);
      }
      setLastPrice(lp);
      const vList: Vendor[] = v.data ?? [];
      const pList: VendorProduct[] = p.data ?? [];
      const lList: PurchaseLine[] = l.data ?? [];
      setApproval(ap.error ? null : ((ap.data ?? null) as Approval | null));

      // One-time (inactive) vendors still show on the day they were used.
      const missing = [...new Set(lList.map((x) => x.vendor_id))].filter(
        (id) => !vList.some((x) => x.id === id),
      );
      if (missing.length) {
        const extra = await db.from("vendors").select("*").in("id", missing);
        vList.push(...((extra.data ?? []) as Vendor[]));
      }
      vList.sort(byOrder);

      // One-time vendors that still owe money stay visible in the dues tab on later days.
      const dueRes = await db
        .from("purchase_lines")
        .select("vendor_id")
        .gt("due_amount", 0)
        .limit(5000);
      const dueIds = [
        ...new Set(((dueRes.data ?? []) as { vendor_id: string }[]).map((x) => x.vendor_id)),
      ].filter((id) => !vList.some((x) => x.id === id));
      let dueOnly: Vendor[] = [];
      if (dueIds.length) {
        const dv = await db.from("vendors").select("*").in("id", dueIds);
        dueOnly = (dv.data ?? []) as Vendor[];
      }
      setDueVendors(dueOnly);

      // Products that were used today stay visible even if they have since been deactivated.
      const missingProds = [
        ...new Set(lList.map((x) => x.vendor_product_id).filter((id): id is string => !!id)),
      ].filter((id) => !pList.some((x) => x.id === id));
      if (missingProds.length) {
        const mp = await db.from("vendor_products").select("*").in("id", missingProds);
        pList.push(...((mp.data ?? []) as VendorProduct[]));
      }
      pList.sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name));

      setVendors(vList);
      setProducts(pList);
      setLines(lList);

      const d: Record<string, VendorDraft> = {};
      for (const ven of vList) {
        d[ven.id] = buildVendorDraft(
          ven,
          pList.filter((x) => x.vendor_id === ven.id),
          lList.filter((x) => x.vendor_id === ven.id),
        );
      }
      const keepIds = [...dirtyRef.current];
      setDrafts((prevDrafts) =>
        keep
          ? {
              ...d,
              ...Object.fromEntries(
                keepIds.filter((id) => id in prevDrafts).map((id) => [id, prevDrafts[id]]),
              ),
            }
          : d,
      );
      if (!keep) setDirty(new Set());
      setLoading(false);
      loadDues([...vList, ...dueOnly]);
    },
    [businessDate, loadDues],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [profile]);

  useEffect(() => {
    db.from("expense_categories")
      .select("id,name")
      .eq("is_active", true)
      .order("display_order")
      .order("name")
      .then((r: { data: { id: string; name: string }[] | null }) => setCategories(r.data ?? []));
  }, []);

  useEffect(() => {
    if (dirty.size === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty.size]);

  // ---- derived -------------------------------------------------------------------------

  const draftOf = useCallback((v: Vendor): VendorDraft => drafts[v.id] ?? emptyDraft(v), [drafts]);

  // Live totals while typing (the table footer and the strip).
  const live = useMemo(() => {
    let amount = 0;
    let paid = 0;
    let online = 0;
    for (const v of vendors) {
      const d = drafts[v.id];
      if (!d) continue;
      const a = draftAmount(d);
      const p = draftPaid(d);
      amount += a;
      paid += p;
      if (d.online) online += p;
    }
    return {
      amount: round2(amount),
      paid: round2(paid),
      online: round2(online),
      cash: round2(paid - online),
      due: round2(amount - paid),
    };
  }, [vendors, drafts]);

  // What is actually saved (used by the sign-off popup and the PDF).
  const saved = useMemo(() => {
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
  const pendingCount = vendors.filter((v) => !v.is_adhoc && !savedIds.has(v.id)).length;
  const owing = [...vendors, ...dueVendors].filter((v) => (dues[v.id] ?? 0) > 0.005);
  const unitOptions = useMemo(
    () =>
      mergeUnits([
        ...products.map((p) => p.unit),
        ...Object.values(drafts).flatMap((d) => d.items.map((i) => i.unit)),
      ]),
    [products, drafts],
  );

  const q = query.trim().toLowerCase();
  const matches = (v: Vendor) =>
    !q ||
    v.name.toLowerCase().includes(q) ||
    (drafts[v.id]?.items ?? []).some((i) => i.name.toLowerCase().includes(q));
  const shown = vendors.filter(matches);
  const multiShown = shown.filter((v) => vendorType(v) === "multi" || draftOf(v).legacy);
  const allOpen = multiShown.length > 0 && multiShown.every((v) => !collapsed.has(v.id));

  // ---- editing -------------------------------------------------------------------------

  function markDirty(id: string) {
    setDirty((s) => {
      if (s.has(id)) return s;
      const n = new Set(s);
      n.add(id);
      return n;
    });
  }

  function patchDraft(id: string, patch: Partial<VendorDraft>) {
    markDirty(id);
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  }

  function patchItem(vendorId: string, uid: string, patch: Partial<ItemRow>) {
    markDirty(vendorId);
    setDrafts((d) => {
      const cur = d[vendorId];
      if (!cur) return d;
      return {
        ...d,
        [vendorId]: {
          ...cur,
          items: cur.items.map((r) => {
            if (r.uid !== uid) return r;
            const next = { ...r, ...patch };
            // Typing a quantity on an empty price pulls in the last price paid (still editable).
            const hint = r.productId ? lastPrice[`p:${r.productId}`] : undefined;
            if (patch.qty !== undefined && num(patch.qty) > 0 && !next.price && hint) {
              next.price = String(hint);
            }
            return next;
          }),
        },
      };
    });
  }

  function addItem(vendorId: string) {
    markDirty(vendorId);
    const uid = `a${Date.now()}`;
    setFocusUid(uid);
    setCollapsed((s) => {
      const n = new Set(s);
      n.delete(vendorId);
      return n;
    });
    setDrafts((d) => {
      const cur = d[vendorId];
      if (!cur) return d;
      const lastUnit = [...cur.items].reverse().find((r) => r.adhoc)?.unit ?? "Nos";
      return {
        ...d,
        [vendorId]: {
          ...cur,
          items: [
            ...cur.items,
            {
              uid,
              productId: null,
              name: "",
              unit: lastUnit,
              qty: "",
              price: "",
              fixedPrice: false,
              adhoc: true,
            },
          ],
        },
      };
    });
  }

  function removeItem(vendorId: string, uid: string) {
    markDirty(vendorId);
    setDrafts((d) => {
      const cur = d[vendorId];
      return cur
        ? { ...d, [vendorId]: { ...cur, items: cur.items.filter((r) => r.uid !== uid) } }
        : d;
    });
  }

  function openItems(vendorId: string) {
    setCollapsed((s) => {
      const n = new Set(s);
      n.delete(vendorId);
      return n;
    });
    setTimeout(
      () =>
        document
          .getElementById(`detail-${vendorId}`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      60,
    );
  }

  function toggleCard(id: string) {
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleAll() {
    setCollapsed(allOpen ? new Set(multiShown.map((v) => v.id)) : new Set());
  }

  // Enter moves down the same column in the main table, and to the next box elsewhere.
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Enter") return;
    const t = e.target as HTMLInputElement;
    if (!t.matches?.("input[data-entry]")) return;
    e.preventDefault();
    const all = Array.from(
      areaRef.current?.querySelectorAll<HTMLInputElement>(
        "input[data-entry]:not([readonly]):not(:disabled)",
      ) ?? [],
    );
    const col = t.dataset.col;
    const list = col ? all.filter((i) => i.dataset.col === col) : all;
    list[list.indexOf(t) + 1]?.focus();
  }

  // ---- saving --------------------------------------------------------------------------

  async function refreshApproval() {
    const r = await db
      .from("purchase_day_approvals")
      .select("*")
      .eq("business_date", businessDate)
      .maybeSingle();
    setApproval(r.error ? null : ((r.data ?? null) as Approval | null));
  }

  async function persistVendor(v: Vendor): Promise<boolean> {
    const d = drafts[v.id];
    if (!d) return true;
    const built = buildPayload(v, d);
    if (built.error) {
      toast.error(built.error);
      return false;
    }
    if (built.skip) return true;
    const { error } = await db.rpc("save_vendor_day_purchases", {
      _business_date: businessDate,
      _vendor_id: v.id,
      _lines: built.lines,
    });
    if (error) {
      toast.error(`${v.name}: ${friendlyApproval(error.message)}`);
      if (error.message.includes("DAY_APPROVED") || error.message.includes("DAY_CHECKED"))
        refreshApproval();
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
    const nd: Record<string, VendorDraft> = {};
    for (const id of ids) {
      const ven = vendors.find((x) => x.id === id);
      if (!ven) continue;
      nd[id] = buildVendorDraft(
        ven,
        products.filter((p) => p.vendor_id === id),
        all.filter((l) => l.vendor_id === id),
      );
    }
    setDrafts((d) => ({ ...d, ...nd }));
    setDirty((s) => {
      const n = new Set(s);
      ids.forEach((i) => n.delete(i));
      return n;
    });
    loadDues([...vendors, ...dueVendors]);
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

  function discardAll() {
    if (window.confirm("Discard all unsaved entries?")) load();
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

  async function runSignoff(action: SignoffAction) {
    setApprovalBusy(true);
    const { error } = await db.rpc(SIGNOFF_RPC[action], { _business_date: businessDate });
    setApprovalBusy(false);
    if (error) {
      toast.error(friendlyApproval(error.message));
      await refreshApproval();
      setConfirm(null);
      return;
    }
    setConfirm(null);
    toast.success(SIGNOFF_DONE[action]);
    await refreshApproval();
  }

  async function exportPdf(action: "download" | "print") {
    if (stage === "open" || !approval) {
      toast.error("PDF and Print are available once the day is checked.");
      return;
    }
    setExporting(true);
    try {
      const pdf = await import("@/lib/purchases-pdf");
      const lineName = (l: PurchaseLine, ven?: Vendor) =>
        products.find((p) => p.id === l.vendor_product_id)?.name ??
        l.description ??
        ven?.name ??
        "-";
      const master = vendors
        .filter((v) => savedIds.has(v.id) || !v.is_adhoc)
        .map((v, i) => {
          const ls = lines.filter((l) => l.vendor_id === v.id);
          const type = vendorType(v);
          const single = type !== "multi" && ls.length === 1 && !ls[0].vendor_product_id;
          const amount = round2(ls.reduce((sum, l) => sum + Number(l.amount), 0));
          const paid = round2(ls.reduce((sum, l) => sum + Number(l.paid_amount), 0));
          return {
            sno: i + 1,
            vendor: v.name,
            qty: single && type === "single" ? Number(ls[0].qty) : null,
            price: single && type === "single" ? Number(ls[0].unit_price) : null,
            amount,
            paid,
            due: round2(amount - paid),
            online: ls[0]?.pay_mode === "online",
          };
        });
      const details = vendors
        .filter((v) => vendorType(v) === "multi" || draftOf(v).legacy)
        .map((v) => ({
          vendor: v.name,
          rows: lines
            .filter((l) => l.vendor_id === v.id)
            .map((l) => ({
              item: lineName(l, v),
              qty: Number(l.qty),
              unit: l.unit ?? products.find((p) => p.id === l.vendor_product_id)?.unit ?? "",
              price: Number(l.unit_price),
              amount: Number(l.amount),
            })),
        }))
        .filter((g) => g.rows.length > 0);
      const input = {
        restaurant: "Hotel Sri Janakiram",
        date: businessDate,
        master,
        details,
        totals: saved,
        outstanding: owing
          .map((v) => ({ vendor: v.name, due: dues[v.id] ?? 0 }))
          .sort((a, b) => b.due - a.due),
        approval: {
          checkedBy: approval.checked_by_name ?? "",
          checkedAt: approval.checked_at ? fmtTime(approval.checked_at) : "",
          approvedBy: approval.approved_by_name ?? undefined,
          approvedAt: approval.approved_at ? fmtTime(approval.approved_at) : undefined,
          correctedBy: approval.corrected_by_name ?? undefined,
          correctedAt: approval.corrected_at ? fmtTime(approval.corrected_at) : undefined,
          revisedBy: approval.revised_by_name ?? undefined,
          revisedAt: approval.revised_at ? fmtTime(approval.revised_at) : undefined,
        },
      };
      if (action === "print") await pdf.printPurchasesPdf(input);
      else await pdf.downloadPurchasesPdf(input);
      if (dirty.size > 0)
        toast.message(`${dirty.size} unsaved vendor(s) are not included in the PDF`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create PDF");
    } finally {
      setExporting(false);
    }
  }

  if (!profile) return null;

  const isToday = businessDate === todayIST();
  const unsaved = vendors.filter((v) => dirty.has(v.id));
  const unsavedSum = unsaved.reduce(
    (a, v) => {
      const d = draftOf(v);
      return { amount: a.amount + draftAmount(d), due: a.due + (draftAmount(d) - draftPaid(d)) };
    },
    { amount: 0, due: 0 },
  );

  return (
    <div ref={rootRef}>
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
          <div className="flex w-full sm:w-auto items-center justify-between sm:justify-end gap-1.5">
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 sm:h-9 sm:w-9"
              onClick={() => changeDate(shiftDate(businessDate, -1))}
              aria-label="Previous day"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input
              type="date"
              value={businessDate}
              onChange={(e) => changeDate(e.target.value)}
              className="flex-1 sm:flex-none sm:w-[150px] h-10 sm:h-9"
            />
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 sm:h-9 sm:w-9"
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
            <span
              title={stage !== "open" ? undefined : "PDF and Print unlock once the day is checked"}
            >
              <Button
                variant="outline"
                size="sm"
                className="h-10 sm:h-9"
                onClick={() => exportPdf("download")}
                disabled={stage === "open" || exporting || loading}
                aria-label="Download PDF"
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin sm:mr-1.5" />
                ) : (
                  <Download className="h-4 w-4 sm:mr-1.5" />
                )}
                <span className="hidden sm:inline">PDF</span>
              </Button>
            </span>
            <span
              title={stage !== "open" ? undefined : "PDF and Print unlock once the day is checked"}
            >
              <Button
                variant="outline"
                size="sm"
                className="h-10 sm:h-9"
                onClick={() => exportPdf("print")}
                disabled={stage === "open" || exporting || loading}
                aria-label="Print"
              >
                <Printer className="h-4 w-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Print</span>
              </Button>
            </span>
          </div>
        </div>

        <TabsContent value="entry" className="mt-0">
          {!loading && (
            <SignoffBanner
              stage={stage}
              approval={approval}
              locked={locked}
              isAdmin={isAdmin}
              canCheck={canCheck}
              canApprove={canApprove}
              dirtyCount={dirty.size}
              onAction={setConfirm}
            />
          )}

          <div className="grid grid-cols-4 gap-px bg-border rounded-2xl border border-border overflow-hidden shadow-sm mb-3">
            <Stat label="Purchases" value={inr(live.amount)} />
            <Stat label="Cash paid" value={inr(live.cash)} tone="text-emerald-700" />
            <Stat label="Online paid" value={inr(live.online)} tone="text-sky-700" />
            <Stat
              label="Due today"
              value={inr(live.due)}
              tone={live.due > 0 ? "text-amber-700" : undefined}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="relative basis-full sm:basis-auto sm:flex-1 sm:min-w-[180px]">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find vendor or item…"
                className="pl-9 h-10 sm:h-9"
                enterKeyHint="search"
              />
            </div>
            {multiShown.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-10 sm:h-9"
                onClick={toggleAll}
                aria-label={allOpen ? "Collapse item tables" : "Expand item tables"}
              >
                {allOpen ? (
                  <ChevronsDownUp className="h-4 w-4 sm:mr-1.5" />
                ) : (
                  <ChevronsUpDown className="h-4 w-4 sm:mr-1.5" />
                )}
                <span className="hidden sm:inline">
                  {allOpen ? "Collapse item tables" : "Expand item tables"}
                </span>
              </Button>
            )}
            {!locked && (
              <Button
                variant="outline"
                size="sm"
                className="h-10 sm:h-9 border-primary/40 text-primary hover:text-primary"
                onClick={() => setShowAddVendor(true)}
                aria-label="Add vendor"
              >
                <Plus className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Add vendor</span>
                <span className="sm:hidden">Vendor</span>
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
          ) : shown.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
              No vendors match your search.
            </div>
          ) : (
            <div ref={areaRef} onKeyDown={onKeyDown}>
              <MasterTable
                rows={shown.map((v) => ({
                  vendor: v,
                  draft: draftOf(v),
                  saved: savedIds.has(v.id),
                  dirty: dirty.has(v.id),
                }))}
                phone={compact}
                locked={locked}
                priceHints={lastPrice}
                totals={{
                  amount: live.amount,
                  paid: live.paid,
                  due: live.due,
                  online: live.online,
                }}
                onChange={patchDraft}
                onOpenItems={openItems}
              />

              {multiShown.length > 0 && (
                <div className="mt-6">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Item tables · multi-product vendors
                  </h3>
                  <div className="grid gap-3 lg:grid-cols-2 items-start">
                    {multiShown.map((v) => (
                      <DetailCard
                        key={v.id}
                        vendor={v}
                        draft={draftOf(v)}
                        open={!collapsed.has(v.id)}
                        onToggle={() => toggleCard(v.id)}
                        locked={locked}
                        unitOptions={unitOptions}
                        hints={lastPrice}
                        focusUid={focusUid}
                        onItem={patchItem}
                        onAdd={addItem}
                        onRemove={removeItem}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {dirty.size > 0 && (
            <>
              <div className="h-20" aria-hidden />
              <div
                className={cn(
                  "fixed inset-x-0 z-30 px-3 pointer-events-none md:pr-6 md:pl-[calc(14rem+1.5rem)]",
                  phone ? "bottom-[calc(68px+env(safe-area-inset-bottom))]" : "bottom-3",
                )}
              >
                <div className="pointer-events-auto mx-auto max-w-6xl flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-surface/95 backdrop-blur shadow-lg px-3 py-2">
                  <div className="min-w-0 text-xs">
                    <div className="font-semibold text-sm">{dirty.size} unsaved</div>
                    <div className="text-muted-foreground truncate">
                      Amount {inr(unsavedSum.amount)}
                      {unsavedSum.due > 0 && (
                        <span className="text-amber-700"> · Due {inr(unsavedSum.due)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={discardAll}
                      disabled={saving.size > 0}
                    >
                      Discard
                    </Button>
                    <Button
                      size="sm"
                      disabled={saving.size > 0}
                      onClick={() => saveVendors(unsaved)}
                    >
                      {saving.size > 0 ? (
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-1.5" />
                      )}
                      Save all
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="dues" className="mt-0">
          <DuesView owing={owing} dues={dues} onPay={(v) => setPayDialog(v)} />
        </TabsContent>
      </Tabs>

      <SignoffDialog
        action={confirm}
        businessDate={businessDate}
        totals={saved}
        pendingCount={pendingCount}
        busy={approvalBusy}
        onClose={() => setConfirm(null)}
        onConfirm={runSignoff}
      />

      {showAddVendor && profile && (
        <AddVendorDialog
          businessDate={businessDate}
          existingNames={vendors.map((x) => x.name)}
          unitOptions={unitOptions}
          categories={categories}
          onClose={() => setShowAddVendor(false)}
          onCreated={(name) => {
            setShowAddVendor(false);
            toast.success(`${name} added`);
            load({ keepDirty: true });
          }}
        />
      )}

      {payDialog && (
        <PaymentDialog
          vendor={payDialog}
          due={dues[payDialog.id] ?? 0}
          businessDate={businessDate}
          onClose={() => setPayDialog(null)}
          onSaved={() => {
            setPayDialog(null);
            loadDues([...vendors, ...dueVendors]);
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
    <div className="bg-surface px-2 sm:px-3 py-2 sm:py-2.5 min-w-0">
      <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-muted-foreground truncate">
        {label}
      </div>
      <div className={cn("text-sm sm:text-lg font-bold tabular-nums leading-tight truncate", tone)}>
        {value}
      </div>
    </div>
  );
}
