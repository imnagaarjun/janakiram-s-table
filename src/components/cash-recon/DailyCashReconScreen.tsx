import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Lock,
  Unlock,
  Save,
  CheckCircle2,
  AlertTriangle,
  Calendar as CalendarIcon,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { inr } from "@/lib/gst";
import { cn } from "@/lib/utils";

type Source =
  | "manual"
  | "auto_sales"
  | "auto_gpay"
  | "auto_card"
  | "auto_swiggy"
  | "auto_cash_expense";

interface Section {
  id: string;
  key: string;
  display_order: number;
}
interface CashflowLine {
  id: string;
  section_key: string;
  label: string;
  sign: "add" | "subtract";
  source: Source;
  display_order: number;
  is_active: boolean;
}
interface Denomination {
  id: string;
  value: number | null;
  label: string;
  display_order: number;
  is_active: boolean;
}
interface Reconciliation {
  id: string;
  business_date: string;
  section_key: string;
  status: "draft" | "finalised";
  finalised_at: string | null;
}
interface SavedValue {
  cashflow_line_id: string;
  manual_value: number;
  note: string | null;
}
interface SavedCount {
  denomination_id: string;
  count: number;
}
interface AutoTotals {
  sales: number;
  gpay: number;
  card: number;
  swiggy: number;
  cash_expense: number;
}

function todayIST(): string {
  const d = new Date();
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const ist = new Date(utc + 5.5 * 3600 * 1000);
  return ist.toISOString().slice(0, 10);
}

function num(s: string): number {
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

export function DailyCashReconScreen() {
  const { hasRole } = useAuth();
  const canFinalise = hasRole("admin", "manager");
  const canReopen = hasRole("admin", "manager");

  const [businessDate, setBusinessDate] = useState<string>(todayIST());
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionKey, setSectionKey] = useState<string>("");
  const [loading, setLoading] = useState(true);

  if (loading && sections.length === 0) {
    // first render
  }

  const loadSections = useCallback(async () => {
    const { data } = await db
      .from("cash_sections")
      .select("*")
      .eq("is_active", true)
      .order("display_order");
    const s = (data ?? []) as Section[];
    setSections(s);
    if (s.length > 0 && !sectionKey) setSectionKey(s[0].key);
    setLoading(false);
  }, [sectionKey]);

  useEffect(() => {
    loadSections();
  }, [loadSections]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <Label className="text-xs flex items-center gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5" /> Business date
          </Label>
          <Input
            type="date"
            value={businessDate}
            onChange={(e) => setBusinessDate(e.target.value)}
            className="h-9 w-[170px]"
          />
        </div>
      </div>

      <Tabs value={sectionKey} onValueChange={setSectionKey}>
        <TabsList className="mb-4 flex-wrap h-auto">
          {sections.map((s) => (
            <TabsTrigger key={s.id} value={s.key}>
              {s.key}
            </TabsTrigger>
          ))}
        </TabsList>
        {sections.map((s) => (
          <TabsContent key={s.id} value={s.key} className="mt-0">
            {sectionKey === s.key && (
              <SectionPane
                key={`${businessDate}-${s.key}`}
                businessDate={businessDate}
                sectionKey={s.key}
                canFinalise={canFinalise}
                canReopen={canReopen}
              />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function SectionPane({
  businessDate,
  sectionKey,
  canFinalise,
  canReopen,
}: {
  businessDate: string;
  sectionKey: string;
  canFinalise: boolean;
  canReopen: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmFinalise, setConfirmFinalise] = useState(false);
  const [lines, setLines] = useState<CashflowLine[]>([]);
  const [denoms, setDenoms] = useState<Denomination[]>([]);
  const [recon, setRecon] = useState<Reconciliation | null>(null);
  const [autoTotals, setAutoTotals] = useState<AutoTotals>({
    sales: 0,
    gpay: 0,
    card: 0,
    swiggy: 0,
    cash_expense: 0,
  });
  // Editable state
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [counts, setCounts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);

    const [linesRes, denomRes, reconRes, autoRes, cashExpRes] = await Promise.all([
      db
        .from("cashflow_lines")
        .select("*")
        .eq("section_key", sectionKey)
        .eq("is_active", true)
        .order("display_order"),
      db
        .from("denomination_config")
        .select("*")
        .eq("is_active", true)
        .order("display_order"),
      db
        .from("cash_reconciliations")
        .select("*")
        .eq("business_date", businessDate)
        .eq("section_key", sectionKey)
        .maybeSingle(),
      db.rpc("section_finance", {
        _business_date: businessDate,
        _section_key: sectionKey,
      }),
      db.rpc("cash_expense_total", { _business_date: businessDate }),
    ]);

    const ls = (linesRes.data ?? []) as CashflowLine[];
    const ds = (denomRes.data ?? []) as Denomination[];
    const r = (reconRes.data ?? null) as Reconciliation | null;
    const a = ((autoRes.data ?? [])[0] ?? {}) as {
      sales_total?: number;
      gpay_total?: number;
      card_total?: number;
      swiggy_total?: number;
      cash_sales_total?: number;
    };

    setLines(ls);
    setDenoms(ds);
    setRecon(r);
    setAutoTotals({
      sales: Number(a.sales_total) || 0,
      gpay: Number(a.gpay_total) || 0,
      card: Number(a.card_total) || 0,
      swiggy: Number(a.swiggy_total) || 0,
      cash_expense: Number(cashExpRes.data) || 0,
    });

    // Load saved values/counts if recon exists
    if (r) {
      const [valsRes, cntsRes] = await Promise.all([
        db
          .from("cash_recon_values")
          .select("cashflow_line_id,manual_value,note")
          .eq("reconciliation_id", r.id),
        db
          .from("denomination_counts")
          .select("denomination_id,count")
          .eq("reconciliation_id", r.id),
      ]);
      const mv: Record<string, string> = {};
      const nt: Record<string, string> = {};
      ((valsRes.data ?? []) as SavedValue[]).forEach((v) => {
        mv[v.cashflow_line_id] = String(v.manual_value ?? 0);
        if (v.note) nt[v.cashflow_line_id] = v.note;
      });
      setManualValues(mv);
      setNotes(nt);
      const cm: Record<string, string> = {};
      ((cntsRes.data ?? []) as SavedCount[]).forEach((c) => {
        cm[c.denomination_id] = String(c.count ?? 0);
      });
      setCounts(cm);
    } else {
      setManualValues({});
      setNotes({});
      setCounts({});
    }

    setLoading(false);
  }, [businessDate, sectionKey]);

  useEffect(() => {
    load();
  }, [load]);

  const isFinalised = recon?.status === "finalised";

  function autoValue(source: Source): number {
    switch (source) {
      case "auto_sales":
        return autoTotals.sales;
      case "auto_gpay":
        return autoTotals.gpay;
      case "auto_card":
        return autoTotals.card;
      case "auto_swiggy":
        return autoTotals.swiggy;
      case "auto_cash_expense":
        return autoTotals.cash_expense;
      default:
        return 0;
    }
  }

  function lineValue(l: CashflowLine): number {
    return l.source === "manual" ? num(manualValues[l.id] ?? "") : autoValue(l.source);
  }

  const expected = useMemo(() => {
    let total = 0;
    for (const l of lines) {
      const v = lineValue(l);
      total += l.sign === "add" ? v : -v;
    }
    return total;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, manualValues, autoTotals]);

  const counted = useMemo(() => {
    let total = 0;
    for (const d of denoms) {
      const c = num(counts[d.id] ?? "");
      total += d.value === null ? c : c * (d.value ?? 0);
    }
    return total;
  }, [denoms, counts]);

  const variance = counted - expected;

  async function save(finalise: boolean) {
    setSaving(true);
    const values = lines
      .filter((l) => l.source === "manual")
      .map((l) => ({
        cashflow_line_id: l.id,
        manual_value: num(manualValues[l.id] ?? ""),
        note: notes[l.id] ?? "",
      }));
    const countsArr = denoms.map((d) => ({
      denomination_id: d.id,
      count: num(counts[d.id] ?? ""),
    }));
    const { error } = await db.rpc("save_cash_reconciliation", {
      _business_date: businessDate,
      _section_key: sectionKey,
      _values: values,
      _counts: countsArr,
      _finalise: finalise,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(finalise ? "Finalised" : "Draft saved");
    setConfirmFinalise(false);
    load();
  }

  async function reopen() {
    if (!recon) return;
    const { error } = await db.rpc("reopen_cash_reconciliation", {
      _recon_id: recon.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Reopened");
    load();
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-32">
      <div className="flex items-center gap-2">
        {isFinalised ? (
          <Badge className="bg-emerald-600 hover:bg-emerald-700">
            <Lock className="h-3 w-3 mr-1" /> Finalised
          </Badge>
        ) : (
          <Badge variant="outline">Draft</Badge>
        )}
        {isFinalised && canReopen && (
          <Button size="sm" variant="outline" onClick={reopen} className="h-7">
            <Unlock className="h-3 w-3 mr-1" /> Reopen
          </Button>
        )}
      </div>

      {/* Cash-flow tally */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/30">
          <div className="font-semibold text-sm">Cash-flow tally</div>
          <div className="text-[11px] text-muted-foreground">
            Auto lines pull live from settled bills and cash purchases. Manual lines are typed.
          </div>
        </div>
        {lines.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No cash-flow lines configured for {sectionKey}. Set them up in Cash reconciliation
            setup.
          </div>
        ) : (
          <div className="divide-y">
            {lines.map((l) => {
              const isAuto = l.source !== "manual";
              const val = lineValue(l);
              return (
                <div
                  key={l.id}
                  className="grid grid-cols-12 gap-2 items-center px-3 py-2.5"
                >
                  <div className="col-span-7 sm:col-span-6 flex items-center gap-2 min-w-0">
                    <Badge
                      variant="outline"
                      className={cn(
                        "h-5 px-1.5 text-[10px] font-bold",
                        l.sign === "add"
                          ? "border-emerald-300 text-emerald-700"
                          : "border-rose-300 text-rose-700",
                      )}
                    >
                      {l.sign === "add" ? "+" : "−"}
                    </Badge>
                    <span className="truncate text-sm font-medium">{l.label}</span>
                    {isAuto && (
                      <Badge variant="secondary" className="text-[9px] h-4 px-1">
                        auto
                      </Badge>
                    )}
                  </div>
                  <div className="col-span-5 sm:col-span-3">
                    {isAuto ? (
                      <div className="text-right tabular-nums text-sm font-semibold px-2 py-1.5 bg-muted/40 rounded">
                        {inr(val)}
                      </div>
                    ) : (
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={manualValues[l.id] ?? ""}
                        onChange={(e) =>
                          setManualValues((m) => ({ ...m, [l.id]: e.target.value }))
                        }
                        disabled={isFinalised}
                        placeholder="0"
                        className="h-9 text-right tabular-nums"
                      />
                    )}
                  </div>
                  <div className="col-span-12 sm:col-span-3">
                    {!isAuto && (
                      <Input
                        value={notes[l.id] ?? ""}
                        onChange={(e) =>
                          setNotes((m) => ({ ...m, [l.id]: e.target.value }))
                        }
                        disabled={isFinalised}
                        placeholder="note (optional)"
                        className="h-9 text-xs"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="px-4 py-3 border-t border-border bg-muted/20 flex items-center justify-between">
          <span className="text-sm font-semibold">Expected cash in drawer</span>
          <span className="text-lg font-bold tabular-nums">{inr(expected)}</span>
        </div>
      </div>

      {/* Denomination count */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/30">
          <div className="font-semibold text-sm">Denomination count</div>
          <div className="text-[11px] text-muted-foreground">
            Enter count per note. Rows without a value (e.g. "Coins") accept a ₹ amount directly.
          </div>
        </div>
        {denoms.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No denomination rows. Set them up in Cash reconciliation setup.
          </div>
        ) : (
          <div className="divide-y">
            {denoms.map((d) => {
              const c = num(counts[d.id] ?? "");
              const sub = d.value === null ? c : c * (d.value ?? 0);
              return (
                <div key={d.id} className="grid grid-cols-12 gap-2 items-center px-3 py-2">
                  <div className="col-span-4 sm:col-span-4 font-medium text-sm">{d.label}</div>
                  <div className="col-span-3 sm:col-span-3 text-right text-xs text-muted-foreground tabular-nums">
                    {d.value === null ? "—" : `× ${inr(d.value)}`}
                  </div>
                  <div className="col-span-3 sm:col-span-3">
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={counts[d.id] ?? ""}
                      onChange={(e) =>
                        setCounts((m) => ({ ...m, [d.id]: e.target.value }))
                      }
                      disabled={isFinalised}
                      placeholder={d.value === null ? "₹" : "0"}
                      className="h-9 text-right tabular-nums"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-2 text-right tabular-nums text-sm font-semibold">
                    {inr(sub)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="px-4 py-3 border-t border-border bg-muted/20 flex items-center justify-between">
          <span className="text-sm font-semibold">Counted total</span>
          <span className="text-lg font-bold tabular-nums">{inr(counted)}</span>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-16 sm:bottom-4 left-0 right-0 z-30 px-4">
        <div className="max-w-5xl mx-auto rounded-2xl border border-border bg-background/95 backdrop-blur shadow-lg p-3">
          <div className="grid grid-cols-3 gap-3 mb-2">
            <Stat label="Expected" value={inr(expected)} />
            <Stat label="Counted" value={inr(counted)} />
            <Stat
              label={variance === 0 ? "Tally" : variance > 0 ? "Excess" : "Short"}
              value={variance === 0 ? "✓" : inr(Math.abs(variance))}
              tone={
                variance === 0 ? "ok" : variance > 0 ? "warn" : "bad"
              }
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => save(false)}
              disabled={saving || isFinalised}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Save draft
            </Button>
            {canFinalise && (
              <Button
                onClick={() => setConfirmFinalise(true)}
                disabled={saving || isFinalised}
              >
                <Lock className="h-4 w-4 mr-1" /> Finalise
              </Button>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={confirmFinalise} onOpenChange={setConfirmFinalise}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalise reconciliation?</AlertDialogTitle>
            <AlertDialogDescription>
              {sectionKey} · {businessDate} · Variance{" "}
              <strong>{variance === 0 ? "Tally" : inr(Math.abs(variance))}</strong>{" "}
              {variance > 0 ? "(Excess)" : variance < 0 ? "(Short)" : ""}. Once finalised this
              day's cash-up is locked; only a manager can reopen it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => save(true)}>Finalise</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "bad";
}) {
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center justify-center gap-1">
        {tone === "ok" && <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
        {tone === "bad" && <AlertTriangle className="h-3 w-3 text-rose-600" />}
        {label}
      </div>
      <div
        className={cn(
          "text-base sm:text-lg font-bold tabular-nums",
          tone === "ok" && "text-emerald-700",
          tone === "warn" && "text-amber-700",
          tone === "bad" && "text-rose-700",
        )}
      >
        {value}
      </div>
    </div>
  );
}
