import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { cn } from "@/lib/utils";

interface CashPoint {
  id: string;
  key: string;
  label: string | null;
  display_order: number;
  is_active: boolean;
}

const name = (c: CashPoint) => c.label ?? c.key;

// A permanent id for the cash point, made from its name. The name can be changed later; this can't.
function makeKey(label: string, taken: Set<string>) {
  const base = label.trim().replace(/\s+/g, " ");
  let k = base;
  for (let i = 2; taken.has(k.toLowerCase()); i++) k = `${base} ${i}`;
  return k;
}

export function CashPointsEditor() {
  const { profile } = useAuth();
  const [points, setPoints] = useState<CashPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [copyFrom, setCopyFrom] = useState("__none");
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [confirmDel, setConfirmDel] = useState<CashPoint | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await db.from("cash_sections").select("*").order("display_order");
    if (error) toast.error(error.message);
    setPoints((data ?? []) as CashPoint[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    const label = newName.trim().replace(/\s+/g, " ");
    if (!label || !profile || adding) return;
    if (points.some((p) => name(p).toLowerCase() === label.toLowerCase())) {
      toast.error(`“${label}” already exists`);
      return;
    }
    setAdding(true);
    const key = makeKey(label, new Set(points.map((p) => p.key.toLowerCase())));
    const { error } = await db.from("cash_sections").insert({
      restaurant_id: profile.restaurant_id,
      key,
      label,
      display_order: Math.max(0, ...points.map((p) => p.display_order)) + 1,
      is_active: true,
    });
    if (error) {
      setAdding(false);
      toast.error(error.message);
      return;
    }
    if (copyFrom !== "__none") {
      const { data: src } = await db
        .from("cashflow_lines")
        .select("label,sign,source,display_order,is_active")
        .eq("section_key", copyFrom)
        .order("display_order");
      if (src && src.length > 0) {
        const { error: e2 } = await db
          .from("cashflow_lines")
          .insert(
            src.map((l: Record<string, unknown>) => ({
              ...l,
              restaurant_id: profile.restaurant_id,
              section_key: key,
            })),
          );
        if (e2) toast.error(`Cash point added, but copying lines failed: ${e2.message}`);
      }
    }
    setAdding(false);
    setNewName("");
    setCopyFrom("__none");
    toast.success(`“${label}” added`);
    load();
  }

  async function rename(p: CashPoint) {
    const label = editText.trim().replace(/\s+/g, " ");
    setEditId(null);
    if (!label || label === name(p)) return;
    if (points.some((x) => x.id !== p.id && name(x).toLowerCase() === label.toLowerCase())) {
      toast.error(`“${label}” already exists`);
      return;
    }
    const { error } = await db.from("cash_sections").update({ label }).eq("id", p.id);
    if (error) toast.error(error.message);
    else load();
  }

  async function setActive(p: CashPoint, v: boolean) {
    if (!v && points.filter((x) => x.is_active && x.id !== p.id).length === 0) {
      toast.error("Keep at least one cash point on");
      return;
    }
    const { error } = await db.from("cash_sections").update({ is_active: v }).eq("id", p.id);
    if (error) toast.error(error.message);
    else load();
  }

  async function move(i: number, dir: -1 | 1) {
    const a = points[i];
    const b = points[i + dir];
    if (!b) return;
    // Renumber so equal orders can never make the swap a no-op.
    const next = [...points];
    next[i] = b;
    next[i + dir] = a;
    const res = await Promise.all(
      next
        .map((p, idx) => ({ p, idx }))
        .filter(({ p, idx }) => p.display_order !== idx + 1)
        .map(({ p, idx }) =>
          db
            .from("cash_sections")
            .update({ display_order: idx + 1 })
            .eq("id", p.id),
        ),
    );
    const failed = res.find((r) => r.error);
    if (failed?.error) toast.error(failed.error.message);
    load();
  }

  // A cash point that has history is switched off, never deleted: old days still refer to it.
  async function remove(p: CashPoint) {
    const [{ count: days, error: e1 }, { count: vendors, error: e2 }] = await Promise.all([
      db
        .from("cash_reconciliations")
        .select("id", { count: "exact", head: true })
        .eq("section_key", p.key),
      db.from("vendors").select("id", { count: "exact", head: true }).eq("cash_section_key", p.key),
    ]);
    if (e1 || e2) {
      toast.error((e1 ?? e2)!.message);
      return;
    }
    if ((days ?? 0) > 0 || (vendors ?? 0) > 0) {
      await setActive(p, false);
      toast.success(
        `“${name(p)}” has ${days ? "closed days" : "vendors"} linked, so it was switched off instead of deleted.`,
      );
    } else {
      if (points.filter((x) => x.id !== p.id && x.is_active).length === 0) {
        toast.error("Keep at least one cash point");
        setConfirmDel(null);
        return;
      }
      const { error: eL } = await db.from("cashflow_lines").delete().eq("section_key", p.key);
      const { error } = eL ? { error: eL } : await db.from("cash_sections").delete().eq("id", p.id);
      if (error) toast.error(error.message);
      else toast.success("Cash point deleted");
      load();
    }
    setConfirmDel(null);
  }

  const defaultId = points.find((p) => p.is_active)?.id;

  if (loading)
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-xs text-muted-foreground">
        A cash point is a drawer you count and close each day, for example AC, Non-AC or Takeaway.
        Add as many as you need. Each has its own lines on the next tab.
      </p>

      <div className="rounded-2xl border border-border bg-surface p-3 space-y-2">
        <Label className="text-xs">New cash point</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            value={newName}
            maxLength={30}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="e.g. Parcel counter"
            aria-label="New cash point name"
            className="h-10 flex-1 min-w-[180px]"
          />
          {points.length > 0 && (
            <Select value={copyFrom} onValueChange={setCopyFrom}>
              <SelectTrigger className="h-10 w-[200px]" aria-label="Copy lines from">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Start with no lines</SelectItem>
                {points.map((p) => (
                  <SelectItem key={p.id} value={p.key}>
                    Copy lines from {name(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={add} disabled={!newName.trim() || adding} className="h-10">
            {adding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-1" />
            )}
            Add
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {points.map((p, i) => (
          <div
            key={p.id}
            className={cn(
              "flex items-center gap-2 rounded-xl border border-border bg-surface px-2 py-2",
              !p.is_active && "opacity-60",
            )}
          >
            <div className="flex flex-col">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-7"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                aria-label={`Move ${name(p)} up`}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-7"
                disabled={i === points.length - 1}
                onClick={() => move(i, 1)}
                aria-label={`Move ${name(p)} down`}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex-1 min-w-0">
              {editId === p.id ? (
                <div className="flex items-center gap-1">
                  <Input
                    autoFocus
                    value={editText}
                    maxLength={30}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") rename(p);
                      if (e.key === "Escape") setEditId(null);
                    }}
                    aria-label={`Rename ${name(p)}`}
                    className="h-9"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9"
                    onClick={() => rename(p)}
                    aria-label="Save name"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9"
                    onClick={() => setEditId(null)}
                    aria-label="Cancel"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="font-medium truncate flex items-center gap-2">
                  {name(p)}
                  {p.id === defaultId && (
                    <span className="rounded-full bg-primary/10 text-primary px-2 py-px text-[10px] font-medium">
                      default
                    </span>
                  )}
                  {!p.is_active && (
                    <span className="rounded-full bg-muted px-2 py-px text-[10px] font-medium text-muted-foreground">
                      off
                    </span>
                  )}
                </div>
              )}
            </div>
            {editId !== p.id && (
              <>
                <Switch
                  checked={p.is_active}
                  onCheckedChange={(v) => setActive(p, v)}
                  aria-label={`${name(p)} active`}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9"
                  onClick={() => {
                    setEditId(p.id);
                    setEditText(name(p));
                  }}
                  aria-label={`Rename ${name(p)}`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 text-destructive hover:text-destructive"
                  onClick={() => setConfirmDel(p)}
                  aria-label={`Delete ${name(p)}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        The first active cash point is the default: cash paid to vendors with no cash point chosen
        is deducted there.
      </p>

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirmDel ? name(confirmDel) : ""}”?</AlertDialogTitle>
            <AlertDialogDescription>
              If it has closed days or vendors linked, it is switched off instead of deleted so your
              past records stay intact. Otherwise it and its lines are removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDel && remove(confirmDel)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
