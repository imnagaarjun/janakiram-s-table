import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Settings2, Plus, Trash2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  STATUS_CLASSES,
  STATUS_LABEL,
  type DiningTable,
  type TableStatus,
} from "@/lib/tables";

interface Waiter {
  id: string;
  name: string;
}
interface TableGroup {
  id: string;
  code: string;
  split_count: number;
  seats: number;
  waiter_id: string | null;
  display_order: number;
}

const SPLIT_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

function childCodesFor(g: TableGroup): string[] {
  if (g.split_count <= 1) return [g.code];
  return Array.from({ length: g.split_count }, (_, i) => g.code + SPLIT_LETTERS[i]);
}

function groupCodeNumeric(code: string): number {
  const m = /^(\d+)/.exec(code);
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
}

export function TablesGrid() {
  const nav = useNavigate();
  const { profile, roles, hasRole } = useAuth();
  const restaurantId = profile?.restaurant_id;
  const isWaiterOnly = roles.includes("waiter") && !hasRole("admin", "manager", "cashier");

  const [tables, setTables] = useState<DiningTable[]>([]);
  const [groups, setGroups] = useState<TableGroup[]>([]);
  const [waiters, setWaiters] = useState<Waiter[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<"all" | "running" | "free">("all");
  const [waiterFilter, setWaiterFilter] = useState<string>("all");
  const [manageOpen, setManageOpen] = useState(false);

  // Start-order dialog state
  const [picker, setPicker] = useState<{ kind: "table"; code: string } | { kind: "takeaway" } | null>(null);
  const [channel, setChannel] = useState<"dinein" | "takeaway">("dinein");
  const [pax, setPax] = useState("2");
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    const [tRes, gRes, wRes] = await Promise.all([
      db.from("tables").select("id,code,section,seats,status,display_order"),
      db.from("table_groups").select("id,code,split_count,seats,waiter_id,display_order"),
      db.from("waiters").select("id,name").eq("is_active", true).order("name"),
    ]);
    setTables((tRes.data ?? []) as DiningTable[]);
    setGroups((gRes.data ?? []) as TableGroup[]);
    setWaiters((wRes.data ?? []) as Waiter[]);
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    load();
  }, [load]);

  const tableByCode = useMemo(() => {
    const m = new Map<string, DiningTable>();
    tables.forEach((t) => m.set(t.code, t));
    return m;
  }, [tables]);

  const myWaiterId = useMemo(() => {
    if (!isWaiterOnly || !profile) return null;
    const w = waiters.find(
      (x) => x.name.trim().toLowerCase() === profile.name.trim().toLowerCase(),
    );
    return w?.id ?? null;
  }, [isWaiterOnly, profile, waiters]);

  const sortedGroups = useMemo(
    () =>
      [...groups].sort(
        (a, b) => groupCodeNumeric(a.code) - groupCodeNumeric(b.code) || a.code.localeCompare(b.code),
      ),
    [groups],
  );

  const filteredGroups = useMemo(() => {
    return sortedGroups.filter((g) => {
      if (isWaiterOnly && g.waiter_id !== myWaiterId) return false;
      if (waiterFilter !== "all" && g.waiter_id !== waiterFilter) return false;
      if (statusFilter !== "all") {
        const codes = childCodesFor(g);
        const hasRunning = codes.some((c) => {
          const t = tableByCode.get(c);
          return t && t.status !== "free" && t.status !== "inactive";
        });
        if (statusFilter === "running" && !hasRunning) return false;
        if (statusFilter === "free" && hasRunning) return false;
      }
      return true;
    });
  }, [sortedGroups, statusFilter, waiterFilter, tableByCode, isWaiterOnly, myWaiterId]);

  const openTile = useCallback(
    async (code: string, status: TableStatus) => {
      if (status === "inactive") return;
      // Existing open/bill_requested session → resume
      const { data } = await db
        .from("order_sessions")
        .select("id,status")
        .eq("table_code", code)
        .in("status", ["open", "bill_requested"])
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        if (data.status === "bill_requested") {
          nav({ to: "/bill/$sessionId", params: { sessionId: data.id } });
        } else {
          nav({ to: "/order/$sessionId", params: { sessionId: data.id } });
        }
        return;
      }
      // Free tile → open start-order dialog
      if (status === "free" || status === "seated_no_kot") {
        setChannel("dinein");
        setPax("2");
        setPicker({ kind: "table", code });
      }
    },
    [nav],
  );

  const openTakeaway = useCallback(() => {
    setChannel("takeaway");
    setPax("1");
    setPicker({ kind: "takeaway" });
  }, []);

  const startOrder = useCallback(async () => {
    if (!profile || !picker) return;
    setStarting(true);
    const isTakeaway = picker.kind === "takeaway";
    const tableCode = isTakeaway ? null : picker.code;
    const { data, error } = await db
      .from("order_sessions")
      .insert({
        restaurant_id: profile.restaurant_id,
        table_code: tableCode,
        channel: isTakeaway ? "takeaway" : channel,
        pax: Math.max(1, parseInt(pax, 10) || 1),
      })
      .select("id")
      .single();
    setStarting(false);
    if (error || !data) {
      toast.error(error?.message ?? "Failed to open order");
      return;
    }
    if (!isTakeaway && tableCode) {
      const t = tableByCode.get(tableCode);
      if (t) {
        await db.from("tables").update({ status: "seated_no_kot" }).eq("id", t.id);
      }
    }
    setPicker(null);
    nav({ to: "/order/$sessionId", params: { sessionId: (data as { id: string }).id } });
  }, [profile, picker, channel, pax, tableByCode, nav]);


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
          <h1 className="text-2xl font-bold">Tables</h1>
          <p className="text-sm text-muted-foreground">
            {filteredGroups.length} of {groups.length} tables
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="min-h-[44px]" onClick={openTakeaway}>
            <ShoppingBag className="h-4 w-4" /> Takeaway
          </Button>
          {hasRole("admin", "manager") && (
            <Sheet open={manageOpen} onOpenChange={setManageOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="min-h-[44px]">
                  <Settings2 className="h-4 w-4" /> Manage
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Manage tables</SheetTitle>
                </SheetHeader>
                <ManageGroups
                  groups={sortedGroups}
                  waiters={waiters}
                  restaurantId={restaurantId!}
                  onChanged={load}
                  canDelete={hasRole("admin")}
                />
              </SheetContent>
            </Sheet>
          )}
        </div>
      </header>


      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="inline-flex rounded-lg border border-border bg-surface p-1">
          {(["all", "running", "free"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setStatusFilter(k)}
              className={`px-3 py-2 rounded-md text-sm font-medium min-h-[36px] capitalize ${
                statusFilter === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
        <div className="min-w-[180px]">
          <Select value={waiterFilter} onValueChange={setWaiterFilter}>
            <SelectTrigger className="min-h-[44px]">
              <SelectValue placeholder="Waiter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All waiters</SelectItem>
              {waiters.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4 text-xs text-muted-foreground">
        {(Object.keys(STATUS_LABEL) as TableStatus[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded-full ${STATUS_CLASSES[s].split(" ")[0]}`} />
            {STATUS_LABEL[s]}
          </span>
        ))}
      </div>

      {filteredGroups.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
          No tables to show.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filteredGroups.map((g) => {
            const codes = childCodesFor(g);
            const waiterName = waiters.find((w) => w.id === g.waiter_id)?.name;
            return (
              <div
                key={g.id}
                className="rounded-2xl border border-border bg-surface p-2 shadow-sm flex flex-col gap-2"
              >
                <div className="flex items-center justify-between px-1">
                  <div className="text-lg font-extrabold tracking-tight">T {g.code}</div>
                  <div className="text-[10px] text-muted-foreground truncate max-w-[80px]">
                    {waiterName ?? "—"}
                  </div>
                </div>
                <div
                  className={`grid gap-1.5 ${
                    codes.length === 1
                      ? "grid-cols-1"
                      : codes.length === 2
                        ? "grid-cols-2"
                        : codes.length <= 4
                          ? "grid-cols-2"
                          : "grid-cols-3"
                  }`}
                >
                  {codes.map((code) => {
                    const t = tableByCode.get(code);
                    const status: TableStatus = t?.status ?? "free";
                    const splitLabel =
                      codes.length === 1 ? `${g.seats} seats` : code.slice(g.code.length) || code;
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => openTile(code, status)}
                        className={`rounded-xl px-2 py-3 min-h-[64px] text-left border ${STATUS_CLASSES[status]} ${
                          status === "free" || status === "inactive"
                            ? ""
                            : "active:scale-[0.98] transition-transform"
                        }`}
                      >
                        <div className="text-base font-bold leading-tight">{splitLabel}</div>
                        <div className="text-[10px] font-semibold uppercase opacity-90 mt-0.5">
                          {STATUS_LABEL[status]}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ManageGroups({
  groups,
  waiters,
  restaurantId,
  onChanged,
  canDelete,
}: {
  groups: TableGroup[];
  waiters: Waiter[];
  restaurantId: string;
  onChanged: () => void | Promise<void>;
  canDelete: boolean;
}) {
  const [code, setCode] = useState("");
  const [splits, setSplits] = useState("1");
  const [seats, setSeats] = useState("4");
  const [waiterId, setWaiterId] = useState<string>("none");
  const [busy, setBusy] = useState(false);

  async function sync(groupId: string) {
    const { error } = await db.rpc("sync_table_group", { _group_id: groupId });
    if (error) toast.error(error.message);
  }

  async function add() {
    if (!code.trim()) return toast.error("Table number required");
    setBusy(true);
    const order = groups.length;
    const { data, error } = await db
      .from("table_groups")
      .insert({
        restaurant_id: restaurantId,
        code: code.trim(),
        split_count: Math.max(1, Math.min(8, parseInt(splits, 10) || 1)),
        seats: Math.max(1, parseInt(seats, 10) || 4),
        waiter_id: waiterId === "none" ? null : waiterId,
        display_order: order,
      })
      .select("id")
      .single();
    if (error || !data) {
      setBusy(false);
      return toast.error(error?.message ?? "Failed");
    }
    await sync(data.id);
    setBusy(false);
    setCode("");
    setSplits("1");
    setSeats("4");
    setWaiterId("none");
    toast.success("Table added");
    onChanged();
  }

  async function update(g: TableGroup, patch: Partial<TableGroup>) {
    const { error } = await db.from("table_groups").update(patch).eq("id", g.id);
    if (error) return toast.error(error.message);
    await sync(g.id);
    onChanged();
  }

  async function remove(g: TableGroup) {
    if (!confirm(`Delete table ${g.code} and all its splits?`)) return;
    // Delete child tables that are free/inactive first
    await db
      .from("tables")
      .delete()
      .eq("restaurant_id", restaurantId)
      .in("code", childCodesFor(g))
      .in("status", ["free", "inactive"]);
    const { error } = await db.from("table_groups").delete().eq("id", g.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    onChanged();
  }

  return (
    <div className="mt-4 space-y-5">
      <div className="rounded-xl border border-border p-3 space-y-2">
        <div className="text-sm font-semibold">Add table</div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs">Number</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="11" />
          </div>
          <div>
            <Label className="text-xs">Splits</Label>
            <Select value={splits} onValueChange={setSplits}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Seats</Label>
            <Input type="number" min={1} value={seats} onChange={(e) => setSeats(e.target.value)} />
          </div>
        </div>
        <div>
          <Label className="text-xs">Waiter</Label>
          <Select value={waiterId} onValueChange={setWaiterId}>
            <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {waiters.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={add} disabled={busy} className="w-full mt-1">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-semibold">Existing ({groups.length})</div>
        {groups.map((g) => (
          <div key={g.id} className="rounded-lg border border-border p-2 grid grid-cols-12 gap-2 items-end">
            <div className="col-span-2">
              <Label className="text-[10px]">No.</Label>
              <Input
                className="h-9"
                defaultValue={g.code}
                onBlur={(e) => e.target.value !== g.code && e.target.value.trim() && update(g, { code: e.target.value.trim() })}
              />
            </div>
            <div className="col-span-2">
              <Label className="text-[10px]">Splits</Label>
              <Select value={String(g.split_count)} onValueChange={(v) => update(g, { split_count: parseInt(v, 10) })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-[10px]">Seats</Label>
              <Input
                className="h-9"
                type="number"
                min={1}
                defaultValue={g.seats}
                onBlur={(e) => {
                  const n = Math.max(1, parseInt(e.target.value, 10) || 1);
                  if (n !== g.seats) update(g, { seats: n });
                }}
              />
            </div>
            <div className="col-span-5">
              <Label className="text-[10px]">Waiter</Label>
              <Select
                value={g.waiter_id ?? "none"}
                onValueChange={(v) => update(g, { waiter_id: v === "none" ? null : v })}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {waiters.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-1 flex justify-end">
              {canDelete && (
                <Button variant="ghost" size="icon" onClick={() => remove(g)}>
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
