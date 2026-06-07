import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [activeCat, setActiveCat] = useState<string>(FAV_KEY);
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [popup, setPopup] = useState<MenuItem | null>(null);
  const [kotNote, setKotNote] = useState("");
  const [sending, setSending] = useState(false);
  const [voidLine, setVoidLine] = useState<SentLine | null>(null);

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

  async function sendKot() {
    if (draft.length === 0) return;
    setSending(true);
    const payload = draft.map((d) => ({ menu_item_id: d.menu_item_id, qty: d.qty, note: d.note ?? null }));
    const { data, error } = await db.rpc("send_kot", {
      _session_id: sessionId,
      _items: payload,
      _note: kotNote || null,
    });
    setSending(false);
    if (error) {
      toast.error(parseRpcError(error.message));
      load(); // reconcile
      return;
    }
    toast.success(`KOT K-${String((data as { kot_no: number }).kot_no).padStart(4, "0")} sent`);
    setDraft([]);
    setKotNote("");
    load();
  }

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
              if (error) toast.error(error.message);
              else {
                toast.success("Bill requested — cashier notified");
                setSession((s) => (s ? { ...s, status: "bill_requested" } : s));
              }
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
              onUpdate={updateDraftQty}
              onClear={() => setDraft([])}
              onSend={sendKot}
              sending={sending}
              onVoid={setVoidLine}
            />
          </aside>
        )}
      </div>

      {/* Phone: floating cart */}
      {!isTablet && (
        <Sheet>
          <SheetTrigger asChild>
            <Button
              className="fixed right-3 z-30 h-14 rounded-full shadow-lg"
              style={{ bottom: "calc(env(safe-area-inset-bottom) + 76px)" }}
            >
              <ShoppingBag className="h-5 w-5" />
              <span className="ml-1 font-bold">{draftCount}</span>
              <span className="ml-2 text-xs opacity-90">draft</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[85vh] p-0 flex flex-col">
            <SheetHeader className="p-4 border-b">
              <SheetTitle>KOT draft</SheetTitle>
            </SheetHeader>
            <DraftBody
              draft={draft}
              kotNote={kotNote}
              setKotNote={setKotNote}
              sentKots={sentKots}
              sentLines={sentLines}
              itemsById={itemsById}
              onUpdate={updateDraftQty}
              onClear={() => setDraft([])}
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
  onUpdate,
  onClear,
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
  onUpdate: (key: string, qty: number) => void;
  onClear: () => void;
  onSend: () => void;
  sending: boolean;
  onVoid: (l: SentLine) => void;
}) {
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
            {draft.map((d) => (
              <div key={d.key} className="flex items-center gap-2 rounded-lg border border-border p-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{d.name}</div>
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
            ))}
          </div>
          {draft.length > 0 && (
            <div className="mt-2">
              <Input
                value={kotNote}
                onChange={(e) => setKotNote(e.target.value)}
                placeholder="KOT note (whole order)"
              />
            </div>
          )}
        </section>

        {sentKots.length > 0 && (() => {
          const agg = new Map<string, number>();
          sentLines.forEach((l) => {
            if (l.status === "void") return;
            agg.set(l.menu_item_id, (agg.get(l.menu_item_id) ?? 0) + Number(l.qty));
          });
          const totalQty = Array.from(agg.values()).reduce((s, n) => s + n, 0);
          return (
            <section>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-muted-foreground">
                  Previously Ordered ({sentKots.length} KOT{sentKots.length > 1 ? "s" : ""} · {totalQty} item{totalQty !== 1 ? "s" : ""})
                </div>
              </div>

              {/* Aggregated summary across all sent KOTs */}
              {agg.size > 0 && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-2 mb-2">
                  <div className="text-[10px] font-bold text-primary mb-1 uppercase tracking-wide">Running total on this table</div>
                  <div className="space-y-0.5">
                    {Array.from(agg.entries()).map(([mid, q]) => (
                      <div key={mid} className="flex items-center justify-between text-sm">
                        <span className="truncate">{itemsById.get(mid)?.name ?? "—"}</span>
                        <span className="font-bold tabular-nums ml-2">× {q}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Per-KOT breakdown */}
              <div className="space-y-2">
                {sentKots.map((k) => {
                  const lines = sentLines.filter((l) => l.kot_id === k.id);
                  return (
                    <div key={k.id} className="rounded-lg border border-border p-2">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-xs font-bold">K-{String(k.kot_no).padStart(4, "0")}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {new Date(k.sent_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                      {lines.map((l) => {
                        const isVoid = l.status === "void";
                        return (
                          <div key={l.id} className="flex items-center justify-between text-sm py-1">
                            <span className={isVoid ? "line-through text-muted-foreground" : ""}>
                              {l.qty} × {itemsById.get(l.menu_item_id)?.name ?? "—"}
                              {l.note && <span className="text-[11px] text-muted-foreground ml-1">"{l.note}"</span>}
                            </span>
                            {!isVoid && (
                              <Button variant="ghost" size="sm" className="h-7 text-danger" onClick={() => onVoid(l)}>
                                Void
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })()}
      </div>

      <div className="border-t p-3 flex items-center gap-2 bg-surface">
        <Button variant="outline" onClick={onClear} disabled={draft.length === 0}>
          Clear
        </Button>
        <Button className="flex-1" onClick={onSend} disabled={draft.length === 0 || sending}>
          <Send className="h-4 w-4" /> {sending ? "Sending…" : `Send KOT (${draft.reduce((s, d) => s + d.qty, 0)})`}
        </Button>
      </div>
    </div>
  );
}
