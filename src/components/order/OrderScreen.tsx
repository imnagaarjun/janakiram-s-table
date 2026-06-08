import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Send, Trash2, ChevronLeft, ShoppingBag, Star } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { MenuImage } from "@/components/menu/MenuImage";
import { ItemQtyDialog } from "./ItemQtyDialog";
import { VoidDialog } from "./VoidDialog";
import { computeBill, type BillLine } from "@/lib/billing";
import { printBill } from "@/lib/print-bill";
import { useDeviceMode } from "@/hooks/use-device-mode";
import {
  availableFor,
  parseRpcError,
  projectedPoolQtys,
  type Category,
  type DraftLine,
  type LedgerRow,
  type MenuItem,
  type Recipe,
} from "@/lib/order";

interface SessionRow {
  id: string;
  table_code: string | null;
  channel: "dinein" | "takeaway";
  pax: number;
  status: string;
}
interface SentLine {
  id: string;
  kot_id: string;
  menu_item_id: string;
  qty: number;
  note: string | null;
  status: string;
  name?: string;
}
interface SentKot {
  id: string;
  kot_no: number;
  sent_at: string;
  note: string | null;
}

const FAV_KEY = "__favorites__";

export function OrderScreen({ sessionId }: { sessionId: string }) {
  const nav = useNavigate();
  const mode = useDeviceMode();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [sentKots, setSentKots] = useState<SentKot[]>([]);
  const [sentLines, setSentLines] = useState<SentLine[]>([]);
  const [prices, setPrices] = useState<Map<string, { inclusive: number; base: number; gst: number }>>(new Map());
  const [restaurant, setRestaurant] = useState<{ name: string | null; address: string | null; gstin: string | null; fssai: string | null; phone: string | null; service_charge_pct: number } | null>(null);
  const [activeCat, setActiveCat] = useState<string>(FAV_KEY);
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [popup, setPopup] = useState<MenuItem | null>(null);
  const [kotNote, setKotNote] = useState("");
  const [sending, setSending] = useState(false);
  const [voidLine, setVoidLine] = useState<SentLine | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  const load = useCallback(async () => {
    const [sRes, mRes, cRes, rRes, lRes, kRes, kiRes] = await Promise.all([
      db.from("order_sessions").select("id,table_code,channel,pax,status").eq("id", sessionId).maybeSingle(),
      db.from("menu_items").select("id,name,kot_short_name,category_id,image_url,is_favorite,is_active,is_86,stock_mode,display_order").order("display_order"),
      db.from("categories").select("id,name,display_order,image_url").order("display_order"),
      db.from("recipes").select("menu_item_id,stock_pool_id,consume_ratio"),
      db.from("stock_ledger").select("id,pool_id,qty_delta,created_at"),
      db.from("kots").select("id,kot_no,sent_at,note").eq("session_id", sessionId).order("sent_at"),
      db.from("kot_items").select("id,kot_id,menu_item_id,qty,note,status"),
    ]);
    setSession(sRes.data as SessionRow);
    setItems((mRes.data ?? []) as MenuItem[]);
    setCategories((cRes.data ?? []) as Category[]);
    setRecipes((rRes.data ?? []).map((r: { menu_item_id: string; stock_pool_id: string; consume_ratio: string | number }) => ({
      ...r,
      consume_ratio: Number(r.consume_ratio),
    })) as Recipe[]);
    setLedger((lRes.data ?? []) as LedgerRow[]);
    setSentKots((kRes.data ?? []) as SentKot[]);
    const sk = new Set(((kRes.data ?? []) as SentKot[]).map((k) => k.id));
    setSentLines(((kiRes.data ?? []) as SentLine[]).filter((l) => sk.has(l.kot_id)));
    const channel = (sRes.data as SessionRow | null)?.channel ?? "dinein";
    const [pRes, restRes] = await Promise.all([
      db.from("menu_prices").select("menu_item_id,inclusive_price,base_price,gst_rate").eq("channel_key", channel),
      db.from("restaurants").select("name,address,gstin,fssai,phone,service_charge_pct").limit(1).maybeSingle(),
    ]);
    const pmap = new Map<string, { inclusive: number; base: number; gst: number }>();
    (pRes.data ?? []).forEach((p: { menu_item_id: string; inclusive_price: number | string; base_price: number | string; gst_rate: number | string }) =>
      pmap.set(p.menu_item_id, {
        inclusive: Number(p.inclusive_price),
        base: Number(p.base_price),
        gst: Number(p.gst_rate),
      }),
    );
    setPrices(pmap);
    setRestaurant(rRes.data as typeof restaurant);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: stock_ledger + kots/kot_items for this session
  useEffect(() => {
    const ch = supabase
      .channel("order-" + sessionId)
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_ledger" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "kot_items" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "kots" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [sessionId, load]);

  const itemsById = useMemo(() => {
    const m = new Map<string, MenuItem>();
    items.forEach((i) => m.set(i.id, i));
    return m;
  }, [items]);

  const poolQtys = useMemo(() => projectedPoolQtys(ledger, recipes, draft), [ledger, recipes, draft]);

  const availability = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((it) => map.set(it.id, availableFor(it, recipes, poolQtys)));
    return map;
  }, [items, recipes, poolQtys]);

  const favorites = useMemo(() => items.filter((i) => i.is_active && i.is_favorite), [items]);
  const visibleCats = useMemo(
    () => categories.filter((c) => items.some((i) => i.category_id === c.id && i.is_active)),
    [categories, items],
  );

  const shownItems = useMemo(() => {
    if (activeCat === FAV_KEY) return favorites;
    return items.filter((i) => i.is_active && i.category_id === activeCat);
  }, [activeCat, items, favorites]);

  const draftCount = draft.reduce((s, d) => s + d.qty, 0);

  function addToDraft(it: MenuItem, qty: number, note?: string) {
    setDraft((d) => {
      const key = `${it.id}|${note ?? ""}`;
      const existing = d.find((x) => x.key === key);
      if (existing) return d.map((x) => (x.key === key ? { ...x, qty: x.qty + qty } : x));
      return [...d, { key, menu_item_id: it.id, name: it.name, qty, note }];
    });
    toast.success(`Added ${qty} × ${it.name}`);
  }

  function updateDraftQty(key: string, qty: number) {
    if (qty <= 0) return setDraft((d) => d.filter((x) => x.key !== key));
    setDraft((d) => d.map((x) => (x.key === key ? { ...x, qty } : x)));
  }

  const sendingRef = useRef(false);

  function printProForma(invoiceTag: string, extraDraft: DraftLine[] = []) {
    try {
      const agg = new Map<string, number>();
      sentLines.filter((l) => l.status !== "void").forEach((l) => {
        agg.set(l.menu_item_id, (agg.get(l.menu_item_id) ?? 0) + Number(l.qty));
      });
      extraDraft.forEach((d) => {
        agg.set(d.menu_item_id, (agg.get(d.menu_item_id) ?? 0) + d.qty);
      });
      const billLines: BillLine[] = Array.from(agg.entries()).map(([mid, qty]) => {
        const p = prices.get(mid);
        return {
          menu_item_id: mid,
          name: itemsById.get(mid)?.name ?? "Item",
          qty,
          inclusive_price: p?.inclusive ?? 0,
          base_price: p?.base ?? 0,
          gst_rate: p?.gst ?? 0,
          line_total: qty * (p?.inclusive ?? 0),
        };
      });
      if (billLines.length === 0 || !restaurant || !session) return;
      const totals = computeBill(billLines, {
        service_charge_pct: restaurant.service_charge_pct ?? 0,
        discount_amt: 0,
        discount_pct: 0,
        complimentary: false,
      });
      printBill({
        restaurant,
        invoice_no: invoiceTag,
        issued_at: new Date().toISOString(),
        table_label: session.table_code ? `Table ${session.table_code}` : "Takeaway",
        pax: session.pax,
        lines: billLines,
        totals,
        payments: [],
        notes: "*** PRO-FORMA — NOT A TAX INVOICE ***",
      });
    } catch (e) {
      console.error("Print preview failed", e);
    }
  }

  const sendKot = useCallback(async () => {
    if (sendingRef.current) return;
    if (draft.length === 0) return;
    sendingRef.current = true;
    setSending(true);
    const payload = draft.map((d) => ({ menu_item_id: d.menu_item_id, qty: d.qty, note: d.note ?? null }));
    const { data, error } = await db.rpc("send_kot", {
      _session_id: sessionId,
      _items: payload,
      _note: kotNote || null,
    });
    setSending(false);
    sendingRef.current = false;
    if (error) {
      toast.error(parseRpcError(error.message));
      load();
      return;
    }
    const kotNo = (data as { kot_no: number }).kot_no;
    toast.success(`KOT K-${String(kotNo).padStart(4, "0")} sent`);

    printProForma(`PREVIEW · K-${String(kotNo).padStart(4, "0")}`, draft);

    setDraft([]);
    setKotNote("");
    setCartOpen(false);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, kotNote, sessionId, sentLines, prices, restaurant, session, itemsById, load]);

  // Keyboard shortcut: Ctrl/Cmd+Enter to send KOT (works anywhere on the page)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Enter") return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (draft.length === 0) return;
      e.preventDefault();
      sendKot();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft.length, sendKot]);

  async function confirmVoid(line: SentLine, reason: string, note: string, pin: string) {
    const { error } = await db.rpc("void_kot_item", {
      _kot_item_id: line.id,
      _reason: reason,
      _note: note,
      _manager_pin: pin,
    });
    if (error) {
      toast.error(parseRpcError(error.message));
      return;
    }
    toast.success("Line voided");
    setVoidLine(null);
    load();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!session) {
    return <div className="p-6 text-center">Session not found.</div>;
  }

  const popupAvail = popup ? availability.get(popup.id) ?? 0 : 0;
  const isTablet = mode === "tablet";

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="border-b bg-surface px-3 py-2 flex items-center gap-2 shadow-sm sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={() => nav({ to: "/tables" })}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="font-bold leading-tight">
            {session.table_code ? `Table ${session.table_code}` : "Takeaway"}{" "}
            <span className="text-xs text-muted-foreground font-normal">
              · {session.channel === "dinein" ? "Dine-in" : "Takeaway"} · {session.pax} pax
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            {sentKots.length} KOT sent · {sentLines.filter((l) => l.status !== "void").length} active lines
          </div>
        </div>
        {sentLines.filter((l) => l.status !== "void").length > 0 && (
          <Button
            variant={session.status === "bill_requested" ? "default" : "outline"}
            size="sm"
            onClick={async () => {
              if (session.status === "bill_requested") {
                nav({ to: "/bill/$sessionId", params: { sessionId } });
                return;
              }
              const { error } = await supabase.rpc("request_bill", { _session_id: sessionId });
              if (error) {
                toast.error(error.message);
                return;
              }
              toast.success("Bill requested — cashier notified");
              setSession((s) => (s ? { ...s, status: "bill_requested" } : s));
              // Generate pro-forma bill PDF (same flow as KOT send)
              printProForma("PRO-FORMA · Bill Requested");
            }}
          >
            {session.status === "bill_requested" ? "Open Bill" : "Request Bill"}
          </Button>
        )}
      </header>

      <div className={`flex-1 flex ${isTablet ? "flex-row" : "flex-col"} overflow-hidden`}>
        {/* Left/main */}
        <div className="flex-1 overflow-y-auto p-3 pb-24">
          {/* Favorites strip */}
          {favorites.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold mb-1.5 text-muted-foreground">
                <Star className="h-3.5 w-3.5" /> Favorites
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {favorites.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => setPopup(it)}
                    className="shrink-0 w-28 rounded-xl border border-border bg-surface p-2 text-left shadow-sm active:scale-95 transition"
                  >
                    <MenuImage path={it.image_url} alt={it.name} className="h-16 w-full rounded-md mb-1" />
                    <div className="text-xs font-semibold truncate">{it.name}</div>
                    <AvailBadge n={availability.get(it.id) ?? 0} unlimited={it.stock_mode === "unlimited"} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Categories */}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mb-3">
            <CategoryBtn
              active={activeCat === FAV_KEY}
              onClick={() => setActiveCat(FAV_KEY)}
              label="★ Favorites"
            />
            {visibleCats.map((c) => (
              <CategoryBtn
                key={c.id}
                active={activeCat === c.id}
                onClick={() => setActiveCat(c.id)}
                label={c.name}
              />
            ))}
          </div>

          {/* Items grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {shownItems.length === 0 && (
              <div className="col-span-full text-center text-sm text-muted-foreground py-8">
                No items in this category.
              </div>
            )}
            {shownItems.map((it) => {
              const avail = availability.get(it.id) ?? 0;
              const blocked = it.stock_mode !== "unlimited" && avail <= 0;
              return (
                <button
                  key={it.id}
                  onClick={() => setPopup(it)}
                  disabled={blocked || it.is_86}
                  className={`rounded-xl border bg-surface p-2 text-left shadow-sm active:scale-95 transition min-h-[110px] flex flex-col gap-1 ${
                    blocked || it.is_86 ? "opacity-50 grayscale" : ""
                  }`}
                >
                  <MenuImage path={it.image_url} alt={it.name} className="h-20 w-full rounded-md" />
                  <div className="text-sm font-semibold truncate">{it.name}</div>
                  <div className="flex items-center justify-between">
                    <AvailBadge n={avail} unlimited={it.stock_mode === "unlimited"} />
                    {it.is_86 && <span className="text-[10px] font-bold text-danger">86</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Draft: tablet right panel */}
        {isTablet && (
          <aside className="w-[40%] max-w-md border-l bg-surface flex flex-col">
            <DraftBody
              draft={draft}
              kotNote={kotNote}
              setKotNote={setKotNote}
              sentKots={sentKots}
              sentLines={sentLines}
              itemsById={itemsById}
              prices={prices}
              onUpdate={updateDraftQty}
              onSend={sendKot}
              sending={sending}
              onVoid={setVoidLine}
            />
          </aside>
        )}
      </div>

      {/* Phone: floating cart */}
      {!isTablet && (
        <Sheet open={cartOpen} onOpenChange={setCartOpen}>
          <SheetTrigger asChild>
            <Button
              className={`fixed right-3 z-30 h-14 rounded-full shadow-lg flex items-center gap-1.5 ${
                draftCount > 0 ? "kot-pulse" : ""
              }`}
              style={{ bottom: "calc(env(safe-area-inset-bottom) + 76px)" }}
            >
              <ShoppingBag className="h-5 w-5" />
              <span className="font-bold">{draftCount}</span>
              <span className="text-xs opacity-90">draft</span>
              {sentLines.filter((l) => l.status !== "void").length > 0 && (
                <span className="ml-1 rounded-full bg-primary-foreground/20 px-1.5 py-0.5 text-[10px] font-bold">
                  +{sentLines.filter((l) => l.status !== "void").reduce((s, l) => s + Number(l.qty), 0)} sent
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[85vh] p-0 flex flex-col">
            <SheetHeader className="p-4 border-b">
              <SheetTitle>KOT draft & order history</SheetTitle>
            </SheetHeader>
            <DraftBody
              draft={draft}
              kotNote={kotNote}
              setKotNote={setKotNote}
              sentKots={sentKots}
              sentLines={sentLines}
              itemsById={itemsById}
              prices={prices}
              onUpdate={updateDraftQty}
              onSend={sendKot}
              sending={sending}
              onVoid={setVoidLine}
            />
          </SheetContent>
        </Sheet>
      )}

      <ItemQtyDialog
        open={!!popup}
        onOpenChange={(v) => !v && setPopup(null)}
        item={popup}
        available={popupAvail}
        tableLabel={session.table_code ? `Table ${session.table_code}` : "Takeaway"}
        onAdd={(qty, note) => popup && addToDraft(popup, qty, note)}
      />

      <VoidDialog
        open={!!voidLine}
        onOpenChange={(v) => !v && setVoidLine(null)}
        lineLabel={
          voidLine
            ? `${voidLine.qty} × ${itemsById.get(voidLine.menu_item_id)?.name ?? "item"}`
            : ""
        }
        onConfirm={(r, n, pin) => { if (voidLine) return confirmVoid(voidLine, r, n, pin); }}
      />
    </div>
  );
}

function CategoryBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-3 py-3 text-sm font-semibold min-h-[52px] border shadow-sm ${
        active ? "bg-primary text-primary-foreground border-transparent" : "bg-surface text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function AvailBadge({ n, unlimited }: { n: number; unlimited: boolean }) {
  if (unlimited) return <span className="text-[10px] text-muted-foreground">Unlimited</span>;
  if (n <= 0) return <span className="text-[10px] font-bold text-danger">Out</span>;
  return (
    <span className={`text-[10px] font-semibold ${n <= 3 ? "text-warning" : "text-muted-foreground"}`}>
      {n} left
    </span>
  );
}

function DraftBody({
  draft,
  kotNote,
  setKotNote,
  sentKots,
  sentLines,
  itemsById,
  prices,
  onUpdate,
  onSend,
  sending,
  onVoid,
}: {
  draft: DraftLine[];
  kotNote: string;
  setKotNote: (s: string) => void;
  sentKots: SentKot[];
  sentLines: SentLine[];
  itemsById: Map<string, MenuItem>;
  prices: Map<string, { inclusive: number; base: number; gst: number }>;
  onUpdate: (key: string, qty: number) => void;
  onSend: () => void;
  sending: boolean;
  onVoid: (l: SentLine) => void;
}) {
  const fmt = (n: number) => `₹${n.toFixed(2)}`;
  const priceOf = (mid: string) => prices.get(mid)?.inclusive ?? 0;
  const draftTotal = draft.reduce((s, d) => s + d.qty * priceOf(d.menu_item_id), 0);
  const sentTotal = sentLines
    .filter((l) => l.status !== "void")
    .reduce((s, l) => s + Number(l.qty) * priceOf(l.menu_item_id), 0);
  const grandTotal = draftTotal + sentTotal;
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <section>
          <div className="text-xs font-semibold text-muted-foreground mb-2">Draft</div>
          {draft.length === 0 && (
            <div className="text-sm text-muted-foreground p-4 text-center border border-dashed rounded-lg">
              Tap items to add.
            </div>
          )}
          <div className="space-y-1.5">
            {draft.map((d) => {
              const p = priceOf(d.menu_item_id);
              return (
                <div key={d.key} className="flex items-center gap-2 rounded-lg border border-border p-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{d.name}</div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">
                      {d.qty} × {fmt(p)} = <span className="font-semibold text-foreground">{fmt(d.qty * p)}</span>
                    </div>
                    {d.note && <div className="text-[11px] text-muted-foreground truncate">"{d.note}"</div>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => onUpdate(d.key, d.qty - 1)}>
                      −
                    </Button>
                    <div className="w-8 text-center font-bold">{d.qty}</div>
                    <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => onUpdate(d.key, d.qty + 1)}>
                      +
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-danger" onClick={() => onUpdate(d.key, 0)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          {draft.length > 0 && (
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between text-xs px-1">
                <span className="text-muted-foreground">Draft subtotal</span>
                <span className="font-semibold tabular-nums">{fmt(draftTotal)}</span>
              </div>
              <Input
                value={kotNote}
                onChange={(e) => setKotNote(e.target.value)}
                placeholder="KOT note (whole order)"
              />
            </div>
          )}
        </section>

        {sentKots.length > 0 && (() => {
          // Group sent lines by menu item — one row per item, with KOT chips + per-line void access
          const byItem = new Map<string, SentLine[]>();
          sentLines.forEach((l) => {
            const arr = byItem.get(l.menu_item_id) ?? [];
            arr.push(l);
            byItem.set(l.menu_item_id, arr);
          });
          const kotNoById = new Map(sentKots.map((k) => [k.id, k.kot_no]));
          const totalQty = sentLines.filter((l) => l.status !== "void").reduce((s, l) => s + Number(l.qty), 0);
          return (
            <section>
              <div className="text-xs font-semibold text-muted-foreground mb-2">
                Previously Ordered ({sentKots.length} KOT{sentKots.length > 1 ? "s" : ""} · {totalQty} item{totalQty !== 1 ? "s" : ""})
              </div>
              <div className="rounded-lg border border-primary/30 bg-primary/5 divide-y divide-primary/10">
                {Array.from(byItem.entries()).map(([mid, lines]) => {
                  const activeQty = lines.filter((l) => l.status !== "void").reduce((s, l) => s + Number(l.qty), 0);
                  const activeLines = lines.filter((l) => l.status !== "void");
                  const kotChips = Array.from(new Set(activeLines.map((l) => kotNoById.get(l.kot_id)))).filter(Boolean);
                  const p = priceOf(mid);
                  const lineTotal = activeQty * p;
                  return (
                    <details key={mid} className="group">
                      <summary className="flex items-center justify-between p-2 cursor-pointer list-none gap-2">
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-semibold truncate ${activeQty === 0 ? "line-through text-muted-foreground" : ""}`}>
                            {itemsById.get(mid)?.name ?? "—"}
                          </div>
                          <div className="text-[10px] text-muted-foreground tabular-nums">
                            {activeQty} × {fmt(p)}
                            {kotChips.length > 0 && (
                              <span className="ml-1">· {kotChips.map((n) => `K-${String(n).padStart(4, "0")}`).join(" · ")}</span>
                            )}
                            {kotChips.length === 0 && <span className="ml-1">· all voided</span>}
                          </div>
                        </div>
                        <div className="font-bold tabular-nums text-right">{fmt(lineTotal)}</div>
                      </summary>
                      <div className="px-3 pb-2 space-y-1">
                        {lines.map((l) => {
                          const isVoid = l.status === "void";
                          return (
                            <div key={l.id} className="flex items-center justify-between text-xs">
                              <span className={isVoid ? "line-through text-muted-foreground" : "text-muted-foreground"}>
                                K-{String(kotNoById.get(l.kot_id) ?? 0).padStart(4, "0")} · {l.qty}
                                {l.note && <span className="ml-1">"{l.note}"</span>}
                              </span>
                              {!isVoid && (
                                <Button variant="ghost" size="sm" className="h-6 text-danger" onClick={() => onVoid(l)}>
                                  Void
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center justify-between text-xs px-1">
                <span className="text-muted-foreground">Previously ordered subtotal</span>
                <span className="font-semibold tabular-nums">{fmt(sentTotal)}</span>
              </div>
            </section>
          );
        })()}

        <div className="rounded-lg border border-primary bg-primary/10 p-3 flex items-center justify-between">
          <span className="text-sm font-semibold">Bill total so far</span>
          <span className="text-lg font-extrabold tabular-nums">{fmt(grandTotal)}</span>
        </div>
      </div>

      <div className="border-t p-3 bg-surface">
        <Button
          onClick={onSend}
          disabled={draft.length === 0 || sending}
          className={`w-full h-16 text-lg font-extrabold tracking-wide ${
            draft.length > 0 && !sending ? "kot-pulse" : ""
          }`}
        >
          <Send className="h-5 w-5" />
          {sending ? "Sending…" : `Send KOT (${draft.reduce((s, d) => s + d.qty, 0)})`}
          <span className="ml-2 hidden sm:inline rounded bg-black/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wider">⌘/Ctrl+↵</span>
        </Button>
      </div>
    </div>
  );
}
