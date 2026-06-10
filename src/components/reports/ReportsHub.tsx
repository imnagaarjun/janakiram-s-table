import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { Loader2, CalendarDays, Download, Printer } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import {
  presetRange, toCsv, downloadCsv, openPdfReport, fmtIST, istDayKey, istHour, safeFilename, inr,
  type RangeKey, type DateRange,
} from "@/lib/reports";
import {
  DailyPurchaseReport, VendorDuesReport, CashReconArchive,
  OwnersDrawingsReport, DailyPnLReport,
} from "./ProcurementReports";

// ---- Data shapes (loose) ----
interface Invoice {
  id: string; invoice_no: string; session_id: string; status: string;
  base: number; cgst: number; sgst: number; service_charge: number;
  discount: number; round_off: number; total: number;
  complimentary: boolean; discount_reason: string | null;
  issued_at: string; voided_at: string | null; void_reason: string | null;
  issued_by: string | null; business_date: string;
}
interface Payment { id: string; invoice_id: string; mode: string; amount: number; ref_no: string | null; created_at: string }
interface Session { id: string; table_code: string | null; channel: string; pax: number; opened_at: string; closed_at: string | null; status: string; opened_by: string | null }
interface Kot { id: string; session_id: string; kot_no: number; sent_at: string; status: string; created_by: string | null; updated_at: string; business_date: string }
interface KotItem { id: string; kot_id: string; menu_item_id: string; qty: number; status: string; note: string | null; created_at: string }
interface Ledger { id: string; pool_id: string; qty_delta: number; reason: string; note: string | null; created_at: string; created_by: string | null; business_date: string }
interface Pool { id: string; name: string; type: string; unit: string }
interface Item { id: string; name: string; category_id: string | null; is_active: boolean; is_86: boolean; stock_mode: string }
interface Cat { id: string; name: string }
interface MPrice { menu_item_id: string; channel_key: string; base_price: number; inclusive_price: number; gst_rate: number }
interface Alloc { id: string; date: string; waiter_id: string; table_code: string; shift: string }
interface Waiter { id: string; name: string; is_active: boolean }
interface Audit { id: string; action: string; entity: string; entity_id: string | null; ts: string; actor: string | null; before: unknown; after: unknown }
interface ProfileRow { id: string; name: string }

interface Dataset {
  invoices: Invoice[]; payments: Payment[]; sessions: Session[];
  kots: Kot[]; kotItems: KotItem[]; ledger: Ledger[]; pools: Pool[];
  items: Item[]; cats: Cat[]; prices: MPrice[]; allocs: Alloc[]; waiters: Waiter[];
  audit: Audit[]; profiles: ProfileRow[];
}

const EMPTY: Dataset = { invoices: [], payments: [], sessions: [], kots: [], kotItems: [], ledger: [], pools: [], items: [], cats: [], prices: [], allocs: [], waiters: [], audit: [], profiles: [] };

export function ReportsHub() {
  const { roles, profile } = useAuth();
  const isAdmin = roles.includes("admin");
  const isManager = roles.includes("manager") || isAdmin;
  const isCashier = roles.includes("cashier") || isManager;
  const isWaiter = roles.includes("waiter");

  const [rangeKey, setRangeKey] = useState<RangeKey>("today");
  const [custom, setCustom] = useState<{ from: Date; to: Date } | undefined>();
  const range: DateRange = useMemo(() => presetRange(rangeKey, custom), [rangeKey, custom]);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Dataset>(EMPTY);

  const load = useCallback(async () => {
    setLoading(true);
    const fromIso = range.from.toISOString();
    const toIso = range.to.toISOString();
    const fromDate = istDayKey(range.from);
    const toDate = istDayKey(range.to);

    const [
      invoicesR, sessionsR, kotsR, ledgerR, poolsR, itemsR, catsR, pricesR, allocsR, waitersR, auditR, profilesR,
    ] = await Promise.all([
      db.from("invoices").select("*").gte("business_date", fromDate).lte("business_date", toDate).order("issued_at"),
      db.from("order_sessions").select("*").gte("opened_at", fromIso).lte("opened_at", toIso),
      db.from("kots").select("*").gte("business_date", fromDate).lte("business_date", toDate),
      db.from("stock_ledger").select("*").gte("business_date", fromDate).lte("business_date", toDate),
      db.from("stock_pools").select("id,name,type,unit"),
      db.from("menu_items").select("id,name,category_id,is_active,is_86,stock_mode"),
      db.from("categories").select("id,name"),
      db.from("menu_prices").select("menu_item_id,channel_key,base_price,inclusive_price,gst_rate"),
      db.from("waiter_allocations").select("*").gte("date", fromDate).lte("date", toDate),
      db.from("waiters").select("id,name,is_active"),
      isManager
        ? db.from("audit_log").select("id,action,entity,entity_id,ts,actor,before,after").gte("ts", fromIso).lte("ts", toIso).order("ts", { ascending: false })
        : Promise.resolve({ data: [] }),
      db.from("profiles").select("id,name"),
    ]);

    const invoices: Invoice[] = invoicesR.data ?? [];
    const kots: Kot[] = kotsR.data ?? [];
    const sessions: Session[] = sessionsR.data ?? [];
    const kotIds = kots.map((k) => k.id);

    // Pull payments for these invoices and kot_items for these kots in parallel.
    const [paymentsR, kotItemsR] = await Promise.all([
      invoices.length
        ? db.from("payments").select("*").in("invoice_id", invoices.map((i) => i.id))
        : Promise.resolve({ data: [] }),
      kotIds.length
        ? db.from("kot_items").select("*").in("kot_id", kotIds)
        : Promise.resolve({ data: [] }),
    ]);

    setData({
      invoices,
      payments: paymentsR.data ?? [],
      sessions,
      kots,
      kotItems: kotItemsR.data ?? [],
      ledger: ledgerR.data ?? [],
      pools: poolsR.data ?? [],
      items: itemsR.data ?? [],
      cats: catsR.data ?? [],
      prices: pricesR.data ?? [],
      allocs: allocsR.data ?? [],
      waiters: waitersR.data ?? [],
      audit: auditR.data ?? [],
      profiles: profilesR.data ?? [],
    });
    setLoading(false);
  }, [range.from, range.to, isManager]);

  useEffect(() => { load(); }, [load]);

  // Lookups
  const itemMap = useMemo(() => new Map(data.items.map((i) => [i.id, i])), [data.items]);
  const catMap = useMemo(() => new Map(data.cats.map((c) => [c.id, c.name])), [data.cats]);
  const sessionMap = useMemo(() => new Map(data.sessions.map((s) => [s.id, s])), [data.sessions]);
  const invoiceMap = useMemo(() => new Map(data.invoices.map((i) => [i.id, i])), [data.invoices]);
  const poolMap = useMemo(() => new Map(data.pools.map((p) => [p.id, p])), [data.pools]);
  const waiterMap = useMemo(() => new Map(data.waiters.map((w) => [w.id, w])), [data.waiters]);
  const profileMap = useMemo(() => new Map(data.profiles.map((p) => [p.id, p.name])), [data.profiles]);

  // price lookup by item+channel
  const priceFor = useCallback(
    (itemId: string, channel: string): MPrice | undefined =>
      data.prices.find((p) => p.menu_item_id === itemId && p.channel_key === channel),
    [data.prices],
  );

  // Allocation: tableCode + IST date → waiter
  const waiterForSession = useCallback(
    (s: Session): Waiter | null => {
      if (!s.table_code) return null;
      const dayKey = istDayKey(s.opened_at);
      const match = data.allocs.find((a) => a.date === dayKey && a.table_code === s.table_code);
      return match ? waiterMap.get(match.waiter_id) ?? null : null;
    },
    [data.allocs, waiterMap],
  );

  // Tabs by role
  type TabDef = { value: string; label: string; render: () => ReactElement };
  const allTabs: TabDef[] = [
    { value: "daily", label: "Daily Sales", render: () => <DailySales {...{ data, range }} /> },
    { value: "items", label: "Itemwise", render: () => <ItemwiseSales {...{ data, range, itemMap, sessionMap, priceFor }} /> },
    { value: "cats", label: "Category", render: () => <CategorySales {...{ data, range, itemMap, catMap, sessionMap, priceFor }} /> },
    { value: "hourly", label: "Hourly", render: () => <HourlyPeaks {...{ data, range }} /> },
    { value: "bills", label: "Bill Register", render: () => <BillRegister {...{ data, range, sessionMap, profileMap }} /> },
    { value: "pay", label: "Payments", render: () => <PaymentSplit {...{ data, range }} /> },
    { value: "avg", label: "Avg Bill & Turnover", render: () => <AvgTurnover {...{ data, range, sessionMap }} /> },
    { value: "kots", label: "KOT Register", render: () => <KotRegister {...{ data, range, sessionMap, profileMap }} /> },
    { value: "prep", label: "Prep Time", render: () => <PrepTime {...{ data, range, sessionMap }} /> },
    { value: "voids", label: "Voids/Discounts", render: () => <VoidsDiscounts {...{ data, range, itemMap, profileMap }} /> },
    { value: "stock", label: "Stock", render: () => <StockReport {...{ data, range }} /> },
    { value: "waste", label: "Wastage", render: () => <Wastage {...{ data, range, poolMap, profileMap }} /> },
    { value: "86", label: "Sold-out / 86", render: () => <SoldOut86 {...{ data, range, itemMap, profileMap }} /> },
    { value: "waiters", label: "Waiter Sales", render: () => <WaiterSales {...{ data, range, sessionMap, waiterForSession }} /> },
    { value: "alloc", label: "Allocations", render: () => <AllocationLog {...{ data, range, waiterMap }} /> },
    { value: "z", label: "Z-Report", render: () => <ZReport {...{ data, range }} /> },
    { value: "purch", label: "Purchases", render: () => <DailyPurchaseReport range={range} /> },
    { value: "dues", label: "Vendor Dues", render: () => <VendorDuesReport range={range} /> },
    { value: "recon", label: "Cash Recon", render: () => <CashReconArchive range={range} /> },
    { value: "drawings", label: "Owner Drawings", render: () => <OwnersDrawingsReport range={range} /> },
    { value: "pnl", label: "Daily P&L", render: () => <DailyPnLReport range={range} /> },
  ];

  let tabs: TabDef[];
  if (isManager) tabs = allTabs;
  else if (isCashier) tabs = allTabs.filter((t) => ["daily", "bills", "pay", "z"].includes(t.value));
  else if (isWaiter) {
    tabs = [{
      value: "mine", label: "My Sales",
      render: () => <WaiterSales {...{ data, range, sessionMap, waiterForSession }} ownName={profile?.name ?? null} />,
    }];
  } else tabs = [];

  const [tab, setTab] = useState(tabs[0]?.value ?? "daily");
  useEffect(() => { if (!tabs.find((t) => t.value === tab) && tabs[0]) setTab(tabs[0].value); }, [tabs, tab]);

  return (
    <div className="p-3 md:p-5 max-w-[1400px] mx-auto">
      <header className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-muted-foreground">{range.label}: {fmtIST(range.from, "dd MMM")} → {fmtIST(range.to, "dd MMM yyyy")}</p>
        </div>
        <div className="flex flex-wrap gap-1 ml-auto">
          {(["today","yesterday","week","month"] as RangeKey[]).map((k) => (
            <Button key={k} size="sm" variant={rangeKey===k?"default":"outline"} onClick={() => { setRangeKey(k); setCustom(undefined); }}>
              {k==="today"?"Today":k==="yesterday"?"Yesterday":k==="week"?"This week":"This month"}
            </Button>
          ))}
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant={rangeKey==="custom"?"default":"outline"}>
                <CalendarDays className="h-4 w-4 mr-1" />Custom
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" align="end">
              <Calendar mode="range" numberOfMonths={2} selected={custom ? { from: custom.from, to: custom.to } : undefined}
                onSelect={(r) => { if (r?.from && r?.to) { setCustom({ from: r.from, to: r.to }); setRangeKey("custom"); } }}
                className={cn("p-2 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : tabs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reports available for your role.</p>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex flex-wrap h-auto justify-start gap-1 mb-3">
            {tabs.map((t) => <TabsTrigger key={t.value} value={t.value} className="text-xs">{t.label}</TabsTrigger>)}
          </TabsList>
          {tabs.map((t) => (
            <TabsContent key={t.value} value={t.value}>{t.render()}</TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

// =============== Shared table component ===============
interface Col { key: string; label: string; numeric?: boolean; render?: (v: unknown, row: Record<string, unknown>) => string }
interface ReportSectionProps {
  title: string;
  range: DateRange;
  columns: Col[];
  rows: Record<string, unknown>[];
  summary?: { label: string; value: string }[];
}
function ReportSection({ title, range, columns, rows, summary }: ReportSectionProps) {
  const csvRows = rows.map((r) => columns.map((c) => {
    const v = r[c.key];
    if (c.render) return c.render(v, r);
    return v == null ? "" : v as string | number;
  }));
  const handleCsv = () => {
    const csv = toCsv(columns.map((c) => c.label), csvRows);
    downloadCsv(`${safeFilename(title)}_${format(range.from, "yyyyMMdd")}-${format(range.to, "yyyyMMdd")}.csv`, csv);
  };
  const handlePdf = () => {
    openPdfReport({
      title,
      subtitle: `${range.label}: ${fmtIST(range.from, "dd MMM")} → ${fmtIST(range.to, "dd MMM yyyy")}`,
      headers: columns.map((c) => c.label),
      rows: csvRows,
      summary,
    });
  };
  return (
    <section className="rounded-xl border bg-card p-3 md:p-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h2 className="text-base font-semibold">{title}</h2>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="outline" onClick={handleCsv}><Download className="h-4 w-4 mr-1" />CSV</Button>
          <Button size="sm" variant="outline" onClick={handlePdf}><Printer className="h-4 w-4 mr-1" />PDF</Button>
        </div>
      </div>
      {summary && summary.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          {summary.map((s) => (
            <div key={s.label} className="rounded-lg border bg-surface p-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</div>
              <div className="text-sm font-bold">{s.value}</div>
            </div>
          ))}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-[10px] uppercase tracking-wide text-muted-foreground">
              {columns.map((c) => <th key={c.key} className={cn("text-left px-2 py-2", c.numeric && "text-right")}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={columns.length} className="text-center text-muted-foreground py-8">No data in range.</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i} className="border-b last:border-0 hover:bg-accent/40">
                {columns.map((c) => {
                  const v = r[c.key];
                  const display = c.render ? c.render(v, r) : v == null ? "—" : String(v);
                  return <td key={c.key} className={cn("px-2 py-1.5 align-top", c.numeric && "text-right tabular-nums")}>{display}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// =============== Helpers ===============
function activeLines(data: Dataset) {
  return data.kotItems.filter((ki) => ki.status !== "void");
}

// =============== Reports ===============
function DailySales({ data, range }: { data: Dataset; range: DateRange }) {
  // Bucket settled invoices by IST day + channel (via session)
  const sessionMap = new Map(data.sessions.map((s) => [s.id, s]));
  const settled = data.invoices.filter((i) => i.status === "settled");
  type Row = { day: string; channel: string; bills: number; base: number; cgst: number; sgst: number; service: number; discount: number; total: number };
  const map = new Map<string, Row>();
  for (const inv of settled) {
    const s = sessionMap.get(inv.session_id);
    const ch = s?.channel ?? "—";
    const day = inv.business_date;   // authoritative: set server-side at settlement
    const key = `${day}::${ch}`;
    const r = map.get(key) ?? { day, channel: ch, bills: 0, base: 0, cgst: 0, sgst: 0, service: 0, discount: 0, total: 0 };
    r.bills += 1; r.base += +inv.base; r.cgst += +inv.cgst; r.sgst += +inv.sgst;
    r.service += +inv.service_charge; r.discount += +inv.discount; r.total += +inv.total;
    map.set(key, r);
  }
  const rows = [...map.values()].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.channel.localeCompare(b.channel)));
  const t = rows.reduce((a, r) => ({ bills: a.bills + r.bills, base: a.base + r.base, cgst: a.cgst + r.cgst, sgst: a.sgst + r.sgst, service: a.service + r.service, discount: a.discount + r.discount, total: a.total + r.total }), { bills: 0, base: 0, cgst: 0, sgst: 0, service: 0, discount: 0, total: 0 });
  return (
    <ReportSection title="Daily sales summary" range={range}
      columns={[
        { key: "day", label: "Day" },
        { key: "channel", label: "Channel" },
        { key: "bills", label: "Bills", numeric: true },
        { key: "base", label: "Net", numeric: true, render: (v) => inr(Number(v)) },
        { key: "cgst", label: "CGST", numeric: true, render: (v) => inr(Number(v)) },
        { key: "sgst", label: "SGST", numeric: true, render: (v) => inr(Number(v)) },
        { key: "service", label: "Service", numeric: true, render: (v) => inr(Number(v)) },
        { key: "discount", label: "Discount", numeric: true, render: (v) => inr(Number(v)) },
        { key: "total", label: "Gross", numeric: true, render: (v) => inr(Number(v)) },
      ]}
      rows={rows as unknown as Record<string, unknown>[]}
      summary={[
        { label: "Bills", value: String(t.bills) },
        { label: "Net", value: inr(t.base) },
        { label: "GST", value: inr(t.cgst + t.sgst) },
        { label: "Gross", value: inr(t.total) },
      ]}
    />
  );
}

function ItemwiseSales({ data, range, itemMap, sessionMap, priceFor }: { data: Dataset; range: DateRange; itemMap: Map<string, Item>; sessionMap: Map<string, Session>; priceFor: (id: string, ch: string) => MPrice | undefined }) {
  // For each KOT in range with a settled invoice, attribute sold items.
  const sessionsSettled = new Set(data.invoices.filter((i) => i.status === "settled").map((i) => i.session_id));
  const map = new Map<string, { name: string; qty: number; gross: number; base: number }>();
  for (const k of data.kots) {
    if (!sessionsSettled.has(k.session_id)) continue;
    const s = sessionMap.get(k.session_id);
    const ch = s?.channel ?? "dinein";
    for (const ki of data.kotItems) {
      if (ki.kot_id !== k.id || ki.status === "void") continue;
      const it = itemMap.get(ki.menu_item_id);
      const pr = priceFor(ki.menu_item_id, ch);
      const qty = Number(ki.qty);
      const gross = (pr?.inclusive_price ?? 0) * qty;
      const base = (pr?.base_price ?? 0) * qty;
      const row = map.get(ki.menu_item_id) ?? { name: it?.name ?? "—", qty: 0, gross: 0, base: 0 };
      row.qty += qty; row.gross += gross; row.base += base;
      map.set(ki.menu_item_id, row);
    }
  }
  const rows = [...map.values()].sort((a, b) => b.gross - a.gross);
  const totals = rows.reduce((a, r) => ({ qty: a.qty + r.qty, gross: a.gross + r.gross, base: a.base + r.base }), { qty: 0, gross: 0, base: 0 });
  return (
    <ReportSection title="Itemwise sales" range={range}
      columns={[
        { key: "name", label: "Item" },
        { key: "qty", label: "Qty", numeric: true },
        { key: "base", label: "Net", numeric: true, render: (v) => inr(Number(v)) },
        { key: "gross", label: "Gross", numeric: true, render: (v) => inr(Number(v)) },
      ]}
      rows={rows as unknown as Record<string, unknown>[]}
      summary={[{ label: "Items sold", value: String(totals.qty) }, { label: "Net", value: inr(totals.base) }, { label: "Gross", value: inr(totals.gross) }]}
    />
  );
}

function CategorySales({ data, range, itemMap, catMap, sessionMap, priceFor }: { data: Dataset; range: DateRange; itemMap: Map<string, Item>; catMap: Map<string, string>; sessionMap: Map<string, Session>; priceFor: (id: string, ch: string) => MPrice | undefined }) {
  const sessionsSettled = new Set(data.invoices.filter((i) => i.status === "settled").map((i) => i.session_id));
  const map = new Map<string, { category: string; qty: number; gross: number }>();
  for (const k of data.kots) {
    if (!sessionsSettled.has(k.session_id)) continue;
    const ch = sessionMap.get(k.session_id)?.channel ?? "dinein";
    for (const ki of data.kotItems) {
      if (ki.kot_id !== k.id || ki.status === "void") continue;
      const it = itemMap.get(ki.menu_item_id);
      const cat = it?.category_id ? catMap.get(it.category_id) ?? "Uncategorised" : "Uncategorised";
      const pr = priceFor(ki.menu_item_id, ch);
      const qty = Number(ki.qty);
      const gross = (pr?.inclusive_price ?? 0) * qty;
      const r = map.get(cat) ?? { category: cat, qty: 0, gross: 0 };
      r.qty += qty; r.gross += gross;
      map.set(cat, r);
    }
  }
  const rows = [...map.values()].sort((a, b) => b.gross - a.gross);
  const total = rows.reduce((a, r) => a + r.gross, 0);
  return (
    <ReportSection title="Category-wise sales" range={range}
      columns={[
        { key: "category", label: "Category" },
        { key: "qty", label: "Qty", numeric: true },
        { key: "gross", label: "Gross", numeric: true, render: (v) => inr(Number(v)) },
      ]}
      rows={rows as unknown as Record<string, unknown>[]}
      summary={[{ label: "Categories", value: String(rows.length) }, { label: "Total gross", value: inr(total) }]}
    />
  );
}

function HourlyPeaks({ data, range }: { data: Dataset; range: DateRange }) {
  const settled = data.invoices.filter((i) => i.status === "settled");
  const buckets = new Map<number, { hour: number; bills: number; gross: number }>();
  for (let h = 0; h < 24; h++) buckets.set(h, { hour: h, bills: 0, gross: 0 });
  for (const inv of settled) {
    const h = istHour(inv.issued_at);
    const r = buckets.get(h)!;
    r.bills += 1; r.gross += +inv.total;
  }
  const rows = [...buckets.values()].filter((r) => r.bills > 0);
  return (
    <ReportSection title="Hourly peaks" range={range}
      columns={[
        { key: "hour", label: "Hour (IST)", render: (v) => `${String(v).padStart(2, "0")}:00 – ${String(Number(v) + 1).padStart(2, "0")}:00` },
        { key: "bills", label: "Bills", numeric: true },
        { key: "gross", label: "Gross", numeric: true, render: (v) => inr(Number(v)) },
      ]}
      rows={rows as unknown as Record<string, unknown>[]}
    />
  );
}

function BillRegister({ data, range, sessionMap, profileMap }: { data: Dataset; range: DateRange; sessionMap: Map<string, Session>; profileMap: Map<string, string> }) {
  const rows = data.invoices
    .slice()
    .sort((a, b) => (a.issued_at < b.issued_at ? 1 : -1))
    .map((inv) => {
      const s = sessionMap.get(inv.session_id);
      const paid = data.payments.filter((p) => p.invoice_id === inv.id).reduce((x, p) => x + +p.amount, 0);
      return {
        invoice_no: inv.invoice_no,
        issued_at: fmtIST(inv.issued_at),
        table: s?.table_code ?? "—",
        channel: s?.channel ?? "—",
        pax: s?.pax ?? 0,
        status: inv.status,
        cashier: inv.issued_by ? profileMap.get(inv.issued_by) ?? "—" : "—",
        base: +inv.base, cgst: +inv.cgst, sgst: +inv.sgst, discount: +inv.discount, total: +inv.total,
        paid,
      };
    });
  const settled = rows.filter((r) => r.status === "settled");
  return (
    <ReportSection title="Bill register" range={range}
      columns={[
        { key: "invoice_no", label: "Invoice" },
        { key: "issued_at", label: "When" },
        { key: "table", label: "Table" },
        { key: "channel", label: "Channel" },
        { key: "pax", label: "Pax", numeric: true },
        { key: "cashier", label: "Cashier" },
        { key: "base", label: "Net", numeric: true, render: (v) => inr(Number(v)) },
        { key: "cgst", label: "CGST", numeric: true, render: (v) => inr(Number(v)) },
        { key: "sgst", label: "SGST", numeric: true, render: (v) => inr(Number(v)) },
        { key: "discount", label: "Disc", numeric: true, render: (v) => inr(Number(v)) },
        { key: "total", label: "Total", numeric: true, render: (v) => inr(Number(v)) },
        { key: "paid", label: "Paid", numeric: true, render: (v) => inr(Number(v)) },
        { key: "status", label: "Status" },
      ]}
      rows={rows as unknown as Record<string, unknown>[]}
      summary={[
        { label: "Bills", value: String(rows.length) },
        { label: "Settled", value: String(settled.length) },
        { label: "Gross", value: inr(settled.reduce((a, r) => a + r.total, 0)) },
      ]}
    />
  );
}

function PaymentSplit({ data, range }: { data: Dataset; range: DateRange }) {
  const settledIds = new Set(data.invoices.filter((i) => i.status === "settled").map((i) => i.id));
  const map = new Map<string, { mode: string; count: number; amount: number }>();
  for (const p of data.payments) {
    if (!settledIds.has(p.invoice_id)) continue;
    const r = map.get(p.mode) ?? { mode: p.mode, count: 0, amount: 0 };
    r.count += 1; r.amount += +p.amount;
    map.set(p.mode, r);
  }
  const rows = [...map.values()].sort((a, b) => b.amount - a.amount);
  const total = rows.reduce((a, r) => a + r.amount, 0);
  return (
    <ReportSection title="Payment-mode split" range={range}
      columns={[
        { key: "mode", label: "Mode", render: (v) => String(v).toUpperCase() },
        { key: "count", label: "Txns", numeric: true },
        { key: "amount", label: "Amount", numeric: true, render: (v) => inr(Number(v)) },
        { key: "pct", label: "% Mix", numeric: true, render: (_v, r) => total === 0 ? "—" : `${((Number(r.amount) / total) * 100).toFixed(1)}%` },
      ]}
      rows={rows as unknown as Record<string, unknown>[]}
      summary={[{ label: "Total received", value: inr(total) }]}
    />
  );
}

function AvgTurnover({ data, range, sessionMap }: { data: Dataset; range: DateRange; sessionMap: Map<string, Session> }) {
  const settled = data.invoices.filter((i) => i.status === "settled");
  const dinein = settled.filter((i) => sessionMap.get(i.session_id)?.channel === "dinein");
  const gross = settled.reduce((a, r) => a + +r.total, 0);
  const avgBill = settled.length ? gross / settled.length : 0;
  // Turnover by table = number of settled dine-in sessions per table
  const byTable = new Map<string, number>();
  let totalDuration = 0; let counted = 0;
  for (const inv of dinein) {
    const s = sessionMap.get(inv.session_id);
    if (!s?.table_code) continue;
    byTable.set(s.table_code, (byTable.get(s.table_code) ?? 0) + 1);
    if (s.closed_at) {
      totalDuration += new Date(s.closed_at).getTime() - new Date(s.opened_at).getTime();
      counted += 1;
    }
  }
  const avgMin = counted ? Math.round(totalDuration / counted / 60000) : 0;
  const rows = [...byTable.entries()].map(([code, turns]) => ({ table: code, turns })).sort((a, b) => b.turns - a.turns);
  return (
    <ReportSection title="Average bill & table turnover" range={range}
      columns={[
        { key: "table", label: "Table" },
        { key: "turns", label: "Turns", numeric: true },
      ]}
      rows={rows as unknown as Record<string, unknown>[]}
      summary={[
        { label: "Bills", value: String(settled.length) },
        { label: "Avg bill", value: inr(avgBill) },
        { label: "Avg dine-in time", value: `${avgMin} min` },
        { label: "Dine-in turns", value: String(dinein.length) },
      ]}
    />
  );
}

function KotRegister({ data, range, sessionMap, profileMap }: { data: Dataset; range: DateRange; sessionMap: Map<string, Session>; profileMap: Map<string, string> }) {
  const rows = data.kots.slice().sort((a, b) => (a.sent_at < b.sent_at ? 1 : -1)).map((k) => {
    const items = data.kotItems.filter((ki) => ki.kot_id === k.id);
    const active = items.filter((ki) => ki.status !== "void").reduce((a, ki) => a + Number(ki.qty), 0);
    const voided = items.filter((ki) => ki.status === "void").reduce((a, ki) => a + Number(ki.qty), 0);
    const s = sessionMap.get(k.session_id);
    return {
      kot_no: `K-${String(k.kot_no).padStart(4, "0")}`,
      sent_at: fmtIST(k.sent_at),
      table: s?.table_code ?? "—",
      channel: s?.channel ?? "—",
      status: k.status,
      waiter: k.created_by ? profileMap.get(k.created_by) ?? "—" : "—",
      lines: items.length,
      qty: active,
      voided,
    };
  });
  return (
    <ReportSection title="KOT register" range={range}
      columns={[
        { key: "kot_no", label: "KOT" },
        { key: "sent_at", label: "Sent" },
        { key: "table", label: "Table" },
        { key: "channel", label: "Channel" },
        { key: "status", label: "Status" },
        { key: "waiter", label: "By" },
        { key: "lines", label: "Lines", numeric: true },
        { key: "qty", label: "Qty", numeric: true },
        { key: "voided", label: "Voided", numeric: true },
      ]}
      rows={rows as unknown as Record<string, unknown>[]}
      summary={[{ label: "KOTs", value: String(rows.length) }]}
    />
  );
}

function PrepTime({ data, range, sessionMap }: { data: Dataset; range: DateRange; sessionMap: Map<string, Session> }) {
  const rows = data.kots
    .filter((k) => k.status === "ready" || k.status === "served")
    .map((k) => {
      const minutes = (new Date(k.updated_at).getTime() - new Date(k.sent_at).getTime()) / 60000;
      const s = sessionMap.get(k.session_id);
      return {
        kot_no: `K-${String(k.kot_no).padStart(4, "0")}`,
        sent_at: fmtIST(k.sent_at),
        table: s?.table_code ?? "—",
        minutes: Number(minutes.toFixed(1)),
      };
    })
    .sort((a, b) => b.minutes - a.minutes);
  const avg = rows.length ? rows.reduce((a, r) => a + r.minutes, 0) / rows.length : 0;
  return (
    <ReportSection title="Prep time per ticket" range={range}
      columns={[
        { key: "kot_no", label: "KOT" },
        { key: "sent_at", label: "Sent" },
        { key: "table", label: "Table" },
        { key: "minutes", label: "Minutes", numeric: true },
      ]}
      rows={rows as unknown as Record<string, unknown>[]}
      summary={[{ label: "Tickets", value: String(rows.length) }, { label: "Average", value: `${avg.toFixed(1)} min` }]}
    />
  );
}

function VoidsDiscounts({ data, range, itemMap, profileMap }: { data: Dataset; range: DateRange; itemMap: Map<string, Item>; profileMap: Map<string, string> }) {
  const voids = data.audit
    .filter((a) => a.action === "void_kot_item")
    .map((a) => {
      const after = (a.after ?? {}) as { reason?: string; note?: string; menu_item?: string; qty?: number };
      return {
        when: fmtIST(a.ts), kind: "Void",
        item: after.menu_item ?? "—",
        qty: after.qty ?? 0,
        reason: after.reason ?? "—",
        note: after.note ?? "",
        actor: a.actor ? profileMap.get(a.actor) ?? "—" : "—",
      };
    });
  const discs = data.invoices
    .filter((i) => +i.discount > 0 || i.complimentary)
    .map((i) => ({
      when: fmtIST(i.issued_at), kind: i.complimentary ? "Complimentary" : "Discount",
      item: i.invoice_no,
      qty: 1,
      reason: i.discount_reason ?? "—",
      note: inr(+i.discount),
      actor: i.issued_by ? profileMap.get(i.issued_by) ?? "—" : "—",
    }));
  const rows = [...voids, ...discs].sort((a, b) => (a.when < b.when ? 1 : -1));
  void itemMap; // silence unused
  return (
    <ReportSection title="Void & discount report" range={range}
      columns={[
        { key: "when", label: "When" },
        { key: "kind", label: "Kind" },
        { key: "item", label: "Item / Invoice" },
        { key: "qty", label: "Qty", numeric: true },
        { key: "reason", label: "Reason" },
        { key: "note", label: "Note" },
        { key: "actor", label: "By" },
      ]}
      rows={rows as unknown as Record<string, unknown>[]}
      summary={[
        { label: "Voids", value: String(voids.length) },
        { label: "Discount bills", value: String(discs.length) },
      ]}
    />
  );
}

function StockReport({ data, range }: { data: Dataset; range: DateRange }) {
  const rows = data.pools.map((p) => {
    const ll = data.ledger.filter((l) => l.pool_id === p.id);
    const opening = ll.filter((l) => l.reason === "opening").reduce((a, l) => a + +l.qty_delta, 0);
    const restock = ll.filter((l) => l.reason === "restock").reduce((a, l) => a + +l.qty_delta, 0);
    const sale = -ll.filter((l) => l.reason === "sale").reduce((a, l) => a + +l.qty_delta, 0);
    const voidQ = ll.filter((l) => l.reason === "void").reduce((a, l) => a + +l.qty_delta, 0);
    const waste = -ll.filter((l) => l.reason === "wastage").reduce((a, l) => a + +l.qty_delta, 0);
    const leftover = opening + restock + voidQ - sale - waste;
    return { name: p.name, unit: p.unit, opening, restock, sale, voidQ, waste, leftover };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <ReportSection title="Stock report" range={range}
      columns={[
        { key: "name", label: "Pool" },
        { key: "unit", label: "Unit" },
        { key: "opening", label: "Opening", numeric: true },
        { key: "restock", label: "Restock", numeric: true },
        { key: "sale", label: "Sold", numeric: true },
        { key: "voidQ", label: "Voided back", numeric: true },
        { key: "waste", label: "Wastage", numeric: true },
        { key: "leftover", label: "Leftover", numeric: true },
      ]}
      rows={rows as unknown as Record<string, unknown>[]}
    />
  );
}

function Wastage({ data, range, poolMap, profileMap }: { data: Dataset; range: DateRange; poolMap: Map<string, Pool>; profileMap: Map<string, string> }) {
  const rows = data.ledger.filter((l) => l.reason === "wastage").map((l) => ({
    when: fmtIST(l.created_at),
    pool: poolMap.get(l.pool_id)?.name ?? "—",
    qty: -Number(l.qty_delta),
    note: l.note ?? "",
    by: l.created_by ? profileMap.get(l.created_by) ?? "—" : "—",
  }));
  return (
    <ReportSection title="Wastage report" range={range}
      columns={[
        { key: "when", label: "When" },
        { key: "pool", label: "Pool" },
        { key: "qty", label: "Qty wasted", numeric: true },
        { key: "note", label: "Note" },
        { key: "by", label: "By" },
      ]}
      rows={rows as unknown as Record<string, unknown>[]}
      summary={[{ label: "Wastage entries", value: String(rows.length) }]}
    />
  );
}

function SoldOut86({ data, range, itemMap, profileMap }: { data: Dataset; range: DateRange; itemMap: Map<string, Item>; profileMap: Map<string, string> }) {
  const rows = data.audit
    .filter((a) => a.action === "toggle_86" || a.action === "set_86" || (a.entity === "menu_item" && a.action.includes("86")))
    .map((a) => {
      const after = (a.after ?? {}) as { is_86?: boolean; name?: string };
      const id = a.entity_id ?? "";
      return {
        when: fmtIST(a.ts),
        item: itemMap.get(id)?.name ?? after.name ?? "—",
        state: after.is_86 ? "Marked 86" : "Cleared 86",
        by: a.actor ? profileMap.get(a.actor) ?? "—" : "—",
      };
    });
  const currently = data.items.filter((i) => i.is_86).map((i) => ({ when: "—", item: i.name, state: "Currently 86", by: "—" }));
  const all = [...currently, ...rows];
  return (
    <ReportSection title="Sold-out / 86 log" range={range}
      columns={[
        { key: "when", label: "When" },
        { key: "item", label: "Item" },
        { key: "state", label: "State" },
        { key: "by", label: "By" },
      ]}
      rows={all as unknown as Record<string, unknown>[]}
    />
  );
}

function WaiterSales({ data, range, sessionMap, waiterForSession, ownName }: { data: Dataset; range: DateRange; sessionMap: Map<string, Session>; waiterForSession: (s: Session) => Waiter | null; ownName?: string | null }) {
  const settled = data.invoices.filter((i) => i.status === "settled");
  const map = new Map<string, { waiter: string; bills: number; pax: number; gross: number }>();
  for (const inv of settled) {
    const s = sessionMap.get(inv.session_id);
    if (!s) continue;
    const w = waiterForSession(s);
    const name = w?.name ?? "Unallocated";
    if (ownName && name !== ownName) continue;
    const r = map.get(name) ?? { waiter: name, bills: 0, pax: 0, gross: 0 };
    r.bills += 1; r.pax += s.pax ?? 0; r.gross += +inv.total;
    map.set(name, r);
  }
  const rows = [...map.values()].sort((a, b) => b.gross - a.gross);
  return (
    <ReportSection title={ownName ? `My sales (${ownName})` : "Waiter-wise sales"} range={range}
      columns={[
        { key: "waiter", label: "Waiter" },
        { key: "bills", label: "Bills", numeric: true },
        { key: "pax", label: "Pax", numeric: true },
        { key: "gross", label: "Gross", numeric: true, render: (v) => inr(Number(v)) },
      ]}
      rows={rows as unknown as Record<string, unknown>[]}
      summary={[{ label: "Waiters", value: String(rows.length) }, { label: "Total gross", value: inr(rows.reduce((a, r) => a + r.gross, 0)) }]}
    />
  );
}

function AllocationLog({ data, range, waiterMap }: { data: Dataset; range: DateRange; waiterMap: Map<string, Waiter> }) {
  const rows = data.allocs.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((a) => ({
    date: a.date, table: a.table_code, shift: a.shift, waiter: waiterMap.get(a.waiter_id)?.name ?? "—",
  }));
  return (
    <ReportSection title="Allocation log" range={range}
      columns={[
        { key: "date", label: "Date" },
        { key: "shift", label: "Shift" },
        { key: "table", label: "Table" },
        { key: "waiter", label: "Waiter" },
      ]}
      rows={rows as unknown as Record<string, unknown>[]}
    />
  );
}

function ZReport({ data, range }: { data: Dataset; range: DateRange }) {
  const settled = data.invoices.filter((i) => i.status === "settled");
  const voided = data.invoices.filter((i) => i.status !== "settled");
  const gross = settled.reduce((a, r) => a + +r.total, 0);
  const net = settled.reduce((a, r) => a + +r.base, 0);
  const cgst = settled.reduce((a, r) => a + +r.cgst, 0);
  const sgst = settled.reduce((a, r) => a + +r.sgst, 0);
  const svc = settled.reduce((a, r) => a + +r.service_charge, 0);
  const disc = settled.reduce((a, r) => a + +r.discount, 0);
  const round = settled.reduce((a, r) => a + +r.round_off, 0);
  const settledIds = new Set(settled.map((i) => i.id));
  const payMap = new Map<string, number>();
  for (const p of data.payments) {
    if (!settledIds.has(p.invoice_id)) continue;
    payMap.set(p.mode, (payMap.get(p.mode) ?? 0) + +p.amount);
  }
  const rows: { metric: string; value: string }[] = [
    { metric: "Bills settled", value: String(settled.length) },
    { metric: "Bills voided/reopened", value: String(voided.length) },
    { metric: "Net (taxable)", value: inr(net) },
    { metric: "Service charge", value: inr(svc) },
    { metric: "CGST", value: inr(cgst) },
    { metric: "SGST", value: inr(sgst) },
    { metric: "Discount", value: inr(disc) },
    { metric: "Round-off", value: inr(round) },
    { metric: "Gross total", value: inr(gross) },
    ...[...payMap.entries()].map(([m, v]) => ({ metric: `Paid · ${m.toUpperCase()}`, value: inr(v) })),
  ];
  return (
    <ReportSection title="Z-Report / day-close summary" range={range}
      columns={[
        { key: "metric", label: "Metric" },
        { key: "value", label: "Value", numeric: true },
      ]}
      rows={rows as unknown as Record<string, unknown>[]}
      summary={[
        { label: "Bills", value: String(settled.length) },
        { label: "Gross", value: inr(gross) },
        { label: "Net", value: inr(net) },
        { label: "GST", value: inr(cgst + sgst) },
      ]}
    />
  );
}
