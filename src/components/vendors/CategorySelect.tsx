import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface ExpenseCategory {
  id: string;
  name: string;
  display_order: number;
  is_active: boolean;
}

// Creates a category (admin only). Returns the new row, or an existing one with the same name.
export async function createCategory(
  restaurantId: string,
  cats: ExpenseCategory[],
  rawName: string,
): Promise<ExpenseCategory | null> {
  const name = rawName.trim().replace(/\s+/g, " ");
  if (!name) return null;
  const dup = cats.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (dup) {
    if (!dup.is_active)
      toast.message(`“${dup.name}” exists but is switched off. Turn it on in Categories.`);
    return dup;
  }
  const { data, error } = await db
    .from("expense_categories")
    .insert({
      restaurant_id: restaurantId,
      name,
      display_order: Math.max(-1, ...cats.map((c) => c.display_order)) + 1,
      is_active: true,
    })
    .select("*")
    .single();
  if (error) {
    toast.error(error.message.includes("duplicate") ? `“${name}” already exists` : error.message);
    return null;
  }
  return data as ExpenseCategory;
}

// Category dropdown. Active categories only (plus the one already chosen). Admins also get a
// "+ New category…" entry that creates the category on the spot and selects it.
export function CategorySelect({
  value,
  onChange,
  cats,
  canCreate,
  restaurantId,
  onCreated,
  placeholder = "Select",
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  cats: ExpenseCategory[];
  canCreate?: boolean;
  restaurantId?: string;
  onCreated?: (c: ExpenseCategory) => void;
  placeholder?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const options = cats.filter((c) => c.is_active || c.id === value);

  async function commit() {
    if (!restaurantId || busy) return;
    setBusy(true);
    const c = await createCategory(restaurantId, cats, text);
    setBusy(false);
    if (!c) return;
    onCreated?.(c);
    onChange(c.id);
    setText("");
    setAdding(false);
  }

  return (
    <div>
      <Select
        value={value ?? "__none"}
        onValueChange={(v) => {
          if (v === "__new") setAdding(true);
          else {
            setAdding(false);
            onChange(v === "__none" ? null : v);
          }
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">— None —</SelectItem>
          {options.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
              {!c.is_active && " (off)"}
            </SelectItem>
          ))}
          {canCreate && (
            <SelectItem value="__new" className="text-primary font-medium">
              <span className="inline-flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" /> New category…
              </span>
            </SelectItem>
          )}
        </SelectContent>
      </Select>
      {adding && (
        <div className="flex gap-2 mt-2">
          <Input
            autoFocus
            value={text}
            maxLength={40}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                commit();
              } else if (e.key === "Escape") {
                e.stopPropagation();
                setAdding(false);
              }
            }}
            placeholder="New category name"
            aria-label="New category name"
          />
          <Button type="button" size="sm" onClick={commit} disabled={!text.trim() || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
          </Button>
        </div>
      )}
    </div>
  );
}
