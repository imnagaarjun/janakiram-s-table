import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ChefHat, Bell, X, Volume2, VolumeX } from "lucide-react";
import { dingNewTicket, fmtElapsed, minutesSince, timerClasses, timerLevel } from "@/lib/kds";
import { VoidDialog } from "@/components/order/VoidDialog";

type Kot = {
  id: string;
  kot_no: number;
  status: string;
  note: string | null;
  sent_at: string;
  session_id: string;
};
type Item = {
  id: string;
  kot_id: string;
  menu_item_id: string;
  qty: number;
  note: string | null;
  status: string;
};
type MenuItem = { id: string; name: string; kot_short_name: string | null };
type Session = { id: string; table_code: string | null; channel: string; pax: number };

export function KdsScreen() {
  const [kots, setKots] = useState<Kot[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [menu, setMenu] = useState<Record<string, MenuItem>>({});
  const [sessions, setSessions] = useState<Record<string, Session>>({});
  const [now, setNow] = useState(Date.now());
  const [soundOn, setSoundOn] = useState(true);
  const [voidTarget, setVoidTarget] = useState<{ id: string; label: string } | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const initialLoadRef = useRef(true);

  const load = useCallback(async () => {
    // Show pending + preparing tickets from last 12h
    const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
    const { data: ks } = await db
      .from("kots")
      .select("id,kot_no,status,note,sent_at,session_id")
      .in("status", ["pending", "preparing"])
      .gte("sent_at", since)
      .order("sent_at", { ascending: true });
    const kArr = (ks ?? []) as Kot[];
    setKots(kArr);

    const ids = kArr.map((k) => k.id);
    if (ids.length) {
      const [itRes, sesRes] = await Promise.all([
        db.from("kot_items").select("id,kot_id,menu_item_id,qty,note,status").in("kot_id", ids),
        db
          .from("order_sessions")
          .select("id,table_code,channel,pax")
          .in("id", Array.from(new Set(kArr.map((k) => k.session_id)))),
      ]);
      const its = (itRes.data ?? []) as Item[];
      setItems(its);
      const sesMap: Record<string, Session> = {};
      ((sesRes.data ?? []) as Session[]).forEach((s) => (sesMap[s.id] = s));
      setSessions(sesMap);

      const miIds = Array.from(new Set(its.map((i) => i.menu_item_id)));
      if (miIds.length) {
        const { data: mi } = await db
          .from("menu_items")
          .select("id,name,kot_short_name")
          .in("id", miIds);
        const mp: Record<string, MenuItem> = {};
        ((mi ?? []) as MenuItem[]).forEach((m) => (mp[m.id] = m));
        setMenu(mp);
      }
    } else {
      setItems([]);
    }

    // Detect new tickets for sound
    const newSet = new Set(kArr.map((k) => k.id));
    if (!initialLoadRef.current) {
      for (const id of newSet) {
        if (!seenIdsRef.current.has(id)) {
          if (soundOn) dingNewTicket();
          break;
        }
      }
    }
    seenIdsRef.current = newSet;
    initialLoadRef.current = false;
  }, [soundOn]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel("kds")
      .on("postgres_changes", { event: "*", schema: "public", table: "kots" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "kot_items" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  // Tick every 5s
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  // Wake lock + screen always on (best effort)
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    const wl = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinel> } }).wakeLock;
    if (wl?.request) {
      wl.request("screen").then((w) => (wakeLock = w)).catch(() => {});
    }
    return () => {
      wakeLock?.release().catch(() => {});
    };
  }, []);

  const itemsByKot = useMemo(() => {
    const m: Record<string, Item[]> = {};
    items.forEach((i) => {
      (m[i.kot_id] ??= []).push(i);
    });
    return m;
  }, [items]);

  async function bump(kotId: string) {
    const { error } = await supabase.rpc("bump_kot", { _kot_id: kotId });
    if (error) toast.error(error.message);
    else {
      toast.success("Ticket bumped");
      void load();
    }
  }

  async function confirmReject(reason: string, note: string, pin: string) {
    if (!voidTarget) return;
    const { error } = await supabase.rpc("void_kot_item", {
      _kot_item_id: voidTarget.id,
      _reason: `Kitchen reject: ${reason}`,
      _note: note,
      _manager_pin: pin,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Item rejected");
      setVoidTarget(null);
      void load();
    }
  }

  // Idle state
  if (kots.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-center p-8">
        <KdsHeader soundOn={soundOn} setSoundOn={setSoundOn} count={0} />
        <ChefHat className="h-24 w-24 text-muted-foreground mb-6" strokeWidth={1.5} />
        <div className="text-6xl font-bold tracking-tight tabular-nums">
          {new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
        <div className="text-xl text-muted-foreground mt-2">Hotel Sri Janakiram · Kitchen</div>
        <div className="text-sm text-muted-foreground mt-6">No active tickets</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <KdsHeader soundOn={soundOn} setSoundOn={setSoundOn} count={kots.length} />
      <div className="grid gap-3 p-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {kots.map((k) => {
          const mins = minutesSince(k.sent_at, now);
          const lvl = timerLevel(mins);
          const cls = timerClasses(lvl);
          const ses = sessions[k.session_id];
          const lines = (itemsByKot[k.id] ?? []).filter((i) => i.status !== "void");
          return (
            <div key={k.id} className={`rounded-xl bg-surface border-2 p-3 flex flex-col ${cls.card}`}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-2xl font-bold leading-tight">
                    {ses?.table_code ?? (ses?.channel === "takeaway" ? "T-Away" : "—")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    KOT #{k.kot_no} · {ses?.pax ?? 1} pax
                  </div>
                </div>
                <div className={`px-3 py-1 rounded-full text-sm font-bold tabular-nums ${cls.chip}`}>
                  {fmtElapsed(mins)}
                </div>
              </div>
              <div className="flex-1 space-y-1.5 mb-3">
                {lines.map((it) => {
                  const mi = menu[it.menu_item_id];
                  const name = mi?.kot_short_name?.trim() || mi?.name || "Item";
                  return (
                    <div key={it.id} className="flex items-start justify-between gap-2 border-b border-border/50 pb-1.5">
                      <div className="min-w-0">
                        <div className="font-semibold text-base leading-tight">
                          <span className="text-primary mr-2">×{Number(it.qty)}</span>
                          {name}
                        </div>
                        {it.note && (
                          <div className="text-xs text-amber-600 italic mt-0.5">↳ {it.note}</div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="shrink-0 text-muted-foreground hover:text-destructive p-1"
                        title="Kitchen reject"
                        onClick={() => setVoidTarget({ id: it.id, label: `${Number(it.qty)} × ${name}` })}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
              {k.note && (
                <div className="text-xs italic text-muted-foreground mb-2 border-l-2 border-amber-500 pl-2">
                  {k.note}
                </div>
              )}
              <Button size="lg" className="w-full font-bold text-base h-12" onClick={() => bump(k.id)}>
                <Bell className="h-5 w-5 mr-2" />
                Bump · Ready
              </Button>
            </div>
          );
        })}
      </div>

      <VoidDialog
        open={!!voidTarget}
        onOpenChange={(v) => !v && setVoidTarget(null)}
        lineLabel={voidTarget?.label ?? ""}
        onConfirm={confirmReject}
      />
    </div>
  );
}

function KdsHeader({
  soundOn,
  setSoundOn,
  count,
}: {
  soundOn: boolean;
  setSoundOn: (v: boolean) => void;
  count: number;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between bg-surface border-b border-border px-4 py-2">
      <div className="flex items-center gap-2">
        <ChefHat className="h-5 w-5 text-primary" />
        <span className="font-bold">Kitchen Display</span>
        <span className="text-sm text-muted-foreground">· {count} active</span>
      </div>
      <button
        type="button"
        onClick={() => setSoundOn(!soundOn)}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        {soundOn ? "Sound on" : "Muted"}
      </button>
    </div>
  );
}
