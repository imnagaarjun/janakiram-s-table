// Global background listener: when a KOT this waiter sent becomes ready,
// or one of their items is voided, alert with toast + sound + vibration.
import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db";
import { toast } from "sonner";
import { dingWaiterAlert } from "@/lib/kds";

type KotRow = { id: string; kot_no: number; status: string; created_by: string | null; session_id: string };
type ItemRow = { id: string; kot_id: string; status: string; note: string | null };

export function WaiterNotifier() {
  const { userId, hasRole } = useAuth();
  const mountedAt = useRef<number>(Date.now());

  useEffect(() => {
    if (!userId) return;
    // Kitchen-only tablets don't need waiter pings.
    if (hasRole("kitchen") && !hasRole("waiter") && !hasRole("manager") && !hasRole("admin")) return;

    const ch = supabase
      .channel("waiter-notify-" + userId)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "kots" },
        async (payload) => {
          const k = payload.new as KotRow;
          if (k.created_by !== userId) return;
          if (k.status !== "ready") return;
          // Look up table for context
          const { data: ses } = await db
            .from("order_sessions")
            .select("table_code,channel")
            .eq("id", k.session_id)
            .maybeSingle();
          const where = ses?.table_code ?? (ses?.channel === "takeaway" ? "Takeaway" : "—");
          dingWaiterAlert();
          toast.success(`Ready: ${where} · KOT #${k.kot_no}`, { duration: 6000 });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "kot_items" },
        async (payload) => {
          const it = payload.new as ItemRow;
          const prev = payload.old as ItemRow;
          if (it.status !== "void" || prev.status === "void") return;
          // Confirm this kot belongs to the current waiter
          const { data: k } = await db
            .from("kots")
            .select("kot_no,created_by,session_id")
            .eq("id", it.kot_id)
            .maybeSingle();
          if (!k || k.created_by !== userId) return;
          const { data: ses } = await db
            .from("order_sessions")
            .select("table_code")
            .eq("id", k.session_id)
            .maybeSingle();
          const where = ses?.table_code ?? "Order";
          dingWaiterAlert();
          toast.error(`Voided: ${where} · KOT #${k.kot_no}${it.note ? ` — ${it.note}` : ""}`, {
            duration: 8000,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, hasRole]);

  // suppress unused warning on mountedAt while keeping it for future use
  void mountedAt;
  return null;
}
