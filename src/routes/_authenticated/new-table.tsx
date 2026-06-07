import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { RoleGuard } from "@/components/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  compareCodes,
  STATUS_CLASSES,
  STATUS_LABEL,
  todayIsoDate,
  type DiningTable,
} from "@/lib/tables";

export const Route = createFileRoute("/_authenticated/new-table")({ component: Page });

function Page() {
  return (
    <RoleGuard allow={["admin", "manager", "waiter", "cashier"]}>
      <NewTable />
    </RoleGuard>
  );
}

interface OpenSession {
  id: string;
  table_code: string | null;
}

function NewTable() {
  const { profile, roles, hasRole } = useAuth();
  const nav = useNavigate();
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [openSessions, setOpenSessions] = useState<OpenSession[]>([]);
  const [waiters, setWaiters] = useState<{ id: string; name: string }[]>([]);
  const [allocs, setAllocs] = useState<{ waiter_id: string; table_code: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState<DiningTable | "takeaway" | null>(null);
  const [channel, setChannel] = useState<"dinein" | "takeaway">("dinein");
  const [pax, setPax] = useState("2");
  const [section, setSection] = useState("all");
  const [busy, setBusy] = useState(false);

  const today = todayIsoDate();

  const load = useCallback(async () => {
    const [tRes, sRes, wRes, aRes] = await Promise.all([
      db.from("tables").select("id,code,section,seats,status,display_order").order("display_order"),
      db.from("order_sessions").select("id,table_code").eq("status", "open"),
      db.from("waiters").select("id,name").eq("is_active", true),
      db.from("waiter_allocations").select("waiter_id,table_code").eq("date", today),
    ]);
    setTables((tRes.data ?? []) as DiningTable[]);
    setOpenSessions((sRes.data ?? []) as OpenSession[]);
    setWaiters((wRes.data ?? []) as { id: string; name: string }[]);
    setAllocs((aRes.data ?? []) as { waiter_id: string; table_code: string }[]);
    setLoading(false);
  }, [today]);

  useEffect(() => {
    load();
  }, [load]);

  const sections = useMemo(() => {
    const s = new Set<string>();
    tables.forEach((t) => t.section && s.add(t.section));
    return Array.from(s).sort();
  }, [tables]);

  const myWaiter = useMemo(
    () =>
      waiters.find(
        (w) => profile && w.name.trim().toLowerCase() === profile.name.trim().toLowerCase(),
      ),
    [waiters, profile],
  );
  const isWaiterOnly = roles.includes("waiter") && !hasRole("admin", "manager", "cashier");
  const myCodes = useMemo(
    () => new Set(allocs.filter((a) => myWaiter && a.waiter_id === myWaiter.id).map((a) => a.table_code)),
    [allocs, myWaiter],
  );

  const filtered = useMemo(() => {
    return tables
      .filter((t) => (section === "all" ? true : t.section === section))
      .filter((t) => (isWaiterOnly ? myCodes.has(t.code) : true))
      .sort((a, b) => compareCodes(a.code, b.code));
  }, [tables, section, isWaiterOnly, myCodes]);

  function openPicker(t: DiningTable | "takeaway") {
    if (t === "takeaway") {
      setPicker("takeaway");
      setChannel("takeaway");
      setPax("1");
    } else {
      // Resume open session if it exists
      const existing = openSessions.find((s) => s.table_code === t.code);
      if (existing) {
        nav({ to: "/order/$sessionId", params: { sessionId: existing.id } });
        return;
      }
      setPicker(t);
      setChannel("dinein");
      setPax("2");
    }
  }

  async function start() {
    if (!profile) return;
    setBusy(true);
    const isTakeaway = picker === "takeaway";
    const { data, error } = await db
      .from("order_sessions")
      .insert({
        restaurant_id: profile.restaurant_id,
        table_code: isTakeaway ? null : (picker as DiningTable).code,
        channel,
        pax: Math.max(1, parseInt(pax, 10) || 1),
      })
      .select("id")
      .single();
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!isTakeaway) {
      const t = picker as DiningTable;
      await db.from("tables").update({ status: "seated_no_kot" }).eq("id", t.id);
    }
    setPicker(null);
    nav({ to: "/order/$sessionId", params: { sessionId: (data as { id: string }).id } });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <header className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold">Start new order</h1>
          <p className="text-sm text-muted-foreground">Pick a free table or takeaway.</p>
        </div>
        <Button variant="outline" onClick={() => openPicker("takeaway")}>
          <ShoppingBag className="h-4 w-4" /> New takeaway
        </Button>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="min-w-[140px]">
          <Select value={section} onValueChange={setSection}>
            <SelectTrigger className="min-h-[44px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sections</SelectItem>
              {sections.map((s) => (
                <SelectItem key={s} value={s}>
                  Section {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {filtered.map((t) => {
          const occupied = t.status === "occupied" || t.status === "bill_requested";
          const inactive = t.status === "inactive";
          const blocked = occupied || inactive;
          return (
            <button
              key={t.id}
              onClick={() => !blocked && openPicker(t)}
              disabled={blocked}
              className={`rounded-2xl p-4 min-h-[110px] flex flex-col justify-between shadow-sm border text-left ${STATUS_CLASSES[t.status]} ${
                blocked ? "opacity-90 cursor-not-allowed" : "active:scale-95 transition"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="text-2xl font-extrabold tracking-tight">{t.code}</div>
                <div className="text-[11px] font-semibold uppercase opacity-90">
                  {STATUS_LABEL[t.status]}
                </div>
              </div>
              <div className="flex items-center justify-between text-xs opacity-90">
                <span>{t.section ? `Sec ${t.section}` : "—"}</span>
                <span>{t.seats} seats</span>
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full text-center text-sm text-muted-foreground py-6">
            No tables to show.
          </div>
        )}
      </div>

      <Dialog open={!!picker} onOpenChange={(v) => !v && setPicker(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {picker === "takeaway"
                ? "New takeaway order"
                : `Start Table ${picker && picker !== "takeaway" ? picker.code : ""}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {picker !== "takeaway" && (
              <div>
                <Label className="text-xs">Channel</Label>
                <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dinein">Dine-in</SelectItem>
                    <SelectItem value="takeaway">Takeaway</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs">Pax</Label>
              <Input
                type="number"
                min={1}
                value={pax}
                onChange={(e) => setPax(e.target.value)}
                className="text-2xl font-bold h-14 text-center"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPicker(null)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={start}>
              {busy ? "Opening…" : "Open order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
