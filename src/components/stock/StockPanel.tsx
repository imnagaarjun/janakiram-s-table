import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Minus, Save, CalendarDays, ChefHat, Boxes } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { businessDayStart, formatBusinessDay } from "@/lib/business-day";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface BaseItem {
  id: string;
  name: string;
  pool_id: string | null; // linked stock_pool id (auto-created when is_base is set)
}
interface LedgerRow {
  id: string;
  pool_id: string;
  qty_delta: number;
  reason: string;
  note: string | null;
  created_at: string;
}
interface DependentItem {
  id: string;
  name: string;
}

/** Returns today's IST date as YYYY-MM-DD */
function istToday(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split("T")[0];
}

export function StockPanel() {
  const [loading, setLoading] = useState(true);
  const [baseItems, setBaseItems] = useState<BaseItem[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  // dependents: base item id → list of menu items that share its pool
  const [dependents, setDependents] = useState<Record<string, DependentItem[]>>({});
  const [openingDrafts, setOpeningDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState<{ item: BaseItem; mode: "restock" | "wastage" } | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);

  const dayStart = useMemo(() => businessDayStart(), []);
  const dayStartIso = dayStart.toISOString();

  const load = useCallback(async () => {
    // Load base items + ledger in parallel
    const [itemsRes, ledgerRes] = await Promise.all([
      db.from("menu_items")
        .select("id,name,is_base")
        .eq("is_base", true)
        .eq("is_active", true)
        .order("name"),
      db.from("stock_ledger")
        .select("id,pool_id,qty_delta,reason,note,created_at")
        .order("created_at", { ascending: false }),
    ]);

    // For each base item, find its pool via recipes (ratio=1)
    const baseRaw = itemsRes.data ?? [];
    let builtBaseItems: BaseItem[] = [];
    const poolIdToBaseItemId = new Map<string, string>(); // pool_id → base item id

    if (baseRaw.length > 0) {
      const ids = baseRaw.map((i: { id: string }) => i.id);
      const { data: recipeLinks } = await db
        .from("recipes")
        .select("menu_item_id,stock_pool_id,consume_ratio")
        .in("menu_item_id", ids);

      const poolMap = new Map<string, string>(); // base item_id → pool_id
      for (const r of recipeLinks ?? []) {
        if (Math.abs(Number(r.consume_ratio) - 1) < 0.001) {
          poolMap.set(r.menu_item_id, r.stock_pool_id);
        }
      }
      builtBaseItems = baseRaw.map((i: { id: string; name: string }) => ({
        id: i.id,
        name: i.name,
        pool_id: poolMap.get(i.id) ?? null,
      }));
      for (const item of builtBaseItems) {
        if (item.pool_id) poolIdToBaseItemId.set(item.pool_id, item.id);
      }
    }
    setBaseItems(builtBaseItems);
    setLedger(ledgerRes.data ?? []);

    // Build dependents map via recipes: find non-base items that share a pool with a base item
    const depsMap: Record<string, DependentItem[]> = {};
    if (poolIdToBaseItemId.size > 0) {
      const allPoolIds = Array.from(poolIdToBaseItemId.keys());
      const { data: depRecipes } = await db
        .from("recipes")
        .select("menu_item_id,stock_pool_id")
        .in("stock_pool_id", allPoolIds);

      // Get menu item names for non-base items found in these recipes
      const depItemIds = [...new Set(
        (depRecipes ?? [])
          .map((r: { menu_item_id: string }) => r.menu_item_id)
          .filter((id: string) => !builtBaseItems.some((b) => b.id === id)),
      )];

      if (depItemIds.length > 0) {
        const { data: depItems } = await db
          .from("menu_items")
          .select("id,name")
          .in("id", depItemIds)
          .eq("is_active", true);
        const itemNameMap = new Map((depItems ?? []).map((i: { id: string; name: string }) => [i.id, i.name]));

        for (const r of depRecipes ?? []) {
          const baseId = poolIdToBaseItemId.get(r.stock_pool_id);
          if (!baseId) continue;
          if (builtBaseItems.some((b) => b.id === r.menu_item_id)) continue; // skip base items
          const name = itemNameMap.get(r.menu_item_id);
          if (!name) continue;
          if (!depsMap[baseId]) depsMap[baseId] = [];
          if (!depsMap[baseId].some((d) => d.id === r.menu_item_id)) {
            depsMap[baseId].push({ id: r.menu_item_id as string, name: name as string });
          }
        }
      }
    }
    setDependents(depsMap);

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const poolQty = useCallback(
    (poolId: string | null) => {
      if (!poolId) return 0;
      return ledger
        .filter((l) => l.pool_id === poolId)
        .reduce((s, l) => s + Number(l.qty_delta), 0);
    },
    [ledger],
  );

  const openingTodaySet = useCallback(
    (poolId: string | null) => {
      if (!poolId) return false;
      return ledger.some(
        (l) => l.pool_id === poolId && l.reason === "opening" && l.created_at >= dayStartIso,
      );
    },
    [ledger, dayStartIso],
  );

  const pendingItems = baseItems.filter((i) => !openingTodaySet(i.pool_id));

  async function saveOpenings() {
    const entries = Object.entries(openingDrafts)
      .map(([item_id, v]) => ({ item_id, qty: Number(v) }))
      .filter((e) => Number.isFinite(e.qty) && e.qty > 0);
    if (entries.length === 0) {
      toast.error("Enter at least one opening count");
      return;
    }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    const { data: prof } = await db.from("profiles").select("restaurant_id").eq("id", uid).single();
    const businessDate = istToday();

    const rows = entries
      .map((e) => {
        const item = baseItems.find((i) => i.id === e.item_id);
        if (!item?.pool_id) return null;
        return {
          restaurant_id: prof!.restaurant_id,
          pool_id: item.pool_id,
          qty_delta: e.qty,
          reason: "opening" as const,
          note: "Morning count",
          created_by: uid,
          business_date: businessDate,
        };
      })
      .filter(Boolean);

    if (rows.length === 0) {
      toast.error("Selected items don't have a stock pool yet — save the item again to create one");
      setSaving(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db.from("stock_ledger") as any).insert(rows);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Saved ${rows.length} opening count${rows.length > 1 ? "s" : ""}`);
    setOpeningDrafts({});
    load();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Daily Stock</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" /> {formatBusinessDay()}
          </p>
        </div>
        <Button onClick={() => setCloseOpen(true)} variant="outline">
          Close business day
        </Button>
      </header>

      {baseItems.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
          <Boxes className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No base items yet. Open a menu item, set stock to <strong>Counted</strong>, and mark it as <strong>This is a base item</strong>.
          </p>
        </div>
      )}

      {pendingItems.length > 0 && (
        <section className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-warning/10">
            <h2 className="font-semibold text-sm">Morning count needed ({pendingItems.length})</h2>
            <p className="text-xs text-muted-foreground">Enter today's opening quantity for each item.</p>
          </div>
          <div className="divide-y">
            {pendingItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-4">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{item.name}</div>
                  <div className="text-xs text-muted-foreground">portions</div>
                </div>
                <Input
                  type="number"
                  inputMode="decimal"
                  className="w-28 h-12 text-lg text-right font-semibold"
                  placeholder="0"
                  value={openingDrafts[item.id] ?? ""}
                  onChange={(e) => setOpeningDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div className="p-3 border-t bg-background flex justify-end">
            <Button onClick={saveOpenings} disabled={saving} className="min-h-[48px]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save openings
            </Button>
          </div>
        </section>
      )}

      {baseItems.length > 0 && (
        <section className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h2 className="font-semibold text-sm">Live stock</h2>
          </div>
          <div className="divide-y">
            {baseItems.map((item) => {
              const qty = poolQty(item.pool_id);
              const set = openingTodaySet(item.pool_id);
              const deps = dependents[item.id] ?? [];
              return (
                <div key={item.id} className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate flex items-center gap-2">
                        {item.name}
                        {!set && <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-warning/20 text-warning-foreground">no opening</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">portions</div>
                    </div>
                    <div className="text-2xl font-bold tabular-nums">{qty.toFixed(qty % 1 === 0 ? 0 : 2)}</div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-10 px-2" onClick={() => setAdjustOpen({ item, mode: "restock" })}>
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" className="h-10 px-2 text-danger" onClick={() => setAdjustOpen({ item, mode: "wastage" })}>
                        <Minus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {deps.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-dashed flex flex-wrap gap-2">
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><ChefHat className="h-3 w-3" /> Also sold as:</span>
                      {deps.map((d) => (
                        <span key={d.id} className="text-xs px-2 py-1 rounded bg-accent text-foreground">{d.name}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {adjustOpen && (
        <AdjustDialog
          item={adjustOpen.item}
          mode={adjustOpen.mode}
          onClose={() => setAdjustOpen(null)}
          onSaved={load}
        />
      )}

      {closeOpen && (
        <CloseDayDialog
          items={baseItems.map((i) => ({ ...i, balance: poolQty(i.pool_id) })).filter((i) => i.balance > 0)}
          onClose={() => setCloseOpen(false)}
          onDone={load}
        />
      )}
    </div>
  );
}

function AdjustDialog({
  item,
  mode,
  onClose,
  onSaved,
}: {
  item: BaseItem;
  mode: "restock" | "wastage";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) { toast.error("Enter a positive quantity"); return; }
    if (mode === "wastage" && !reason.trim()) { toast.error("Reason is required for wastage"); return; }
    if (!item.pool_id) { toast.error("This item has no stock pool yet — save it again from the menu editor"); return; }
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    const { data: prof } = await db.from("profiles").select("restaurant_id").eq("id", uid).single();
    const { error } = await db.from("stock_ledger").insert({
      restaurant_id: prof!.restaurant_id,
      pool_id: item.pool_id,
      qty_delta: mode === "restock" ? n : -n,
      reason: mode as "restock" | "wastage",
      note: reason.trim() || null,
      created_by: uid,
      business_date: istToday(),
    } as any);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(mode === "restock" ? "Restock added" : "Wastage recorded");
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "restock" ? "Restock" : "Wastage"} — {item.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Quantity (portions)</Label>
            <Input
              autoFocus
              type="number"
              inputMode="decimal"
              className="h-12 text-lg"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div>
            <Label>{mode === "wastage" ? "Reason (required)" : "Note (optional)"}</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={mode === "wastage" ? "e.g. Spilled, expired" : "e.g. Fresh batch"}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloseDayDialog({
  items,
  onClose,
  onDone,
}: {
  items: (BaseItem & { balance: number })[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [decisions, setDecisions] = useState<Record<string, "carry_forward" | "wastage">>(
    Object.fromEntries(items.map((i) => [i.pool_id ?? i.id, "carry_forward" as const])),
  );
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const payload = items
      .filter((i) => i.pool_id)
      .map((i) => ({ pool_id: i.pool_id!, action: decisions[i.pool_id ?? i.id], qty: i.balance }));
    const { error } = await db.rpc("close_business_day", { _decisions: payload });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Business day closed");
    onDone();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Close business day</DialogTitle>
        </DialogHeader>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">All stock is empty. Nothing to close.</p>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            <p className="text-xs text-muted-foreground">
              Decide what to do with each remaining balance. Carry-forward becomes tomorrow's opening; wastage is written off.
            </p>
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg border">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{item.name}</div>
                  <div className="text-xs text-muted-foreground">Balance: <span className="font-semibold">{item.balance}</span> portions</div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setDecisions((d) => ({ ...d, [item.pool_id ?? item.id]: "carry_forward" }))}
                    className={`px-3 py-2 rounded text-xs font-medium ${decisions[item.pool_id ?? item.id] === "carry_forward" ? "bg-primary text-primary-foreground" : "bg-accent"}`}
                  >Carry</button>
                  <button
                    onClick={() => setDecisions((d) => ({ ...d, [item.pool_id ?? item.id]: "wastage" }))}
                    className={`px-3 py-2 rounded text-xs font-medium ${decisions[item.pool_id ?? item.id] === "wastage" ? "bg-danger text-danger-foreground" : "bg-accent"}`}
                  >Waste</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || items.length === 0}>
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Close day
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
