import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Lock,
  Minus,
  Plus,
  Save,
  Unlock,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  CashDayBanner,
  CashSignoffDialog,
  plainError,
  type CashDaySignoff,
  type CashPointStatus,
  type CashSignoffAction,
  type CashStage,
} from "./CashSignoff";

type Source =
  "manual" | "auto_sales" | "auto_gpay" | "auto_card" | "auto_swiggy" | "auto_cash_expense";

interface Section {
  id: string;
  key: string;
  label: string | null;
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
// A line that exists for this one day only. Always typed by hand.
interface ExtraLine {
  label: string;
  sign: "add" | "subtract";
  amount: string;
}

function todayIST(): string {
  const d = new Date();
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const ist = new Date(utc + 5.5 * 3600 * 1000);
  return ist.toISOString().slice(0, 10);
}

function shiftDay(date: string, by: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}

function num(s: string): number {
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

export function DailyCashReconScreen() {
  const { hasRole, can } = useAuth();
  const isAdmin = hasRole("admin");
  const canFinalise = hasRole("admin", "manager");
  const canReopen = hasRole("admin", "manager");
  const canCheck = can("cash-recon:check");
  const canApprove = can("cash-recon:approve");

  const [businessDate, setBusinessDate] = useState<string>(todayIST());
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionKey, setSectionKey] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState<CashPointStatus[]>([]);
  const [dayReady, setDayReady] = useState(false);
  const [signoff, setSignoff] = useState<CashDaySignoff | null>(null);
  const [action, setAction] = useState<CashSignoffAction | null>(null);
  const [busy, setBusy] = useState(false);
  const dirtyRef = useRef(false);

  const loadSections = useCallback(async () => {
    const { data } = await db
      .from("cash_sections")
      .select("*")
      .eq("is_active", true)
      .order("display_order");
    const s = (data ?? []) as Section[];
    setSections(s);
    setSectionKey((cur) => cur || (s.length > 0 ? s[0].key : ""));
    setLoading(false);
  }, []);
  useEffect(() => {
    loadSections();
  }, [loadSections]);

  // Where every cash point stands today, and who has checked / approved the day.
  const refreshDay = useCallback(async () => {
    const [st, so] = await Promise.all([
      db.rpc("cash_day_status", { _business_date: businessDate }),
      db.from("cash_day_signoffs").select("*").eq("business_date", businessDate).maybeSingle(),
    ]);
    if (st.error) {
      setDayReady(false);
      return;
    }
    setPoints(
      ((st.data ?? []) as CashPointStatus[]).map((p) => ({
        ...p,
        expected: p.expected === null ? null : Number(p.expected),
        counted: p.counted === null ? null : Number(p.counted),
      })),
    );
    setSignoff((so.data ?? null) as CashDaySignoff | null);
    setDayReady(true);
  }, [businessDate]);
  useEffect(() => {
    refreshDay();
  }, [refreshDay]);

  const stage: CashStage = signoff?.approved_at
    ? "approved"
    : signoff?.checked_at
      ? "checked"
      : "open";

  // Edits live only in the open pane, so ask before they are thrown away.
  function leaveOk(): boolean {
    if (!dirtyRef.current) return true;
    if (!window.confirm("You have unsaved changes. Discard them?")) return false;
    dirtyRef.current = false;
    return true;
  }
  const goDate = (d: string) => {
    if (d && d !== businessDate && leaveOk()) setBusinessDate(d);
  };
  const goSection = (k: string) => {
    if (k !== sectionKey && leaveOk()) setSectionKey(k);
  };

  async function runAction(a: CashSignoffAction) {
    setBusy(true);
    const fn = {
      check: "check_cash_day",
      approve: "approve_cash_day",
      sendback: "send_back_cash_day",
      reopen: "reopen_cash_day",
    }[a];
    const { error } = await db.rpc(fn, { _business_date: businessDate });
    setBusy(false);
    if (error) {
      toast.error(plainError(error.message));
      setAction(null);
      refreshDay();
      return;
    }
    toast.success(
      {
        check: "Day marked as checked",
        approve: "Day approved",
        sendback: "Sent back for changes",
        reopen: "Approval removed",
      }[a],
    );
    setAction(null);
    refreshDay();
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  const pointOf = (k: string) => points.find((p) => p.section_key === k);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs flex items-center gap-1.5 mb-1">
            <CalendarIcon className="h-3.5 w-3.5" /> Business date
          </Label>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => goDate(shiftDay(businessDate, -1))}
              aria-label="Previous day"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input
              type="date"
              value={businessDate}
              onChange={(e) => goDate(e.target.value)}
              className="h-9 w-[160px]"
              aria-label="Business date"
            />
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => goDate(shiftDay(businessDate, 1))}
              aria-label="Next day"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            {businessDate !== todayIST() && (
              <Button variant="ghost" size="sm" className="h-9" onClick={() => goDate(todayIST())}>
                Today
              </Button>
            )}
          </div>
        </div>
      </div>

      {dayReady && (
        <CashDayBanner
          stage={stage}
          signoff={signoff}
          points={points}
          activeKey={sectionKey}
          isAdmin={isAdmin}
          canCheck={canCheck}
          canApprove={canApprove}
          onPick={goSection}
          onAction={setAction}
        />
      )}

      <Tabs value={sectionKey} onValueChange={goSection}>
        <TabsList className="flex-wrap h-auto">
          {sections.map((s) => {
            const p = pointOf(s.key);
            return (
              <TabsTrigger key={s.id} value={s.key} className="gap-1.5">
                {p?.tallied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : null}
                {s.label ?? s.key}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {sections.map(
        (s) =>
          sectionKey === s.key && (
            <SectionPane
              key={`${businessDate}-${s.key}`}
              businessDate={businessDate}
              sectionKey={s.key}
              sectionLabel={s.label ?? s.key}
              canFinalise={canFinalise}
              canReopen={canReopen}
              locked={stage !== "open"}
              onSaved={refreshDay}
              onDirtyChange={(v) => {
                dirtyRef.current = v;
              }}
            />
          ),
      )}

      <CashSignoffDialog
        action={action}
        businessDate={businessDate}
        points={points}
        busy={busy}
        onClose={() => setAction(null)}
        onConfirm={runAction}
      />
    </div>
  );
}

function SectionPane({
  businessDate,
  sectionKey,
  sectionLabel,
  canFinalise,
  canReopen,
  locked,
  onSaved,
  onDirtyChange,
}: {
  businessDate: string;
  sectionKey: string;
  sectionLabel: string;
  canFinalise: boolean;
  canReopen: boolean;
  locked: boolean;
  onSaved: () => void;
  onDirtyChange: (dirty: boolean) => void;
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
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>({});
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [extras, setExtras] = useState<ExtraLine[]>([]);
  const [baseline, setBaseline] = useState("");
  const [view, setView] = useState<"count" | "calc">("count");
  const [xName, setXName] = useState("");
  const [xSign, setXSign] = useState<"add" | "subtract">("add");
  const [xAmt, setXAmt] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const xAmtRef = useRef<HTMLInputElement>(null);
  const xNameRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);

    const [linesRes, denomRes, reconRes, autoRes, cashExpRes] = await Promise.all([
      db
        .from("cashflow_lines")
        .select("*")
        .eq("section_key", sectionKey)
        .eq("is_active", true)
        .order("display_order"),
      db.from("denomination_config").select("*").eq("is_active", true).order("display_order"),
      db
        .from("cash_reconciliations")
        .select("*")
        .eq("business_date", businessDate)
        .eq("section_key", sectionKey)
        .maybeSingle(),
      db.rpc("section_finance", { _business_date: businessDate, _section_key: sectionKey }),
      db.rpc("cash_expense_total", { _business_date: businessDate, _section_key: sectionKey }),
    ]);

    const r = (reconRes.data ?? null) as Reconciliation | null;
    const a = ((autoRes.data ?? [])[0] ?? {}) as {
      sales_total?: number;
      gpay_total?: number;
      card_total?: number;
      swiggy_total?: number;
    };

    setLines((linesRes.data ?? []) as CashflowLine[]);
    setDenoms((denomRes.data ?? []) as Denomination[]);
    setRecon(r);
    setAutoTotals({
      sales: Number(a.sales_total) || 0,
      gpay: Number(a.gpay_total) || 0,
      card: Number(a.card_total) || 0,
      swiggy: Number(a.swiggy_total) || 0,
      cash_expense: Number(cashExpRes.data) || 0,
    });

    const mv: Record<string, string> = {};
    const nt: Record<string, string> = {};
    const cm: Record<string, string> = {};
    let ex: ExtraLine[] = [];
    if (r) {
      const [valsRes, cntsRes, exRes] = await Promise.all([
        db
          .from("cash_recon_values")
          .select("cashflow_line_id,manual_value,note")
          .eq("reconciliation_id", r.id),
        db
          .from("denomination_counts")
          .select("denomination_id,count")
          .eq("reconciliation_id", r.id),
        db
          .from("cash_recon_extra_lines")
          .select("label,sign,amount")
          .eq("reconciliation_id", r.id)
          .order("display_order"),
      ]);
      ((valsRes.data ?? []) as SavedValue[]).forEach((v) => {
        mv[v.cashflow_line_id] = String(v.manual_value ?? 0);
        if (v.note) nt[v.cashflow_line_id] = v.note;
      });
      ((cntsRes.data ?? []) as SavedCount[]).forEach((c) => {
        cm[c.denomination_id] = String(c.count ?? 0);
      });
      ex = (
        (exRes.data ?? []) as { label: string; sign: "add" | "subtract"; amount: number }[]
      ).map((e) => ({ label: e.label, sign: e.sign, amount: String(e.amount) }));
    }
    setManualValues(mv);
    setNotes(nt);
    setOpenNotes({});
    setCounts(cm);
    setExtras(ex);
    setBaseline(JSON.stringify({ mv, nt, cm, ex }));
    setLoading(false);
  }, [businessDate, sectionKey]);

  useEffect(() => {
    load();
  }, [load]);

  const isFinalised = recon?.status === "finalised";
  const editable = !isFinalised && !locked;

  const dirty = useMemo(
    () =>
      !loading &&
      baseline !== JSON.stringify({ mv: manualValues, nt: notes, cm: counts, ex: extras }),
    [loading, baseline, manualValues, notes, counts, extras],
  );
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

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

  // A finalised day keeps the cash-expense figure stored when it was saved; drafts follow live data.
  function lineValue(l: CashflowLine): number {
    if (l.source === "manual") return num(manualValues[l.id] ?? "");
    if (isFinalised && l.source === "auto_cash_expense" && manualValues[l.id] !== undefined)
      return num(manualValues[l.id]);
    return autoValue(l.source);
  }

  const extrasTotal = extras.reduce(
    (a, e) => a + (e.sign === "add" ? num(e.amount) : -num(e.amount)),
    0,
  );
  const expected = useMemo(() => {
    let total = 0;
    for (const l of lines) {
      const v = lineValue(l);
      total += l.sign === "add" ? v : -v;
    }
    return total + extrasTotal;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, manualValues, autoTotals, extrasTotal, isFinalised]);

  const counted = useMemo(() => {
    let total = 0;
    for (const d of denoms) {
      const c = num(counts[d.id] ?? "");
      total += d.value === null ? c : c * (d.value ?? 0);
    }
    return total;
  }, [denoms, counts]);

  const variance = Math.round((counted - expected) * 100) / 100;
  const tone = variance === 0 ? "ok" : variance > 0 ? "warn" : "bad";

  function enterNext(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const all = Array.from(
      rootRef.current?.querySelectorAll<HTMLInputElement>("input[data-nav]:not(:disabled)") ?? [],
    ).filter((el) => el.offsetParent !== null);
    const next = all[all.indexOf(e.currentTarget) + 1];
    if (next) {
      next.focus();
      next.select();
    }
  }

  function addExtra() {
    const label = xName.trim().replace(/\s+/g, " ");
    const amount = num(xAmt);
    if (!label) {
      toast.error("Give the line a name");
      xNameRef.current?.focus();
      return;
    }
    if (!(amount > 0)) {
      toast.error("Enter an amount");
      xAmtRef.current?.focus();
      return;
    }
    setExtras((x) => [...x, { label, sign: xSign, amount: String(amount) }]);
    setXName("");
    setXAmt("");
    xNameRef.current?.focus();
  }

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
      _extras: extras.map((e) => ({ label: e.label, sign: e.sign, amount: num(e.amount) })),
    });
    setSaving(false);
    if (error) {
      toast.error(plainError(error.message));
      return;
    }
    toast.success(finalise ? "Finalised" : "Draft saved");
    setConfirmFinalise(false);
    await load();
    onSaved();
  }

  async function reopen() {
    if (!recon) return;
    const { error } = await db.rpc("reopen_cash_reconciliation", { _recon_id: recon.id });
    if (error) {
      toast.error(plainError(error.message));
      return;
    }
    toast.success("Reopened");
    await load();
    onSaved();
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  const diffPill = (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tone === "ok" && "bg-emerald-100 text-emerald-800",
        tone === "warn" && "bg-amber-100 text-amber-800",
        tone === "bad" && "bg-rose-100 text-rose-800",
      )}
    >
      {tone === "ok" ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5" />
      )}
      {variance === 0
        ? "Tallied"
        : `${variance > 0 ? "Excess" : "Short"} ${inr(Math.abs(variance))}`}
    </span>
  );

  const countCard = (
    <section
      className={cn(
        "rounded-2xl border border-border bg-surface overflow-hidden",
        view !== "count" && "hidden lg:block",
      )}
      aria-label="Cash count"
    >
      <div className="px-4 py-2.5 border-b border-border bg-muted/30">
        <div className="font-semibold text-sm">Cash count</div>
        <div className="text-[11px] text-muted-foreground">
          Type how many of each note you have. Rows without a value (like Coins) take a ₹ amount.
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
              <div
                key={d.id}
                className="grid grid-cols-[1fr_96px_104px] gap-2 items-center px-3 py-1.5"
              >
                <div className="font-medium text-sm tabular-nums">
                  {d.value === null ? d.label : `₹${d.value}`}
                  {d.value !== null && d.label !== String(d.value) && (
                    <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                      {d.label}
                    </span>
                  )}
                </div>
                <Input
                  data-nav
                  type="number"
                  inputMode="decimal"
                  value={counts[d.id] ?? ""}
                  onChange={(e) => setCounts((m) => ({ ...m, [d.id]: e.target.value }))}
                  onKeyDown={enterNext}
                  onFocus={(e) => e.currentTarget.select()}
                  disabled={!editable}
                  placeholder={d.value === null ? "₹" : "0"}
                  aria-label={d.value === null ? `${d.label} amount` : `Number of ₹${d.value}`}
                  className="h-10 sm:h-9 text-right tabular-nums"
                />
                <div className="text-right tabular-nums text-sm font-semibold">{inr(sub)}</div>
              </div>
            );
          })}
        </div>
      )}
      <div className="px-4 py-3 border-t border-border bg-muted/20 flex items-center justify-between">
        <span className="text-sm font-semibold">Total cash counted</span>
        <span className="text-lg font-bold tabular-nums">{inr(counted)}</span>
      </div>
    </section>
  );

  const calcCard = (
    <section
      className={cn(
        "rounded-2xl border border-border bg-surface overflow-hidden",
        view !== "calc" && "hidden lg:block",
      )}
      aria-label="Calculation"
    >
      <div className="px-4 py-2.5 border-b border-border bg-muted/30">
        <div className="font-semibold text-sm">Calculation</div>
        <div className="text-[11px] text-muted-foreground">
          What should be in the drawer. Auto lines fill in themselves and are kept once the day is
          finalised.
        </div>
      </div>
      {lines.length === 0 && extras.length === 0 ? (
        <div className="p-6 text-center text-muted-foreground text-sm">
          No lines set up for {sectionLabel} yet. You can add lines for today below, or set them up
          in Cash reconciliation setup.
        </div>
      ) : (
        <div className="divide-y">
          {lines.map((l) => {
            const isAuto = l.source !== "manual";
            const note = notes[l.id] ?? "";
            const showNote = !isAuto && (openNotes[l.id] || note);
            return (
              <div key={l.id} className="px-3 py-2">
                <div className="grid grid-cols-[1fr_120px] gap-2 items-center">
                  <div className="flex items-center gap-2 min-w-0">
                    <SignBadge sign={l.sign} />
                    <span className="truncate text-sm font-medium">{l.label}</span>
                    {isAuto && (
                      <Badge variant="secondary" className="text-[9px] h-4 px-1 shrink-0">
                        auto
                      </Badge>
                    )}
                    {!isAuto && editable && !showNote && (
                      <button
                        type="button"
                        onClick={() => setOpenNotes((o) => ({ ...o, [l.id]: true }))}
                        className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline shrink-0"
                      >
                        + note
                      </button>
                    )}
                  </div>
                  {isAuto ? (
                    <div className="text-right tabular-nums text-sm font-semibold px-2 py-1.5 bg-muted/40 rounded">
                      {inr(lineValue(l))}
                    </div>
                  ) : (
                    <Input
                      data-nav
                      type="number"
                      inputMode="decimal"
                      value={manualValues[l.id] ?? ""}
                      onChange={(e) => setManualValues((m) => ({ ...m, [l.id]: e.target.value }))}
                      onKeyDown={enterNext}
                      onFocus={(e) => e.currentTarget.select()}
                      disabled={!editable}
                      placeholder="0"
                      aria-label={l.label}
                      className="h-10 sm:h-9 text-right tabular-nums"
                    />
                  )}
                </div>
                {showNote && (
                  <Input
                    value={note}
                    onChange={(e) => setNotes((m) => ({ ...m, [l.id]: e.target.value }))}
                    disabled={!editable}
                    placeholder="Note (optional)"
                    aria-label={`Note for ${l.label}`}
                    className="h-8 text-xs mt-1.5"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="border-t border-border">
        <div className="px-4 py-2 bg-muted/20 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Only for today
          </div>
          {extras.length > 0 && (
            <div className="text-xs tabular-nums text-muted-foreground">
              {extrasTotal >= 0 ? "+" : "−"}
              {inr(Math.abs(extrasTotal))}
            </div>
          )}
        </div>
        {extras.length > 0 && (
          <ul className="divide-y">
            {extras.map((x, i) => (
              <li key={i} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <SignBadge sign={x.sign} />
                  <span className="truncate text-sm font-medium">{x.label}</span>
                  <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0">
                    today
                  </Badge>
                </div>
                <span className="tabular-nums text-sm font-semibold">{inr(num(x.amount))}</span>
                {editable ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setExtras((arr) => arr.filter((_, j) => j !== i))}
                    aria-label={`Remove ${x.label}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                ) : (
                  <span className="w-8" />
                )}
              </li>
            ))}
          </ul>
        )}
        {editable ? (
          <div className="px-3 py-3 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                ref={xNameRef}
                value={xName}
                maxLength={40}
                onChange={(e) => setXName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    xAmtRef.current?.focus();
                  }
                }}
                placeholder="Add a line, e.g. Thangapandi"
                aria-label="New line name"
                className="h-10 sm:h-9 flex-1 min-w-[150px]"
              />
              <div
                className="flex rounded-md border border-border overflow-hidden shrink-0"
                role="group"
                aria-label="Add or subtract"
              >
                {(["add", "subtract"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setXSign(s)}
                    aria-pressed={xSign === s}
                    aria-label={s === "add" ? "Plus" : "Minus"}
                    className={cn(
                      "h-10 sm:h-9 w-10 flex items-center justify-center",
                      xSign === s
                        ? s === "add"
                          ? "bg-emerald-600 text-white"
                          : "bg-rose-600 text-white"
                        : "bg-surface text-muted-foreground",
                    )}
                  >
                    {s === "add" ? <Plus className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                  </button>
                ))}
              </div>
              <Input
                ref={xAmtRef}
                type="number"
                inputMode="decimal"
                value={xAmt}
                onChange={(e) => setXAmt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addExtra();
                  }
                }}
                placeholder="₹"
                aria-label="New line amount"
                className="h-10 sm:h-9 w-24 text-right tabular-nums"
              />
              <Button
                variant="secondary"
                className="h-10 sm:h-9"
                onClick={addExtra}
                disabled={!xName.trim() || !(num(xAmt) > 0)}
              >
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Counts for this day only and is saved with Save draft. Your setup is not changed.
            </p>
          </div>
        ) : (
          extras.length === 0 && (
            <div className="px-4 py-3 text-xs text-muted-foreground">No extra lines today.</div>
          )
        )}
      </div>

      <div className="px-4 py-3 border-t border-border bg-muted/20 flex items-center justify-between">
        <span className="text-sm font-semibold">Cash that should be in the drawer</span>
        <span className="text-lg font-bold tabular-nums">{inr(expected)}</span>
      </div>
    </section>
  );

  return (
    <div ref={rootRef} className="space-y-4 pb-40 md:pb-28">
      <div className="flex flex-wrap items-center gap-2">
        {isFinalised ? (
          <Badge className="bg-emerald-600 hover:bg-emerald-700">
            <Lock className="h-3 w-3 mr-1" /> {sectionLabel} closed
          </Badge>
        ) : (
          <Badge variant="outline">{sectionLabel} · draft</Badge>
        )}
        {diffPill}
        {isFinalised && canReopen && !locked && (
          <Button size="sm" variant="outline" onClick={reopen} className="h-7">
            <Unlock className="h-3 w-3 mr-1" /> Reopen
          </Button>
        )}
        {locked && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Lock className="h-3 w-3" /> Locked: the day is checked
          </span>
        )}
      </div>

      <div
        className="lg:hidden grid grid-cols-2 rounded-xl border border-border p-1 bg-muted/40"
        role="tablist"
      >
        {(
          [
            ["count", `Cash count · ${inr(counted)}`],
            ["calc", `Calculation · ${inr(expected)}`],
          ] as const
        ).map(([k, text]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={view === k}
            onClick={() => setView(k)}
            className={cn(
              "h-10 rounded-lg text-xs font-semibold tabular-nums transition-colors",
              view === k ? "bg-surface shadow-sm text-foreground" : "text-muted-foreground",
            )}
          >
            {text}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        {countCard}
        {calcCard}
      </div>

      <div
        className={cn(
          "fixed inset-x-0 z-30 px-3 pointer-events-none md:pr-6 md:pl-[calc(14rem+1.5rem)]",
          "bottom-[calc(68px+env(safe-area-inset-bottom))] md:bottom-3",
        )}
      >
        <div className="pointer-events-auto mx-auto max-w-6xl rounded-2xl border border-border bg-surface/95 backdrop-blur shadow-lg p-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="grid grid-cols-3 gap-3 flex-1 min-w-[260px]">
              <Stat label="Should be" value={inr(expected)} />
              <Stat label="Counted" value={inr(counted)} />
              <Stat
                label={variance === 0 ? "Tally" : variance > 0 ? "Excess" : "Short"}
                value={variance === 0 ? "✓" : inr(Math.abs(variance))}
                tone={tone}
              />
            </div>
            <div className="flex items-center gap-2 ml-auto">
              {dirty && editable && <span className="text-xs text-amber-700">Unsaved</span>}
              {editable ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => save(false)}
                    disabled={saving || (!dirty && !!recon)}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-1" />
                    )}
                    Save draft
                  </Button>
                  {canFinalise && (
                    <Button onClick={() => setConfirmFinalise(true)} disabled={saving}>
                      <Lock className="h-4 w-4 mr-1" /> Close {sectionLabel}
                    </Button>
                  )}
                </>
              ) : (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Lock className="h-3.5 w-3.5" />
                  {locked ? "Locked: day is checked" : "Closed"}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={confirmFinalise} onOpenChange={setConfirmFinalise}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close {sectionLabel} for the day?</AlertDialogTitle>
            <AlertDialogDescription>
              {businessDate} · Should be {inr(expected)} · Counted {inr(counted)} ·{" "}
              <strong>
                {variance === 0
                  ? "Tallied"
                  : `${variance > 0 ? "Excess" : "Short"} ${inr(Math.abs(variance))}`}
              </strong>
              . Once closed this cash point is locked; a manager can reopen it until the day is
              checked.
              {variance !== 0 && " The day cannot be checked until it tallies."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => save(true)}>Close {sectionLabel}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SignBadge({ sign }: { sign: "add" | "subtract" }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-5 w-5 justify-center p-0 text-[11px] font-bold shrink-0",
        sign === "add" ? "border-emerald-300 text-emerald-700" : "border-rose-300 text-rose-700",
      )}
    >
      {sign === "add" ? "+" : "−"}
    </Badge>
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
