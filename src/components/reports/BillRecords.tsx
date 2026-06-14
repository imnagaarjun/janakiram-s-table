import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { db } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { inr } from "@/lib/gst";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ViewBillDialog } from "@/components/tables/ViewBillDialog";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Current business date as YYYY-MM-DD (IST). */
function currentBusinessDate(): string {
  const istNow = new Date(Date.now() + IST_OFFSET_MS);
  return istNow.toISOString().slice(0, 10);
}

interface Row {
  id: string;
  invoice_no: string;
  issued_at: string;
  total: number;
  status: string;
  bill_out: boolean;
  session_id: string;
}

/**
 * Day-at-a-time bill records browser. Lists bills for the selected day ordered
 * by time + bill number; click a row to open its full detail (reuses the
 * View bill dialog). Won't browse earlier than the admin's retention cutoff.
 */
export function BillRecords() {
  const { profile } = useAuth();
  const [date, setDate] = useState<string>(currentBusinessDate());
  const [minDate, setMinDate] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [tableMap, setTableMap] = useState<Map<string, string | null>>(new Map());
  const [loading, setLoading] = useState(true);
  const [openNo, setOpenNo] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.restaurant_id) return;
    db.from("restaurants").select("bill_retention_until").eq("id", profile.restaurant_id).maybeSingle()
      .then(({ data }: { data: { bill_retention_until: string | null } | null }) => setMinDate(data?.bill_retention_until ?? null));
  }, [profile?.restaurant_id]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await db
      .from("invoices")
      .select("id,invoice_no,issued_at,total,status,bill_out,session_id")
      .eq("business_date", date)
      .order("issued_at", { ascending: true });
    const list = (data ?? []) as Row[];
    list.sort((a, b) => (a.issued_at === b.issued_at ? a.invoice_no.localeCompare(b.invoice_no) : a.issued_at < b.issued_at ? -1 : 1));
    setRows(list);

    const sessionIds = Array.from(new Set(list.map((r) => r.session_id)));
    if (sessionIds.length) {
      const { data: sess } = await db.from("order_sessions").select("id,table_code").in("id", sessionIds);
      setTableMap(new Map(((sess ?? []) as { id: string; table_code: string | null }[]).map((s) => [s.id, s.table_code])));
    } else {
      setTableMap(new Map());
    }
    setLoading(false);
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const settledTotal = rows.filter((r) => r.status === "settled").reduce((a, r) => a + Number(r.total), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs mb-1 block">Day</Label>
          <Input type="date" value={date} min={minDate ?? undefined} max={currentBusinessDate()} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>
        <div className="text-sm text-muted-foreground pb-2">
          {rows.length} bills · Settled {inr(settledTotal)}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">No bills on this day.</div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface overflow-hidden divide-y divide-border">
          {rows.map((r) => (
            <button
              key={r.id}
              onClick={() => setOpenNo(r.invoice_no)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-accent min-h-[52px]"
            >
              <div className="min-w-0">
                <div className="font-semibold text-sm flex items-center gap-2">
                  {r.invoice_no}
                  {r.status !== "settled" && <span className="text-xs text-danger capitalize">({r.status})</span>}
                  {r.bill_out && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">bill out</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(r.issued_at).toLocaleTimeString()} · {tableMap.get(r.session_id) ? `Table ${tableMap.get(r.session_id)}` : "Takeaway"}
                </div>
              </div>
              <div className="font-semibold tabular-nums">{inr(Number(r.total))}</div>
            </button>
          ))}
        </div>
      )}

      <ViewBillDialog
        open={openNo !== null}
        onOpenChange={(v) => { if (!v) { setOpenNo(null); load(); } }}
        restaurantId={profile?.restaurant_id ?? null}
        initialInvoiceNo={openNo ?? undefined}
      />
    </div>
  );
}
