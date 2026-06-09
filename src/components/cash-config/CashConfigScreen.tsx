import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Save,
  GripVertical,
  Plus as PlusIcon,
  Minus,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Sign = "add" | "subtract";
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
  sign: Sign;
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

const SOURCE_LABELS: Record<Source, string> = {
  manual: "Manual (cashier types)",
  auto_sales: "Auto · Section Sales",
  auto_gpay: "Auto · GPay",
  auto_card: "Auto · Card",
  auto_swiggy: "Auto · Swiggy",
  auto_cash_expense: "Auto · Cash Expense",
};

export function CashConfigScreen() {
  return (
    <Tabs defaultValue="cashflow">
      <TabsList className="mb-4">
        <TabsTrigger value="cashflow">Cash-flow template</TabsTrigger>
        <TabsTrigger value="denominations">Denominations</TabsTrigger>
      </TabsList>
      <TabsContent value="cashflow" className="mt-0">
        <CashflowTemplateEditor />
      </TabsContent>
      <TabsContent value="denominations" className="mt-0">
        <DenominationsEditor />
      </TabsContent>
    </Tabs>
  );
}

function CashflowTemplateEditor() {
  const { profile } = useAuth();
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionKey, setSectionKey] = useState<string>("");
  const [lines, setLines] = useState<CashflowLine[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, l] = await Promise.all([
      db
        .from("cash_sections")
        .select("*")
        .eq("is_active", true)
        .order("display_order"),
      db.from("cashflow_lines").select("*").order("display_order"),
    ]);
    setSections(s.data ?? []);
    setLines(l.data ?? []);
    if (!sectionKey && (s.data ?? []).length > 0) setSectionKey(s.data[0].key);
    setLoading(false);
  }, [sectionKey]);

  useEffect(() => {
    load();
  }, [load]);

  const sectionLines = lines
    .filter((l) => l.section_key === sectionKey)
    .sort((a, b) => a.display_order - b.display_order);

  async function addLine() {
    if (!profile || !sectionKey) return;
    const nextOrder = sectionLines.length + 1;
    const { error } = await db.from("cashflow_lines").insert({
      restaurant_id: profile.restaurant_id,
      section_key: sectionKey,
      label: "New line",
      sign: "add",
      source: "manual",
      display_order: nextOrder,
      is_active: true,
    });
    if (error) toast.error(error.message);
    else load();
  }

  async function updateLine(id: string, patch: Partial<CashflowLine>) {
    setLines((arr) => arr.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    const { error } = await db.from("cashflow_lines").update(patch).eq("id", id);
    if (error) {
      toast.error(error.message);
      load();
    }
  }

  async function deleteLine(id: string) {
    // Check usage in cash_recon_values
    const { count, error: cErr } = await db
      .from("cash_recon_values")
      .select("id", { count: "exact", head: true })
      .eq("cashflow_line_id", id);
    if (cErr) {
      toast.error(cErr.message);
      return;
    }
    if ((count ?? 0) > 0) {
      const { error } = await db
        .from("cashflow_lines")
        .update({ is_active: false })
        .eq("id", id);
      if (error) toast.error(error.message);
      else {
        toast.success("Line has reconciliation history — deactivated instead.");
        load();
      }
    } else {
      const { error } = await db.from("cashflow_lines").delete().eq("id", id);
      if (error) toast.error(error.message);
      else {
        toast.success("Deleted");
        load();
      }
    }
  }

  async function move(id: string, dir: -1 | 1) {
    const idx = sectionLines.findIndex((l) => l.id === id);
    const swap = sectionLines[idx + dir];
    if (!swap) return;
    const a = sectionLines[idx];
    await Promise.all([
      db.from("cashflow_lines").update({ display_order: swap.display_order }).eq("id", a.id),
      db.from("cashflow_lines").update({ display_order: a.display_order }).eq("id", swap.id),
    ]);
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
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex-1 min-w-[240px]">
          <Label className="block text-xs mb-1">Section</Label>
          <Select value={sectionKey} onValueChange={setSectionKey}>
            <SelectTrigger className="w-full sm:w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sections.map((s) => (
                <SelectItem key={s.id} value={s.key}>
                  {s.key}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={addLine} className="min-h-[40px]">
          <Plus className="h-4 w-4 mr-2" /> Add line
        </Button>
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        Order the lines as they should appear on the daily reconciliation. Auto sources are filled
        from sales/payments; Manual lines are typed by the cashier each day.
      </p>

      {sectionLines.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
          No lines for {sectionKey}. Add the first one.
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface divide-y overflow-hidden">
          {sectionLines.map((l, idx) => (
            <div key={l.id} className="grid grid-cols-12 gap-2 items-center p-2.5">
              <div className="col-span-12 sm:col-span-1 flex items-center gap-0.5">
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground hidden sm:inline" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={idx === 0}
                  onClick={() => move(l.id, -1)}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={idx === sectionLines.length - 1}
                  onClick={() => move(l.id, 1)}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="col-span-6 sm:col-span-4">
                <Input
                  value={l.label}
                  onChange={(e) =>
                    setLines((arr) =>
                      arr.map((x) => (x.id === l.id ? { ...x, label: e.target.value } : x)),
                    )
                  }
                  onBlur={(e) =>
                    e.target.value !== l.label
                      ? updateLine(l.id, { label: e.target.value.trim() || "Line" })
                      : undefined
                  }
                  className="h-9"
                />
              </div>
              <div className="col-span-3 sm:col-span-2">
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant={l.sign === "add" ? "default" : "outline"}
                    className={cn(
                      "flex-1 h-9 px-2",
                      l.sign === "add" && "bg-emerald-600 hover:bg-emerald-700",
                    )}
                    onClick={() => updateLine(l.id, { sign: "add" })}
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant={l.sign === "subtract" ? "default" : "outline"}
                    className={cn(
                      "flex-1 h-9 px-2",
                      l.sign === "subtract" && "bg-rose-600 hover:bg-rose-700",
                    )}
                    onClick={() => updateLine(l.id, { sign: "subtract" })}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="col-span-3 sm:col-span-3">
                <Select
                  value={l.source}
                  onValueChange={(v) => updateLine(l.id, { source: v as Source })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SOURCE_LABELS) as Source[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {SOURCE_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-6 sm:col-span-1 flex items-center gap-1.5">
                <Switch
                  checked={l.is_active}
                  onCheckedChange={(c) => updateLine(l.id, { is_active: c })}
                />
                <span className="text-[10px] text-muted-foreground sm:hidden">active</span>
              </div>
              <div className="col-span-6 sm:col-span-1 flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteLine(l.id)}
                  className="text-destructive hover:text-destructive h-9 w-9"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {!l.is_active && (
                <div className="col-span-12">
                  <Badge variant="outline" className="text-[10px]">
                    inactive — hidden from daily screen
                  </Badge>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DenominationsEditor() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Denomination[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({ label: "", value: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await db
      .from("denomination_config")
      .select("*")
      .order("display_order");
    if (error) toast.error(error.message);
    setRows(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addRow() {
    if (!profile) return;
    const label = draft.label.trim();
    if (!label) {
      toast.error("Label is required");
      return;
    }
    const value = draft.value.trim() === "" ? null : parseFloat(draft.value);
    if (value !== null && (!isFinite(value) || value < 0)) {
      toast.error("Value must be a positive number");
      return;
    }
    const nextOrder = rows.length + 1;
    const { error } = await db.from("denomination_config").insert({
      restaurant_id: profile.restaurant_id,
      label,
      value,
      display_order: nextOrder,
      is_active: true,
    });
    if (error) toast.error(error.message);
    else {
      setDraft({ label: "", value: "" });
      load();
    }
  }

  async function update(id: string, patch: Partial<Denomination>) {
    setRows((arr) => arr.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await db.from("denomination_config").update(patch).eq("id", id);
    if (error) {
      toast.error(error.message);
      load();
    }
  }

  async function move(id: string, dir: -1 | 1) {
    const idx = rows.findIndex((r) => r.id === id);
    const swap = rows[idx + dir];
    if (!swap) return;
    const a = rows[idx];
    await Promise.all([
      db.from("denomination_config").update({ display_order: swap.display_order }).eq("id", a.id),
      db.from("denomination_config").update({ display_order: a.display_order }).eq("id", swap.id),
    ]);
    load();
  }

  async function remove(id: string) {
    const { count, error: cErr } = await db
      .from("denomination_counts")
      .select("id", { count: "exact", head: true })
      .eq("denomination_id", id);
    if (cErr) {
      toast.error(cErr.message);
      return;
    }
    if ((count ?? 0) > 0) {
      const { error } = await db
        .from("denomination_config")
        .update({ is_active: false })
        .eq("id", id);
      if (error) toast.error(error.message);
      else {
        toast.success("Has counting history — deactivated instead.");
        load();
      }
    } else {
      const { error } = await db.from("denomination_config").delete().eq("id", id);
      if (error) toast.error(error.message);
      else load();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">
        These rows appear in the cashier's denomination count grid. Leave value blank for free-text
        rows like "Coins" or "Damage".
      </p>

      <div className="rounded-2xl border border-border bg-surface p-3 mb-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Add row
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[140px]">
            <Label className="text-xs">Label</Label>
            <Input
              value={draft.label}
              onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
              placeholder="e.g. 2000"
              className="h-9"
            />
          </div>
          <div className="w-[140px]">
            <Label className="text-xs">Value (₹)</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={draft.value}
              onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
              placeholder="optional"
              className="h-9 text-right"
            />
          </div>
          <Button onClick={addRow} className="h-9">
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface divide-y overflow-hidden">
        {rows.map((r, idx) => (
          <div key={r.id} className="grid grid-cols-12 gap-2 items-center p-2.5">
            <div className="col-span-12 sm:col-span-1 flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={idx === 0}
                onClick={() => move(r.id, -1)}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={idx === rows.length - 1}
                onClick={() => move(r.id, 1)}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="col-span-6 sm:col-span-5">
              <Input
                value={r.label}
                onChange={(e) =>
                  setRows((arr) =>
                    arr.map((x) => (x.id === r.id ? { ...x, label: e.target.value } : x)),
                  )
                }
                onBlur={(e) =>
                  e.target.value !== r.label
                    ? update(r.id, { label: e.target.value.trim() || "Row" })
                    : undefined
                }
                className="h-9"
              />
            </div>
            <div className="col-span-4 sm:col-span-3">
              <Input
                type="number"
                inputMode="decimal"
                value={r.value ?? ""}
                placeholder="—"
                onChange={(e) => {
                  const v = e.target.value;
                  setRows((arr) =>
                    arr.map((x) =>
                      x.id === r.id ? { ...x, value: v === "" ? null : parseFloat(v) } : x,
                    ),
                  );
                }}
                onBlur={(e) => {
                  const v = e.target.value;
                  const next = v === "" ? null : parseFloat(v);
                  if (next !== r.value) update(r.id, { value: next });
                }}
                className="h-9 text-right"
              />
            </div>
            <div className="col-span-1 flex items-center">
              <Switch
                checked={r.is_active}
                onCheckedChange={(c) => update(r.id, { is_active: c })}
              />
            </div>
            <div className="col-span-1 flex justify-end">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => remove(r.id)}
                className="text-destructive hover:text-destructive h-9 w-9"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {!r.is_active && (
              <div className="col-span-12">
                <Badge variant="outline" className="text-[10px]">
                  inactive — hidden from daily count
                </Badge>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
