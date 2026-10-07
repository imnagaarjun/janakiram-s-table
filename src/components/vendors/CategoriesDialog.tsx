import { useState } from "react";
import { Check, Loader2, Pencil, Plus, Tag, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { ReorderControls, moved, swapped } from "./reorder";
import { createCategory, type ExpenseCategory } from "./CategorySelect";

export type CategoryUsage = Record<string, { vendors: number; products: number }>;

// The owner's list of expense categories. Only the admin gets here.
export function CategoriesDialog({
  restaurantId,
  cats,
  usage,
  onClose,
  onChanged,
}: {
  restaurantId: string;
  cats: ExpenseCategory[];
  usage: CategoryUsage;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<ExpenseCategory | null>(null);

  async function add() {
    if (!newName.trim() || adding) return;
    setAdding(true);
    const c = await createCategory(restaurantId, cats, newName);
    setAdding(false);
    if (c) {
      setNewName("");
      onChanged();
    }
  }

  async function rename(c: ExpenseCategory) {
    const name = editText.trim().replace(/\s+/g, " ");
    setEditId(null);
    if (!name || name === c.name) return;
    if (cats.some((x) => x.id !== c.id && x.name.toLowerCase() === name.toLowerCase())) {
      toast.error(`“${name}” already exists`);
      return;
    }
    const { error } = await db.from("expense_categories").update({ name }).eq("id", c.id);
    if (error) toast.error(error.message);
    else onChanged();
  }

  async function setActive(c: ExpenseCategory, v: boolean) {
    const { error } = await db.from("expense_categories").update({ is_active: v }).eq("id", c.id);
    if (error) toast.error(error.message);
    else onChanged();
  }

  async function persistOrder(next: ExpenseCategory[]) {
    const changed = next.filter((c, i) => c.display_order !== i);
    if (changed.length === 0) return;
    const results = await Promise.all(
      changed.map((c) =>
        db
          .from("expense_categories")
          .update({ display_order: next.findIndex((x) => x.id === c.id) })
          .eq("id", c.id),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed) toast.error(failed.error.message);
    onChanged();
  }

  // Never delete a category that history points to: it would blank the category on old
  // purchases. Those are switched off instead (hidden from pickers, still shown on old data).
  async function remove(c: ExpenseCategory) {
    const u = usage[c.id] ?? { vendors: 0, products: 0 };
    const { count, error } = await db
      .from("purchase_lines")
      .select("id", { count: "exact", head: true })
      .eq("category_id", c.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (u.vendors + u.products > 0 || (count ?? 0) > 0) {
      await setActive(c, false);
      toast.success(`“${c.name}” is in use, so it was switched off instead of deleted.`);
    } else {
      const { error: e2 } = await db.from("expense_categories").delete().eq("id", c.id);
      if (e2) toast.error(e2.message);
      else {
        toast.success("Category deleted");
        onChanged();
      }
    }
    setConfirmDel(null);
  }

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-4 w-4" /> Categories
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">
            Group vendors and products for your reports. You pick a category on each vendor (and
            optionally on a product). Only the admin can change this list.
          </p>

          <div className="flex gap-2">
            <Input
              value={newName}
              maxLength={40}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="New category, e.g. Meat, Vegetables, Gas"
              aria-label="New category name"
              className="h-11 sm:h-9"
            />
            <Button onClick={add} disabled={!newName.trim() || adding} className="h-11 sm:h-9">
              {adding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-1" />
              )}
              Add
            </Button>
          </div>

          {cats.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No categories yet. Add the first one above.
            </div>
          ) : (
            <div className="space-y-2">
              {cats.map((c, i) => {
                const u = usage[c.id] ?? { vendors: 0, products: 0 };
                return (
                  <div
                    key={c.id}
                    onDragOver={(e) => {
                      if (dragId) {
                        e.preventDefault();
                        setOverId(c.id);
                      }
                    }}
                    onDrop={() => {
                      if (dragId) persistOrder(moved(cats, dragId, c.id));
                      setDragId(null);
                      setOverId(null);
                    }}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border border-border bg-surface px-2 py-2",
                      !c.is_active && "opacity-60",
                      overId === c.id && dragId && dragId !== c.id && "ring-2 ring-primary/60",
                      dragId === c.id && "opacity-40",
                    )}
                  >
                    <ReorderControls
                      canUp={i > 0}
                      canDown={i < cats.length - 1}
                      onUp={() => persistOrder(swapped(cats, i, i - 1))}
                      onDown={() => persistOrder(swapped(cats, i, i + 1))}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        setDragId(c.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverId(null);
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      {editId === c.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            autoFocus
                            value={editText}
                            maxLength={40}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") rename(c);
                              if (e.key === "Escape") setEditId(null);
                            }}
                            aria-label={`Rename ${c.name}`}
                            className="h-9"
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9"
                            onClick={() => rename(c)}
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
                        <>
                          <div className="font-medium truncate flex items-center gap-2">
                            {c.name}
                            {!c.is_active && (
                              <span className="rounded-full bg-muted px-2 py-px text-[10px] font-medium text-muted-foreground">
                                off
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {u.vendors} {u.vendors === 1 ? "vendor" : "vendors"} · {u.products}{" "}
                            {u.products === 1 ? "product" : "products"}
                          </div>
                        </>
                      )}
                    </div>
                    {editId !== c.id && (
                      <>
                        <Switch
                          checked={c.is_active}
                          onCheckedChange={(v) => setActive(c, v)}
                          aria-label={`${c.name} active`}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9"
                          onClick={() => {
                            setEditId(c.id);
                            setEditText(c.name);
                          }}
                          aria-label={`Rename ${c.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 text-destructive hover:text-destructive"
                          onClick={() => setConfirmDel(c)}
                          aria-label={`Delete ${c.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirmDel?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              If vendors, products or past purchases use it, it is switched off instead of deleted,
              so your old reports keep their category.
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
    </>
  );
}
