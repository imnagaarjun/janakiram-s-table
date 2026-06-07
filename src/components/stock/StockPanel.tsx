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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface Pool {
  id: string;
  name: string;
  type: "prepared_base" | "raw_ingredient";
  unit: string | null;
}
interface LedgerRow {
  id: string;
  pool_id: string;
  qty_delta: number;
  reason: string;
  note: string | null;
  created_at: string;
}
interface Recipe {
  menu_item_id: string;
  stock_pool_id: string;
  consume_ratio: number;
}
interface Item {
  id: string;
  name: string;
  stock_mode: "counted" | "unlimited";
  is_active: boolean;
  is_86: boolean;
}

export function StockPanel() {
  const [loading, setLoading] = useState(true);
  const [pools, setPools] = useState<Pool[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [openingDrafts, setOpeningDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState<{ pool: Pool; mode: "restock" | "wastage" } | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);

  const dayStart = useMemo(() => businessDayStart(), []);
  const dayStartIso = dayStart.toISOString();

  const load = useCallback(async () => {
    const [poolsRes, ledgerRes, recipesRes, itemsRes] = await Promise.all([
      db.from("stock_pools").select("id,name,type,unit").order("name"),
      db.from("stock_ledger").select("id,pool_id,qty_delta,reason,note,created_at").order("created_at", { ascending: false }),
      db.from("recipes").select("menu_item_id,stock_pool_id,consume_ratio"),
      db.from("menu_items").select("id,name,stock_mode,is_active,is_86"),
    ]);
    setPools(poolsRes.data ?? []);
    setLedger(ledgerRes.data ?? []);
    setRecipes(recipesRes.data ?? []);
    setItems(itemsRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const poolQty = useCallback(
    (poolId: string) =>
      ledger
        .filter((l) => l.pool_id === poolId && l.created_at <= new Date().toISOString())
        .reduce((s, l) => s + Number(l.qty_delta), 0),
    [ledger],
  );

  const openingTodaySet = useCallback(
    (poolId: string) =>
      ledger.some(
        (l) => l.pool_id === poolId && l.reason === "opening" && l.created_at >= dayStartIso && l.created_at <= new Date().toISOString(),
      ),
    [ledger, dayStartIso],
  );

  const itemAvailable = useCallback(
    (itemId: string): number => {
      const it = items.find((i) => i.id === itemId);
      if (!it || it.is_86 || !it.is_active) return 0;
      if (it.stock_mode === "unlimited") return 999999;
      const rs = recipes.filter((r) => r.menu_item_id === itemId);
      if (rs.length === 0) return 0;
      return rs.reduce((min, r) => {
        const v = Math.floor(poolQty(r.stock_pool_id) / Number(r.consume_ratio || 1));
        return Math.min(min, Math.max(0, v));
      }, Infinity) as number;
    },
    [items, recipes, poolQty],
  );

  const dependentItems = useCallback(
    (poolId: string) => {
      const itemIds = new Set(recipes.filter((r) => r.stock_pool_id === poolId).map((r) => r.menu_item_id));
      return items.filter((i) => itemIds.has(i.id) && i.stock_mode === "counted");
    },
    [recipes, items],
  );

  const pendingPools = pools.filter((p) => !openingTodaySet(p.id));
  const countedPools = pools; // every pool listed below regardless

  async function saveOpenings() {
    const entries = Object.entries(openingDrafts)
      .map(([pool_id, v]) => ({ pool_id, qty: Number(v) }))
      .filter((e) => Number.isFinite(e.qty) && e.qty > 0);
    if (entries.length === 0) {
      toast.error("Enter at least one opening count");
      return;
    }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    const { data: prof } = await db.from("profiles").select("restaurant_id").eq("id", uid).single();
    const rows = entries.map((e) => ({
      restaurant_id: prof.restaurant_id,
      pool_id: e.pool_id,
      qty_delta: e.qty,
      reason: "opening",
      note: "Morning count",
      created_by: uid,
    }));
    const { error } = await db.from("stock_ledger").insert(rows);
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

      {pools.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
          <Boxes className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No stock pools yet. Mark a counted menu item as "Use as root pool" or link recipe pools first.
          </p>
        </div>
      )}

      {pendingPools.length > 0 && (
        <section className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-warning/10">
            <h2 className="font-semibold text-sm">Morning count needed ({pendingPools.length})</h2>
            <p className="text-xs text-muted-foreground">Enter today's opening quantity for each pool.</p>
          </div>
          <div className="divide-y">
            {pendingPools.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-4">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.type === "prepared_base" ? "Prepared base" : "Raw ingredient"} {p.unit ? `· ${p.unit}` : ""}</div>
                </div>
                <Input
                  type="number"
                  inputMode="decimal"
                  className="w-28 h-12 text-lg text-right font-semibold"
                  placeholder="0"
                  value={openingDrafts[p.id] ?? ""}
                  onChange={(e) => setOpeningDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
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

      {countedPools.length > 0 && (
        <section className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h2 className="font-semibold text-sm">Live stock pools</h2>
          </div>
          <div className="divide-y">
            {countedPools.map((p) => {
              const qty = poolQty(p.id);
              const set = openingTodaySet(p.id);
              return (
                <div key={p.id} className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate flex items-center gap-2">
                        {p.name}
                        {!set && <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-warning/20 text-warning-foreground">no opening</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">{p.type === "prepared_base" ? "Prepared base" : "Raw ingredient"} {p.unit ? `· ${p.unit}` : ""}</div>
                    </div>
                    <div className="text-2xl font-bold tabular-nums">{qty.toFixed(qty % 1 === 0 ? 0 : 2)}</div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-10 px-2" onClick={() => setAdjustOpen({ pool: p, mode: "restock" })}>
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" className="h-10 px-2 text-danger" onClick={() => setAdjustOpen({ pool: p, mode: "wastage" })}>
                        <Minus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {dependentItems(p.id).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-dashed flex flex-wrap gap-2">
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><ChefHat className="h-3 w-3" /> Items:</span>
                      {dependentItems(p.id).map((it) => {
                        const av = itemAvailable(it.id);
                        return (
                          <span key={it.id} className="text-xs px-2 py-1 rounded bg-accent text-foreground">
                            {it.name}: <span className="font-semibold">{av === 999999 ? "∞" : av}</span>
                          </span>
                        );
                      })}
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
          pool={adjustOpen.pool}
          mode={adjustOpen.mode}
          onClose={() => setAdjustOpen(null)}
          onSaved={load}
        />
      )}

      {closeOpen && (
        <CloseDayDialog
          pools={pools.map((p) => ({ ...p, balance: poolQty(p.id) })).filter((p) => p.balance > 0)}
          onClose={() => setCloseOpen(false)}
          onDone={load}
        />
      )}
    </div>
  );
}

function AdjustDialog({
  pool,
  mode,
  onClose,
  onSaved,
}: {
  pool: Pool;
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
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    const { data: prof } = await db.from("profiles").select("restaurant_id").eq("id", uid).single();
    const { error } = await db.from("stock_ledger").insert({
      restaurant_id: prof.restaurant_id,
      pool_id: pool.id,
      qty_delta: mode === "restock" ? n : -n,
      reason: mode,
      note: reason.trim() || null,
      created_by: uid,
    });
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
          <DialogTitle>{mode === "restock" ? "Restock" : "Wastage"} — {pool.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Quantity {pool.unit ? `(${pool.unit})` : ""}</Label>
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
  pools,
  onClose,
  onDone,
}: {
  pools: (Pool & { balance: number })[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [decisions, setDecisions] = useState<Record<string, "carry_forward" | "wastage">>(
    Object.fromEntries(pools.map((p) => [p.id, "carry_forward" as const])),
  );
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const payload = pools.map((p) => ({ pool_id: p.id, action: decisions[p.id], qty: p.balance }));
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
        {pools.length === 0 ? (
          <p className="text-sm text-muted-foreground">All pools are empty. Nothing to close.</p>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            <p className="text-xs text-muted-foreground">
              Decide what to do with each remaining balance. Carry-forward becomes tomorrow's opening; wastage is written off.
            </p>
            {pools.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground">Balance: <span className="font-semibold">{p.balance}</span> {p.unit ?? ""}</div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setDecisions((d) => ({ ...d, [p.id]: "carry_forward" }))}
                    className={`px-3 py-2 rounded text-xs font-medium ${decisions[p.id] === "carry_forward" ? "bg-primary text-primary-foreground" : "bg-accent"}`}
                  >Carry</button>
                  <button
                    onClick={() => setDecisions((d) => ({ ...d, [p.id]: "wastage" }))}
                    className={`px-3 py-2 rounded text-xs font-medium ${decisions[p.id] === "wastage" ? "bg-danger text-danger-foreground" : "bg-accent"}`}
                  >Waste</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || pools.length === 0}>
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Close day
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
