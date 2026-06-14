import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { db } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Row {
  item_id: string;
  name: string;
  category_id: string | null;
  category_name: string | null;
  stock_mode: "counted" | "unlimited";
  available: number;
  benchmark: number | null;
  is_86: boolean;
}

type Level = "green" | "yellow" | "red";

/**
 * Real-time availability. Color rules:
 *  - red    → out of stock (qty 0, or 86'd)
 *  - yellow → at/below benchmark (only when a benchmark is set) but > 0
 *  - green  → healthy stock (or unlimited / no benchmark with qty > 0)
 */
function levelFor(r: Row): Level {
  if (r.is_86) return "red";
  if (r.stock_mode === "unlimited") return "green";
  if (r.available <= 0) return "red";
  if (r.benchmark != null && r.available <= r.benchmark) return "yellow";
  return "green";
}

const DOT: Record<Level, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
};
const TEXT: Record<Level, string> = {
  green: "text-emerald-600",
  yellow: "text-amber-600",
  red: "text-red-600",
};

export function AvailabilityDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await db.rpc("menu_availability");
    setRows(((data ?? []) as Row[]).map((r) => ({ ...r, available: Number(r.available) })));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    // Live-refresh when stock moves.
    const ch = supabase
      .channel("availability-popup")
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_ledger" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [open, load]);

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; items: Row[] }>();
    for (const r of rows) {
      const key = r.category_id ?? "__none__";
      if (!map.has(key)) map.set(key, { name: r.category_name ?? "Uncategorised", items: [] });
      map.get(key)!.items.push(r);
    }
    return Array.from(map.values());
  }, [rows]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-6">
            <span>Live availability</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={load} title="Refresh">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </DialogTitle>
        </DialogHeader>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${DOT.green}`} /> In stock</span>
          <span className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${DOT.yellow}`} /> Low (≤ benchmark)</span>
          <span className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${DOT.red}`} /> Out</span>
        </div>

        {loading && rows.length === 0 ? (
          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">No active menu items.</div>
        ) : (
          <div className="space-y-4">
            {grouped.map((g, gi) => (
              <div key={gi}>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{g.name}</div>
                <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
                  {g.items.map((r) => {
                    const lvl = levelFor(r);
                    return (
                      <div key={r.item_id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="inline-flex items-center gap-2 min-w-0">
                          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${DOT[lvl]}`} />
                          <span className="truncate">{r.name}</span>
                        </span>
                        <span className={`font-semibold tabular-nums ${TEXT[lvl]}`}>
                          {r.is_86 ? "86" : r.stock_mode === "unlimited" ? "∞" : r.available}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
