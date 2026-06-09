// Additive procurement & cash reports. Self-contained; does not modify existing reports.
import { useEffect, useMemo, useState } from "react";
import { Loader2, Download, Printer } from "lucide-react";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  toCsv, downloadCsv, openPdfReport, fmtIST, istDayKey, safeFilename, inr,
  type DateRange,
} from "@/lib/reports";

// ---------- Local shared section (mirrors ReportsHub's, additive only) ----------
interface Col { key: string; label: string; numeric?: boolean; render?: (v: unknown, row: Record<string, unknown>) => string }
function Section({ title, range, columns, rows, summary }: {
  title: string; range: DateRange; columns: Col[]; rows: Record<string, unknown>[];
  summary?: { label: string; value: string }[];
}) {
  const csvRows = rows.map((r) => columns.map((c) => {
    const v = r[c.key];
    if (c.render) return c.render(v, r);
    return v == null ? "" : v as string | number;
  }));
  const handleCsv = () => downloadCsv(
    `${safeFilename(title)}_${format(range.from, "yyyyMMdd")}-${format(range.to, "yyyyMMdd")}.csv`,
    toCsv(columns.map((c) => c.label), csvRows),
  );
  const handlePdf = () => openPdfReport({
    title,
    subtitle: `${range.label}: ${fmtIST(range.from, "dd MMM")} → ${fmtIST(range.to, "dd MMM yyyy")}`,
    headers: columns.map((c) => c.label),
    rows: csvRows,
    summary,
  });
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

function Loader() {
  return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>;
}

// Enumerate IST day keys (YYYY-MM-DD) between range.from..range.to inclusive
function istDaysIn(range: DateRange): string[] {
  const days = new Set<string>();
  for (let t = range.from.getTime(); t <= range.to.getTime(); t += 86400000) {
    days.add(istDayKey(new Date(t)));
  }
  days.add(istDayKey(range.to));
  return [...days].sort();
}

// =============================================================================
// 1) Daily Purchase report (by vendor, by category)
// =============================================================================
interface PLine {
  id: string; business_date: string; vendor_id: string;
  description: string | null; qty: number; unit_price: number; amount: number;
  pay_mode: string; paid_amount: number; due_amount: number;
  category_id: string | null; vendor_product_id: string | null; note: string | null;
}
interface Vendor { id: string; name: string; is_active: boolean }
interface ExpCat { id: string; name: string }
interface VProduct { id: string; name: string; gst_applicable: boolean }

export function DailyPurchaseReport({ range }: { range: DateRange }) {
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<PLine[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [cats, setCats] = useState<ExpCat[]>([]);
  const [products, setProducts] = useState<VProduct[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const from = istDayKey(range.from);
      const to = istDayKey(range.to);
      const [linesR, vR, cR, pR] = await Promise.all([
        db.from("purchase_lines").select("*").gte("business_date", from).lte("business_date", to).order("business_date"),
        db.from("vendors").select("id,name,is_active"),
        db.from("expense_categories").select("id,name"),
        db.from("vendor_products").select("id,name,gst_applicable"),
      ]);
      if (!active) return;
      setLines((linesR.data ?? []) as PLine[]);
      setVendors((vR.data ?? []) as Vendor[]);
      setCats((cR.data ?? []) as ExpCat[]);
      setProducts((pR.data ?? []) as VProduct[]);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [range.from, range.to]);

  const vMap = useMemo(() => new Map(vendors.map((v) => [v.id, v.name])), [vendors]);
  const cMap = useMemo(() => new Map(cats.map((c) => [c.id, c.name])), [cats]);
  const pMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  if (loading) return <Loader />;

  // Detail rows
  const detail = lines.map((l) => {
    const prod = l.vendor_product_id ? pMap.get(l.vendor_product_id) : undefined;
    return {
      business_date: l.business_date,
      vendor: vMap.get(l.vendor_id) ?? "—",
      item: prod?.name ?? l.description ?? "—",
      category: l.category_id ? (cMap.get(l.category_id) ?? "—") : "—",
      qty: Number(l.qty), unit_price: Number(l.unit_price), amount: Number(l.amount),
      pay_mode: l.pay_mode, paid: Number(l.paid_amount), due: Number(l.due_amount),
      gst: prod?.gst_applicable ? "GST" : "",
      note: l.note ?? "",
    };
  });
  const tot = detail.reduce((a, r) => ({
    amount: a.amount + r.amount, paid: a.paid + r.paid, due: a.due + r.due,
    gst: a.gst + (r.gst ? r.amount : 0),
  }), { amount: 0, paid: 0, due: 0, gst: 0 });

  // By Vendor
  const byVendor = new Map<string, { vendor: string; lines: number; amount: number; paid: number; due: number }>();
  for (const r of detail) {
    const k = byVendor.get(r.vendor) ?? { vendor: r.vendor, lines: 0, amount: 0, paid: 0, due: 0 };
    k.lines += 1; k.amount += r.amount; k.paid += r.paid; k.due += r.due;
    byVendor.set(r.vendor, k);
  }
  const vendorRows = [...byVendor.values()].sort((a, b) => b.amount - a.amount);

  // By Category
  const byCat = new Map<string, { category: string; lines: number; amount: number; gst_amount: number }>();
  for (const r of detail) {
    const k = byCat.get(r.category) ?? { category: r.category, lines: 0, amount: 0, gst_amount: 0 };
    k.lines += 1; k.amount += r.amount; if (r.gst) k.gst_amount += r.amount;
    byCat.set(r.category, k);
  }
  const catRows = [...byCat.values()].sort((a, b) => b.amount - a.amount);

  return (
    <div className="space-y-4">
      <Section
        title="Daily purchases — by vendor"
        range={range}
        columns={[
          { key: "vendor", label: "Vendor" },
          { key: "lines", label: "Lines", numeric: true },
          { key: "amount", label: "Amount", numeric: true, render: (v) => inr(Number(v)) },
          { key: "paid", label: "Paid", numeric: true, render: (v) => inr(Number(v)) },
          { key: "due", label: "Due", numeric: true, render: (v) => inr(Number(v)) },
        ]}
        rows={vendorRows as unknown as Record<string, unknown>[]}
        summary={[
          { label: "Vendors", value: String(vendorRows.length) },
          { label: "Amount", value: inr(tot.amount) },
          { label: "Paid", value: inr(tot.paid) },
          { label: "Due", value: inr(tot.due) },
        ]}
      />
      <Section
        title="Daily purchases — by category"
        range={range}
        columns={[
          { key: "category", label: "Category" },
          { key: "lines", label: "Lines", numeric: true },
          { key: "amount", label: "Amount", numeric: true, render: (v) => inr(Number(v)) },
          { key: "gst_amount", label: "GST-eligible", numeric: true, render: (v) => inr(Number(v)) },
        ]}
        rows={catRows as unknown as Record<string, unknown>[]}
        summary={[
          { label: "Categories", value: String(catRows.length) },
          { label: "Total", value: inr(tot.amount) },
          { label: "GST-eligible", value: inr(tot.gst) },
        ]}
      />
      <Section
        title="Purchase lines (drill-down)"
        range={range}
        columns={[
          { key: "business_date", label: "Date" },
          { key: "vendor", label: "Vendor" },
          { key: "item", label: "Item / Desc" },
          { key: "category", label: "Category" },
          { key: "gst", label: "GST" },
          { key: "qty", label: "Qty", numeric: true, render: (v) => String(Number(v)) },
          { key: "unit_price", label: "Rate", numeric: true, render: (v) => inr(Number(v)) },
          { key: "amount", label: "Amount", numeric: true, render: (v) => inr(Number(v)) },
          { key: "pay_mode", label: "Mode" },
          { key: "paid", label: "Paid", numeric: true, render: (v) => inr(Number(v)) },
          { key: "due", label: "Due", numeric: true, render: (v) => inr(Number(v)) },
          { key: "note", label: "Note" },
        ]}
        rows={detail as unknown as Record<string, unknown>[]}
      />
    </div>
  );
}

// =============================================================================
// 2) Vendor Dues ledger with ageing
// =============================================================================
interface VPay { id: string; vendor_id: string; business_date: string; amount: number; mode: string; note: string | null }

export function VendorDuesReport({ range }: { range: DateRange }) {
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [allLines, setAllLines] = useState<PLine[]>([]);
  const [allPays, setAllPays] = useState<VPay[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const [vR, lR, pR] = await Promise.all([
        db.from("vendors").select("id,name,is_active"),
        // Lifetime needed for due balance; cheap unless very large
        db.from("purchase_lines").select("id,vendor_id,business_date,amount,paid_amount,due_amount").order("business_date"),
        db.from("vendor_payments").select("id,vendor_id,business_date,amount,mode,note").order("business_date"),
      ]);
      if (!active) return;
      setVendors((vR.data ?? []) as Vendor[]);
      setAllLines((lR.data ?? []) as PLine[]);
      setAllPays((pR.data ?? []) as VPay[]);
      setLoading(false);
    })();
  }, []);

  if (loading) return <Loader />;

  // Today (IST) for ageing
  const today = istDayKey(new Date());
  const todayMs = new Date(today + "T00:00:00+05:30").getTime();
  const bucket = (days: number) => days <= 7 ? "0-7" : days <= 15 ? "8-15" : days <= 30 ? "16-30" : "30+";

  // FIFO ageing: apply payments oldest-first
  type V = { id: string; name: string; total: number; paidIntra: number; payments: number; due: number; b0_7: number; b8_15: number; b16_30: number; b30p: number; oldest: string | null };
  const map = new Map<string, V>();
  for (const v of vendors) {
    map.set(v.id, { id: v.id, name: v.name, total: 0, paidIntra: 0, payments: 0, due: 0, b0_7: 0, b8_15: 0, b16_30: 0, b30p: 0, oldest: null });
  }

  // Build per-vendor open balances by line
  const linesByVendor = new Map<string, { date: string; remaining: number }[]>();
  for (const l of allLines) {
    const v = map.get(l.vendor_id);
    if (!v) continue;
    v.total += Number(l.amount); v.paidIntra += Number(l.paid_amount);
    const open = Number(l.due_amount);
    if (open > 0) {
      const arr = linesByVendor.get(l.vendor_id) ?? [];
      arr.push({ date: l.business_date, remaining: open });
      linesByVendor.set(l.vendor_id, arr);
    }
  }
  // Apply vendor_payments FIFO
  const paysByVendor = new Map<string, VPay[]>();
  for (const p of allPays) {
    const arr = paysByVendor.get(p.vendor_id) ?? [];
    arr.push(p); paysByVendor.set(p.vendor_id, arr);
    const v = map.get(p.vendor_id); if (v) v.payments += Number(p.amount);
  }
  for (const [vid, pays] of paysByVendor) {
    const queue = linesByVendor.get(vid) ?? [];
    let pool = pays.reduce((a, p) => a + Number(p.amount), 0);
    for (const ln of queue) {
      if (pool <= 0) break;
      const take = Math.min(pool, ln.remaining);
      ln.remaining -= take; pool -= take;
    }
  }
  // Compute ageing & oldest
  for (const [vid, queue] of linesByVendor) {
    const v = map.get(vid); if (!v) continue;
    for (const ln of queue) {
      if (ln.remaining <= 0) continue;
      const days = Math.max(0, Math.floor((todayMs - new Date(ln.date + "T00:00:00+05:30").getTime()) / 86400000));
      const b = bucket(days);
      if (b === "0-7") v.b0_7 += ln.remaining;
      else if (b === "8-15") v.b8_15 += ln.remaining;
      else if (b === "16-30") v.b16_30 += ln.remaining;
      else v.b30p += ln.remaining;
      v.due += ln.remaining;
      if (!v.oldest || ln.date < v.oldest) v.oldest = ln.date;
    }
  }

  const rows = [...map.values()].filter((v) => v.due > 0.005 || v.total > 0).sort((a, b) => b.due - a.due);
  const tot = rows.reduce((a, r) => ({
    total: a.total + r.total, payments: a.payments + r.payments, due: a.due + r.due,
    b0_7: a.b0_7 + r.b0_7, b8_15: a.b8_15 + r.b8_15, b16_30: a.b16_30 + r.b16_30, b30p: a.b30p + r.b30p,
  }), { total: 0, payments: 0, due: 0, b0_7: 0, b8_15: 0, b16_30: 0, b30p: 0 });

  // Payments within range
  const fromD = istDayKey(range.from), toD = istDayKey(range.to);
  const inRangePays = allPays.filter((p) => p.business_date >= fromD && p.business_date <= toD)
    .map((p) => ({
      business_date: p.business_date,
      vendor: vendors.find((v) => v.id === p.vendor_id)?.name ?? "—",
      amount: Number(p.amount), mode: p.mode, note: p.note ?? "",
    }));

  return (
    <div className="space-y-4">
      <Section
        title="Vendor dues — outstanding & ageing (lifetime)"
        range={range}
        columns={[
          { key: "name", label: "Vendor" },
          { key: "total", label: "Lifetime billed", numeric: true, render: (v) => inr(Number(v)) },
          { key: "payments", label: "Payments", numeric: true, render: (v) => inr(Number(v)) },
          { key: "due", label: "Due", numeric: true, render: (v) => inr(Number(v)) },
          { key: "b0_7", label: "0-7d", numeric: true, render: (v) => inr(Number(v)) },
          { key: "b8_15", label: "8-15d", numeric: true, render: (v) => inr(Number(v)) },
          { key: "b16_30", label: "16-30d", numeric: true, render: (v) => inr(Number(v)) },
          { key: "b30p", label: "30+d", numeric: true, render: (v) => inr(Number(v)) },
          { key: "oldest", label: "Oldest unpaid" },
        ]}
        rows={rows as unknown as Record<string, unknown>[]}
        summary={[
          { label: "Vendors with dues", value: String(rows.filter((r) => r.due > 0).length) },
          { label: "Total due", value: inr(tot.due) },
          { label: "Over 30d", value: inr(tot.b30p) },
          { label: "Lifetime billed", value: inr(tot.total) },
        ]}
      />
      <Section
        title="Vendor payments (in range)"
        range={range}
        columns={[
          { key: "business_date", label: "Date" },
          { key: "vendor", label: "Vendor" },
          { key: "amount", label: "Amount", numeric: true, render: (v) => inr(Number(v)) },
          { key: "mode", label: "Mode" },
          { key: "note", label: "Note" },
        ]}
        rows={inRangePays as unknown as Record<string, unknown>[]}
        summary={[
          { label: "Payments", value: String(inRangePays.length) },
          { label: "Total", value: inr(inRangePays.reduce((a, r) => a + r.amount, 0)) },
        ]}
      />
    </div>
  );
}

// =============================================================================
// 3) Cash Reconciliation / Z-report archive
// =============================================================================
interface Recon { id: string; business_date: string; section_key: string; status: string; finalised_at: string | null }
interface ReconVal { reconciliation_id: string; cashflow_line_id: string; manual_value: number }
interface DenomCount { reconciliation_id: string; denomination_id: string; count: number }
interface FlowLine { id: string; section_key: string | null; label: string; sign: string; source: string }
interface DenomCfg { id: string; value: number | null; label: string }

export function CashReconArchive({ range }: { range: DateRange }) {
  const [loading, setLoading] = useState(true);
  const [recons, setRecons] = useState<Recon[]>([]);
  const [vals, setVals] = useState<ReconVal[]>([]);
  const [counts, setCounts] = useState<DenomCount[]>([]);
  const [lines, setLines] = useState<FlowLine[]>([]);
  const [denoms, setDenoms] = useState<DenomCfg[]>([]);
  const [autoMap, setAutoMap] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const from = istDayKey(range.from), to = istDayKey(range.to);
      const reconsR = await db.from("cash_reconciliations").select("*")
        .gte("business_date", from).lte("business_date", to).order("business_date");
      const recList = (reconsR.data ?? []) as Recon[];
      const ids = recList.map((r) => r.id);
      const [valsR, cntR, flR, dnR] = await Promise.all([
        ids.length ? db.from("cash_recon_values").select("reconciliation_id,cashflow_line_id,manual_value").in("reconciliation_id", ids) : Promise.resolve({ data: [] }),
        ids.length ? db.from("denomination_counts").select("reconciliation_id,denomination_id,count").in("reconciliation_id", ids) : Promise.resolve({ data: [] }),
        db.from("cashflow_lines").select("id,section_key,label,sign,source"),
        db.from("denomination_config").select("id,value,label"),
      ]);
      if (!active) return;
      setRecons(recList);
      setVals((valsR.data ?? []) as ReconVal[]);
      setCounts((cntR.data ?? []) as DenomCount[]);
      setLines((flR.data ?? []) as FlowLine[]);
      setDenoms((dnR.data ?? []) as DenomCfg[]);

      // Pull auto sales per (date, section) via section_finance RPC
      const days = istDaysIn(range);
      const sections = Array.from(new Set(recList.map((r) => r.section_key)));
      const m = new Map<string, number>();
      await Promise.all(days.flatMap((d) => sections.map(async (sec) => {
        const { data } = await db.rpc("section_finance", { _business_date: d, _section_key: sec });
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) return;
        m.set(`${d}::${sec}::sales`, Number(row.sales_total));
        m.set(`${d}::${sec}::gpay`, Number(row.gpay_total));
        m.set(`${d}::${sec}::card`, Number(row.card_total));
        m.set(`${d}::${sec}::cash`, Number(row.cash_sales_total));
      })));
      setAutoMap(m);
      setLoading(false);
    })();
  }, [range.from, range.to]);

  if (loading) return <Loader />;

  const lineMap = new Map(lines.map((l) => [l.id, l]));
  const denomMap = new Map(denoms.map((d) => [d.id, d]));

  const rows = recons.map((r) => {
    let expected = 0;
    for (const v of vals.filter((x) => x.reconciliation_id === r.id)) {
      const ln = lineMap.get(v.cashflow_line_id);
      if (!ln) continue;
      let amt = Number(v.manual_value);
      if (ln.source === "auto_sales") amt = autoMap.get(`${r.business_date}::${r.section_key}::sales`) ?? 0;
      else if (ln.source === "auto_gpay") amt = autoMap.get(`${r.business_date}::${r.section_key}::gpay`) ?? 0;
      else if (ln.source === "auto_card") amt = autoMap.get(`${r.business_date}::${r.section_key}::card`) ?? 0;
      else if (ln.source === "auto_cash_expense") amt = Number(v.manual_value); // covered by purchase cash
      const signed = ln.sign === "subtract" ? -amt : amt;
      expected += signed;
    }
    let counted = 0;
    for (const c of counts.filter((x) => x.reconciliation_id === r.id)) {
      const dn = denomMap.get(c.denomination_id);
      const val = dn?.value ?? 1;
      counted += Number(val) * Number(c.count);
    }
    const diff = counted - expected;
    const tally = Math.abs(diff) < 1 ? "✅ Tallied" : diff > 0 ? "⬆ Excess" : "⬇ Short";
    return {
      business_date: r.business_date,
      section: r.section_key,
      status: r.status,
      expected, counted, diff, tally,
      finalised: r.finalised_at ? fmtIST(r.finalised_at) : "—",
    };
  });

  const tot = rows.reduce((a, r) => ({ expected: a.expected + r.expected, counted: a.counted + r.counted, diff: a.diff + r.diff }), { expected: 0, counted: 0, diff: 0 });

  return (
    <Section
      title="Cash reconciliation / Z-report archive"
      range={range}
      columns={[
        { key: "business_date", label: "Date" },
        { key: "section", label: "Section" },
        { key: "status", label: "Status" },
        { key: "expected", label: "Expected", numeric: true, render: (v) => inr(Number(v)) },
        { key: "counted", label: "Counted", numeric: true, render: (v) => inr(Number(v)) },
        { key: "diff", label: "Difference", numeric: true, render: (v) => inr(Number(v)) },
        { key: "tally", label: "Tally" },
        { key: "finalised", label: "Finalised at" },
      ]}
      rows={rows as unknown as Record<string, unknown>[]}
      summary={[
        { label: "Recons", value: String(rows.length) },
        { label: "Expected", value: inr(tot.expected) },
        { label: "Counted", value: inr(tot.counted) },
        { label: "Net diff", value: inr(tot.diff) },
      ]}
    />
  );
}

// =============================================================================
// 4) Owner's Drawings log
// =============================================================================
export function OwnersDrawingsReport({ range }: { range: DateRange }) {
  const [loading, setLoading] = useState(true);
  const [recons, setRecons] = useState<Recon[]>([]);
  const [vals, setVals] = useState<(ReconVal & { note: string | null })[]>([]);
  const [lines, setLines] = useState<FlowLine[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const from = istDayKey(range.from), to = istDayKey(range.to);
      const reconsR = await db.from("cash_reconciliations").select("*")
        .gte("business_date", from).lte("business_date", to);
      const recList = (reconsR.data ?? []) as Recon[];
      const ids = recList.map((r) => r.id);
      const [valsR, flR] = await Promise.all([
        ids.length ? db.from("cash_recon_values").select("reconciliation_id,cashflow_line_id,manual_value,note").in("reconciliation_id", ids) : Promise.resolve({ data: [] }),
        db.from("cashflow_lines").select("id,section_key,label,sign,source"),
      ]);
      if (!active) return;
      setRecons(recList);
      setVals((valsR.data ?? []) as (ReconVal & { note: string | null })[]);
      setLines((flR.data ?? []) as FlowLine[]);
      setLoading(false);
    })();
  }, [range.from, range.to]);

  if (loading) return <Loader />;

  const lineMap = new Map(lines.map((l) => [l.id, l]));
  const reconMap = new Map(recons.map((r) => [r.id, r]));

  const rows = vals
    .map((v) => ({ v, ln: lineMap.get(v.cashflow_line_id), r: reconMap.get(v.reconciliation_id) }))
    .filter(({ v, ln }) => ln && /drawing|owner/i.test(ln.label) && Number(v.manual_value) > 0)
    .map(({ v, ln, r }) => ({
      business_date: r?.business_date ?? "—",
      section: r?.section_key ?? "—",
      line: ln!.label,
      amount: Number(v.manual_value),
      note: v.note ?? "",
    }))
    .sort((a, b) => (a.business_date < b.business_date ? 1 : -1));

  const total = rows.reduce((a, r) => a + r.amount, 0);

  return (
    <Section
      title="Owner's drawings log"
      range={range}
      columns={[
        { key: "business_date", label: "Date" },
        { key: "section", label: "Section" },
        { key: "line", label: "Line" },
        { key: "amount", label: "Amount", numeric: true, render: (v) => inr(Number(v)) },
        { key: "note", label: "Note" },
      ]}
      rows={rows as unknown as Record<string, unknown>[]}
      summary={[
        { label: "Entries", value: String(rows.length) },
        { label: "Total drawn", value: inr(total) },
      ]}
    />
  );
}

// =============================================================================
// 5) Daily P&L (per section + consolidated)
// =============================================================================
export function DailyPnLReport({ range }: { range: DateRange }) {
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<string[]>([]);
  const [sales, setSales] = useState<Map<string, { sales: number; gpay: number; card: number; cash: number }>>(new Map());
  const [purchases, setPurchases] = useState<PLine[]>([]);
  const [cats, setCats] = useState<ExpCat[]>([]);
  const [commissions, setCommissions] = useState<{ business_date: string; amount: number }[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const from = istDayKey(range.from), to = istDayKey(range.to);
      const days = istDaysIn(range);

      const [secR, plR, ctR, reconsR, linesR] = await Promise.all([
        db.from("cash_sections").select("key,display_order,is_active").order("display_order"),
        db.from("purchase_lines").select("*").gte("business_date", from).lte("business_date", to),
        db.from("expense_categories").select("id,name"),
        db.from("cash_reconciliations").select("id,business_date,section_key").gte("business_date", from).lte("business_date", to),
        db.from("cashflow_lines").select("id,label,sign,source"),
      ]);
      const secs = ((secR.data ?? []) as { key: string; is_active: boolean }[])
        .filter((s) => s.is_active).map((s) => s.key);
      const recs = (reconsR.data ?? []) as { id: string; business_date: string; section_key: string }[];
      const fls = (linesR.data ?? []) as FlowLine[];
      const commissionLineIds = new Set(fls.filter((l) => /commission/i.test(l.label)).map((l) => l.id));

      const valR = recs.length
        ? await db.from("cash_recon_values").select("reconciliation_id,cashflow_line_id,manual_value").in("reconciliation_id", recs.map((r) => r.id))
        : { data: [] };
      const commByDay: { business_date: string; amount: number }[] = [];
      for (const v of (valR.data ?? []) as ReconVal[]) {
        if (!commissionLineIds.has(v.cashflow_line_id)) continue;
        const r = recs.find((x) => x.id === v.reconciliation_id);
        if (!r) continue;
        commByDay.push({ business_date: r.business_date, amount: Number(v.manual_value) });
      }

      // section_finance calls per (day, section)
      const m = new Map<string, { sales: number; gpay: number; card: number; cash: number }>();
      await Promise.all(days.flatMap((d) => secs.map(async (sec) => {
        const { data } = await db.rpc("section_finance", { _business_date: d, _section_key: sec });
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) return;
        m.set(`${d}::${sec}`, {
          sales: Number(row.sales_total),
          gpay: Number(row.gpay_total),
          card: Number(row.card_total),
          cash: Number(row.cash_sales_total),
        });
      })));

      if (!active) return;
      setSections(secs);
      setSales(m);
      setPurchases((plR.data ?? []) as PLine[]);
      setCats((ctR.data ?? []) as ExpCat[]);
      setCommissions(commByDay);
      setLoading(false);
    })();
  }, [range.from, range.to]);

  if (loading) return <Loader />;

  const days = istDaysIn(range);
  // P&L per (day, section); purchases & commissions are consolidated per day (no section linkage)
  const purByDay = new Map<string, number>();
  for (const p of purchases) {
    purByDay.set(p.business_date, (purByDay.get(p.business_date) ?? 0) + Number(p.amount));
  }
  const commByDay = new Map<string, number>();
  for (const c of commissions) commByDay.set(c.business_date, (commByDay.get(c.business_date) ?? 0) + c.amount);

  const sectionRows: Record<string, unknown>[] = [];
  for (const d of days) {
    let daySales = 0;
    for (const sec of sections) {
      const row = sales.get(`${d}::${sec}`);
      if (!row) continue;
      daySales += row.sales;
      sectionRows.push({
        day: d, section: sec, sales: row.sales,
        purchases: 0, commissions: 0,
        net: row.sales,
      });
    }
    // Consolidated day row (purchases & commissions live here)
    const pur = purByDay.get(d) ?? 0;
    const comm = commByDay.get(d) ?? 0;
    sectionRows.push({
      day: d, section: "ALL (consolidated)", sales: daySales,
      purchases: pur, commissions: comm,
      net: daySales - pur - comm,
    });
  }

  // Category breakdown of purchases for the range
  const catMap = new Map(cats.map((c) => [c.id, c.name]));
  const catTotals = new Map<string, number>();
  for (const p of purchases) {
    const name = p.category_id ? (catMap.get(p.category_id) ?? "Uncategorised") : "Uncategorised";
    catTotals.set(name, (catTotals.get(name) ?? 0) + Number(p.amount));
  }
  const catRows = [...catTotals.entries()].map(([name, amt]) => ({ category: name, amount: amt }))
    .sort((a, b) => b.amount - a.amount);

  const totalSales = [...sales.values()].reduce((a, r) => a + r.sales, 0);
  const totalPur = [...purByDay.values()].reduce((a, n) => a + n, 0);
  const totalComm = [...commByDay.values()].reduce((a, n) => a + n, 0);

  return (
    <div className="space-y-4">
      <Section
        title="Daily P&L (per section + consolidated)"
        range={range}
        columns={[
          { key: "day", label: "Day" },
          { key: "section", label: "Section" },
          { key: "sales", label: "Sales", numeric: true, render: (v) => inr(Number(v)) },
          { key: "purchases", label: "Purchases", numeric: true, render: (v) => inr(Number(v)) },
          { key: "commissions", label: "Commissions", numeric: true, render: (v) => inr(Number(v)) },
          { key: "net", label: "Net", numeric: true, render: (v) => inr(Number(v)) },
        ]}
        rows={sectionRows}
        summary={[
          { label: "Sales", value: inr(totalSales) },
          { label: "Purchases", value: inr(totalPur) },
          { label: "Commissions", value: inr(totalComm) },
          { label: "Net P&L", value: inr(totalSales - totalPur - totalComm) },
        ]}
      />
      <Section
        title="Expense categories (range)"
        range={range}
        columns={[
          { key: "category", label: "Category" },
          { key: "amount", label: "Amount", numeric: true, render: (v) => inr(Number(v)) },
        ]}
        rows={catRows as unknown as Record<string, unknown>[]}
        summary={[
          { label: "Categories", value: String(catRows.length) },
          { label: "Total expenses", value: inr(totalPur) },
        ]}
      />
    </div>
  );
}
