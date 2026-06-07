import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Settings2, Plus, Trash2 } from "lucide-react";
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
  compareCodes,
  STATUS_CLASSES,
  STATUS_LABEL,
  todayIsoDate,
  type DiningTable,
  type TableStatus,
} from "@/lib/tables";

interface Allocation {
  id: string;
  waiter_id: string;
  table_code: string;
}
interface Waiter {
  id: string;
  name: string;
}

export function TablesGrid() {
  const { profile, hasRole, roles } = useAuth();
  const restaurantId = profile?.restaurant_id;
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [waiters, setWaiters] = useState<Waiter[]>([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<string>("all");
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [manageOpen, setManageOpen] = useState(false);

  const today = todayIsoDate();

  const load = useCallback(async () => {
    if (!restaurantId) return;
    const [tRes, aRes, wRes] = await Promise.all([
      db.from("tables").select("id,code,section,seats,status,display_order").order("display_order"),
      db.from("waiter_allocations").select("id,waiter_id,table_code").eq("date", today),
      db.from("waiters").select("id,name").eq("is_active", true),
    ]);
    setTables((tRes.data ?? []) as DiningTable[]);
    setAllocations((aRes.data ?? []) as Allocation[]);
    setWaiters((wRes.data ?? []) as Waiter[]);
    setLoading(false);
  }, [restaurantId, today]);

  useEffect(() => {
    load();
  }, [load]);

  const sections = useMemo(() => {
    const s = new Set<string>();
    tables.forEach((t) => t.section && s.add(t.section));
    return Array.from(s).sort();
  }, [tables]);

  // Match logged-in waiter by profile name (MVP link).
  const myWaiter = useMemo(
    () => waiters.find((w) => profile && w.name.trim().toLowerCase() === profile.name.trim().toLowerCase()),
    [waiters, profile],
  );

  const isWaiterOnly =
    roles.includes("waiter") && !hasRole("admin", "manager", "cashier");

  useEffect(() => {
    if (isWaiterOnly) setScope("mine");
  }, [isWaiterOnly]);

  const myCodes = useMemo(() => {
    if (!myWaiter) return new Set<string>();
    return new Set(allocations.filter((a) => a.waiter_id === myWaiter.id).map((a) => a.table_code));
  }, [allocations, myWaiter]);

  const filtered = useMemo(() => {
    return tables
      .filter((t) => (section === "all" ? true : t.section === section))
      .filter((t) => (scope === "mine" ? myCodes.has(t.code) : true))
      .sort((a, b) => compareCodes(a.code, b.code));
  }, [tables, section, scope, myCodes]);

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
            {filtered.length} of {tables.length} shown
          </p>
        </div>
        {hasRole("admin", "manager") && (
          <Sheet open={manageOpen} onOpenChange={setManageOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="min-h-[44px]">
                <Settings2 className="h-4 w-4" /> Manage
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Manage tables</SheetTitle>
              </SheetHeader>
              <ManageTables
                tables={tables}
                onChanged={load}
                restaurantId={restaurantId!}
                canDelete={hasRole("admin")}
              />
            </SheetContent>
          </Sheet>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="min-w-[140px]">
          <Select value={section} onValueChange={setSection}>
            <SelectTrigger className="min-h-[44px]">
              <SelectValue placeholder="Section" />
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
        {(hasRole("admin", "manager", "cashier") || myWaiter) && (
          <div className="inline-flex rounded-lg border border-border bg-surface p-1">
            <button
              onClick={() => setScope("all")}
              className={`px-3 py-2 rounded-md text-sm font-medium min-h-[36px] ${
                scope === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setScope("mine")}
              disabled={!myWaiter}
              className={`px-3 py-2 rounded-md text-sm font-medium min-h-[36px] ${
                scope === "mine" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              } disabled:opacity-40`}
            >
              My tables
            </button>
          </div>
        )}
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

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
          No tables to show.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filtered.map((t) => (
            <div
              key={t.id}
              className={`rounded-2xl p-4 min-h-[110px] flex flex-col justify-between shadow-sm border ${STATUS_CLASSES[t.status]}`}
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ManageTables({
  tables,
  onChanged,
  restaurantId,
  canDelete,
}: {
  tables: DiningTable[];
  onChanged: () => void | Promise<void>;
  restaurantId: string;
  canDelete: boolean;
}) {
  const [code, setCode] = useState("");
  const [section, setSection] = useState("");
  const [seats, setSeats] = useState("4");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!code.trim()) return toast.error("Code required");
    setBusy(true);
    const order = tables.length;
    const { error } = await db.from("tables").insert({
      restaurant_id: restaurantId,
      code: code.trim(),
      section: section.trim() || null,
      seats: Math.max(1, parseInt(seats, 10) || 4),
      display_order: order,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setCode("");
    setSection("");
    setSeats("4");
    toast.success("Table added");
    onChanged();
  }

  async function update(t: DiningTable, patch: Partial<DiningTable>) {
    const { error } = await db.from("tables").update(patch).eq("id", t.id);
    if (error) return toast.error(error.message);
    onChanged();
  }

  async function remove(t: DiningTable) {
    if (!confirm(`Delete ${t.code}?`)) return;
    const { error } = await db.from("tables").delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    onChanged();
  }

  return (
    <div className="mt-4 space-y-5">
      <div className="rounded-xl border border-border p-3 space-y-2">
        <div className="text-sm font-semibold">Add table</div>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-1">
            <Label className="text-xs">Code</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="21A" />
          </div>
          <div className="col-span-1">
            <Label className="text-xs">Section</Label>
            <Input value={section} onChange={(e) => setSection(e.target.value)} placeholder="A" />
          </div>
          <div className="col-span-1">
            <Label className="text-xs">Seats</Label>
            <Input type="number" min={1} value={seats} onChange={(e) => setSeats(e.target.value)} />
          </div>
        </div>
        <Button onClick={add} disabled={busy} className="w-full mt-1">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-semibold">Existing ({tables.length})</div>
        {[...tables].sort((a, b) => compareCodes(a.code, b.code)).map((t) => (
          <div key={t.id} className="rounded-lg border border-border p-2 grid grid-cols-12 gap-2 items-center">
            <Input
              className="col-span-3 h-9"
              defaultValue={t.code}
              onBlur={(e) => e.target.value !== t.code && update(t, { code: e.target.value })}
            />
            <Input
              className="col-span-3 h-9"
              defaultValue={t.section ?? ""}
              placeholder="Sec"
              onBlur={(e) => (e.target.value || null) !== t.section && update(t, { section: e.target.value || null })}
            />
            <Input
              className="col-span-2 h-9"
              type="number"
              min={1}
              defaultValue={t.seats}
              onBlur={(e) =>
                parseInt(e.target.value, 10) !== t.seats &&
                update(t, { seats: Math.max(1, parseInt(e.target.value, 10) || 1) })
              }
            />
            <Select
              value={t.status}
              onValueChange={(v) => update(t, { status: v as TableStatus })}
            >
              <SelectTrigger className="col-span-3 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_LABEL) as TableStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="col-span-1 flex justify-end">
              {canDelete && (
                <Button variant="ghost" size="icon" onClick={() => remove(t)}>
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
