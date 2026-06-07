import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Plus, Pencil, Trash2, Upload, GripVertical, X } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { uploadMenuImage } from "@/lib/menu-storage";
import { MenuImage } from "./MenuImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

export interface Category {
  id: string;
  restaurant_id: string;
  name: string;
  image_url: string | null;
  display_order: number;
  is_active: boolean;
}

export function CategoriesPanel() {
  const { profile } = useAuth();
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Category | null>(null);
  const dragId = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await db
      .from("categories")
      .select("*")
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    else setItems(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function persistOrder(next: Category[]) {
    setItems(next);
    const updates = next.map((c, i) => ({ id: c.id, display_order: i }));
    // bulk update by individual calls (small N)
    for (const u of updates) {
      await db.from("categories").update({ display_order: u.display_order }).eq("id", u.id);
    }
  }

  function onDragStart(id: string) {
    dragId.current = id;
  }
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
  }
  function onDrop(targetId: string) {
    const src = dragId.current;
    dragId.current = null;
    if (!src || src === targetId) return;
    const arr = [...items];
    const from = arr.findIndex((c) => c.id === src);
    const to = arr.findIndex((c) => c.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    persistOrder(arr);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          Drag cards to reorder. Tap to edit.
        </p>
        <Button onClick={() => setCreating(true)} className="min-h-[44px]">
          <Plus className="h-4 w-4 mr-2" />
          New category
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
          No categories yet. Create your first one.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {items.map((c) => (
            <button
              key={c.id}
              draggable
              onDragStart={() => onDragStart(c.id)}
              onDragOver={onDragOver}
              onDrop={() => onDrop(c.id)}
              onClick={() => setEditing(c)}
              className="group relative text-left rounded-2xl border border-border bg-surface overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              <MenuImage path={c.image_url} alt={c.name} className="aspect-[4/3] w-full" />
              <div className="absolute top-2 left-2 bg-surface/80 backdrop-blur rounded-md px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="p-3 flex items-center justify-between gap-2">
                <div className="font-medium truncate">{c.name}</div>
                <div className="flex gap-1 shrink-0">
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(c);
                    }}
                    className="p-1.5 rounded hover:bg-accent"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDel(c);
                    }}
                    className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {(creating || editing) && profile && (
        <CategoryEditor
          restaurantId={profile.restaurant_id}
          existing={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            load();
          }}
          nextOrder={items.length}
        />
      )}

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription>
              Items in “{confirmDel?.name}” will become uncategorised.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirmDel) return;
                const { error } = await db.from("categories").delete().eq("id", confirmDel.id);
                if (error) toast.error(error.message);
                else {
                  toast.success("Deleted");
                  load();
                }
                setConfirmDel(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CategoryEditor({
  restaurantId,
  existing,
  onClose,
  onSaved,
  nextOrder,
}: {
  restaurantId: string;
  existing: Category | null;
  onClose: () => void;
  onSaved: () => void;
  nextOrder: number;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [imagePath, setImagePath] = useState<string | null>(existing?.image_url ?? null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const path = await uploadMenuImage(
        restaurantId,
        "category",
        existing?.id ?? crypto.randomUUID(),
        f,
      );
      setImagePath(path);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function save() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    if (existing) {
      const { error } = await db
        .from("categories")
        .update({ name: name.trim(), image_url: imagePath })
        .eq("id", existing.id);
      if (error) toast.error(error.message);
      else {
        toast.success("Saved");
        onSaved();
      }
    } else {
      const { error } = await db.from("categories").insert({
        restaurant_id: restaurantId,
        name: name.trim(),
        image_url: imagePath,
        display_order: nextOrder,
      });
      if (error) toast.error(error.message);
      else {
        toast.success("Created");
        onSaved();
      }
    }
    setSaving(false);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit category" : "New category"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-20 w-20 rounded-xl border border-border overflow-hidden">
              <MenuImage path={imagePath} alt={name} className="h-full w-full" />
            </div>
            <div className="flex flex-col gap-2">
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-surface hover:bg-accent cursor-pointer text-sm font-medium">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                <span>{uploading ? "Uploading…" : imagePath ? "Replace image" : "Upload image"}</span>
                <input type="file" accept="image/*" className="hidden" onChange={onPick} disabled={uploading} />
              </label>
              {imagePath && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setImagePath(null)}
                  className="self-start text-muted-foreground"
                >
                  <X className="h-3.5 w-3.5 mr-1" /> Remove
                </Button>
              )}
            </div>
          </div>
          <div>
            <Label className="block mb-1.5">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
