import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Upload, X, Trash2 } from "lucide-react";
import { syncItemStockPool } from "@/lib/stock-pool.functions";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { uploadMenuImage } from "@/lib/menu-storage";
import { splitInclusive, inr } from "@/lib/gst";
import { MenuImage } from "./MenuImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { Category } from "./CategoriesPanel";
import type { Channel, MenuItem, MenuPrice } from "./ItemsPanel";

interface BaseOption {
  id: string;
  name: string;
}

const DEFAULT_GST = 5;

export function ItemEditor({
  restaurantId,
  existing,
  categories,
  channels,
  existingPrices,
  onClose,
  onSaved,
}: {
  restaurantId: string;
  existing: MenuItem | null;
  categories: Category[];
  channels: Channel[];
  existingPrices: MenuPrice[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(existing?.item_code ?? "");
  const [name, setName] = useState(existing?.name ?? "");
  const [shortName, setShortName] = useState(existing?.kot_short_name ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(existing?.category_id ?? null);
  const [imagePath, setImagePath] = useState<string | null>(existing?.image_url ?? null);
  const [isFavorite, setIsFavorite] = useState(existing?.is_favorite ?? false);
  const [isActive, setIsActive] = useState(existing?.is_active ?? true);
  const [is86, setIs86] = useState(existing?.is_86 ?? false);
  const [stockMode, setStockMode] = useState<"counted" | "unlimited">(
    existing?.stock_mode ?? "unlimited",
  );
  const [benchmark, setBenchmark] = useState<string>(
    existing?.stock_benchmark != null ? String(existing.stock_benchmark) : "",
  );
  const [gstRate, setGstRate] = useState<number>(existing?.gst_rate ?? DEFAULT_GST);
  const [priceMap, setPriceMap] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const ch of channels) {
      const ex = existingPrices.find((p) => p.channel_key === ch.key);
      map[ch.key] = ex ? String(ex.inclusive_price) : "";
    }
    return map;
  });
  const [disabledChannels, setDisabledChannels] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const ch of channels) {
      if (!existingPrices.find((p) => p.channel_key === ch.key)) s.add(ch.key);
    }
    return s;
  });
  // Stock tracking: is_base = this item IS the counted item; baseItems = base items with qty each
  const [isBase, setIsBase] = useState(existing?.is_base ?? false);
  const [baseItems, setBaseItems] = useState<Array<{ id: string; qty: number }>>([]);
  const [baseOptions, setBaseOptions] = useState<BaseOption[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  // Load available base items and (when editing) which ones this item already links to with qty
  const loadBaseOptions = useCallback(async () => {
    const { data: opts } = await db
      .from("menu_items")
      .select("id,name")
      .eq("is_base", true)
      .eq("is_active", true)
      .order("name");
    const filtered = (opts ?? []).filter((i: BaseOption) => i.id !== existing?.id);
    setBaseOptions(filtered);

    if (existing && filtered.length > 0) {
      // Find which base items this item currently links to, and their quantities
      const { data: myRecipes } = await db
        .from("recipes")
        .select("stock_pool_id,consume_ratio")
        .eq("menu_item_id", existing.id);
      const myPoolMap = new Map(
        (myRecipes ?? []).map((r: { stock_pool_id: string; consume_ratio: number }) => [r.stock_pool_id, r.consume_ratio]),
      );
      if (myPoolMap.size > 0) {
        const baseIds = filtered.map((o: BaseOption) => o.id);
        const { data: baseRecipes } = await db
          .from("recipes")
          .select("menu_item_id,stock_pool_id")
          .in("menu_item_id", baseIds);
        const selected = (baseRecipes ?? [])
          .filter((r: { stock_pool_id: string }) => myPoolMap.has(r.stock_pool_id))
          .map((r: { menu_item_id: string; stock_pool_id: string }) => ({
            id: r.menu_item_id,
            qty: myPoolMap.get(r.stock_pool_id) ?? 1,
          }));
        setBaseItems(selected);
      }
    }
  }, [existing?.id]);

  useEffect(() => {
    loadBaseOptions();
  }, [loadBaseOptions]);

  const priceSplits = useMemo(() => {
    const out: Record<string, ReturnType<typeof splitInclusive> | null> = {};
    for (const ch of channels) {
      const raw = priceMap[ch.key];
      const n = parseFloat(raw);
      out[ch.key] = Number.isFinite(n) && n > 0 ? splitInclusive(n, gstRate) : null;
    }
    return out;
  }, [priceMap, channels, gstRate]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const path = await uploadMenuImage(
        restaurantId,
        "item",
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
    if (!code.trim()) return toast.error("Item code is required");
    if (!name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      const effectiveIsBase = stockMode === "counted" && isBase;
      const effectiveBaseItems = stockMode === "counted" && !isBase ? baseItems : [];

      const payload = {
        restaurant_id: restaurantId,
        item_code: code.trim(),
        name: name.trim(),
        kot_short_name: shortName.trim() || name.trim().slice(0, 20),
        category_id: categoryId,
        image_url: imagePath,
        is_favorite: isFavorite,
        is_active: isActive,
        is_86: is86,
        is_base: effectiveIsBase,
        stock_mode: stockMode,
        stock_benchmark:
          stockMode === "counted" && benchmark.trim() !== ""
            ? Math.max(0, parseInt(benchmark, 10) || 0)
            : null,
        gst_rate: gstRate,
      };

      let itemId = existing?.id;
      if (existing) {
        const { error } = await db.from("menu_items").update(payload).eq("id", existing.id);
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await db.from("menu_items").insert(payload).select().single();
        if (error) throw new Error(error.message);
        itemId = data.id;
      }
      if (!itemId) throw new Error("Save failed");

      // Prices: upsert per channel
      for (const ch of channels) {
        const raw = priceMap[ch.key];
        const inc = parseFloat(raw);
        if (!Number.isFinite(inc) || inc <= 0) {
          // delete if exists
          const ex = existingPrices.find((p) => p.channel_key === ch.key);
          if (ex) await db.from("menu_prices").delete().eq("id", ex.id);
          continue;
        }
        const split = splitInclusive(inc, gstRate);
        const row = {
          restaurant_id: restaurantId,
          menu_item_id: itemId,
          channel_key: ch.key,
          inclusive_price: split.inclusive,
          base_price: split.base,
          gst_rate: gstRate,
        };
        const ex = existingPrices.find((p) => p.channel_key === ch.key);
        if (ex) {
          await db.from("menu_prices").update(row).eq("id", ex.id);
        } else {
          await db.from("menu_prices").insert(row);
        }
      }

      // Pool + recipe sync runs server-side (supabaseAdmin) to bypass RLS on stock_pools.
      if (stockMode === "counted" && (effectiveIsBase || effectiveBaseItems.length > 0)) {
        await syncItemStockPool({
          data: {
            itemId: itemId!,
            itemName: name.trim(),
            restaurantId,
            isBase: effectiveIsBase,
            baseItems: effectiveBaseItems,
          },
        });
      } else {
        // unlimited — just wipe recipes (no pool needed)
        await db.from("recipes").delete().eq("menu_item_id", itemId);
      }

      toast.success(existing ? "Updated" : "Created");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem() {
    if (!existing) return;
    const { error } = await db.from("menu_items").delete().eq("id", existing.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      onSaved();
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{existing ? "Edit menu item" : "New menu item"}</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 py-4">
          {/* Image */}
          <div className="flex items-center gap-3">
            <div className="h-20 w-20 rounded-xl border border-border overflow-hidden">
              <MenuImage path={imagePath} alt={name} className="h-full w-full" />
            </div>
            <div className="flex flex-col gap-2">
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-surface hover:bg-accent cursor-pointer text-sm font-medium">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                <span>{uploading ? "Uploading…" : imagePath ? "Replace" : "Upload image"}</span>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="block mb-1.5">Item code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="MC-001" />
            </div>
            <div>
              <Label className="block mb-1.5">Category</Label>
              <Select
                value={categoryId ?? "none"}
                onValueChange={(v) => setCategoryId(v === "none" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Uncategorised</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="block mb-1.5">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label className="block mb-1.5">
              KOT short name <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Input
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              placeholder={name.slice(0, 20)}
            />
          </div>

          {/* Toggles */}
          <div className="grid grid-cols-3 gap-2">
            <Toggle label="Favorite" value={isFavorite} onChange={setIsFavorite} />
            <Toggle label="Active" value={isActive} onChange={setIsActive} />
            <Toggle label="86 (out)" value={is86} onChange={setIs86} />
          </div>

          {/* Prices */}
          <div className="rounded-xl border border-border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm">Prices (GST inclusive)</h4>
              <div className="flex items-center gap-2 text-xs">
                <Label className="text-muted-foreground">GST %</Label>
                <Input
                  type="number"
                  value={gstRate}
                  onChange={(e) => setGstRate(parseFloat(e.target.value) || 0)}
                  className="h-8 w-20"
                  step="0.01"
                />
              </div>
            </div>
            <div className="space-y-3">
              {channels.map((ch) => {
                const split = priceSplits[ch.key];
                const off = disabledChannels.has(ch.key);
                return (
                  <div key={ch.key} className={`space-y-1 ${off ? "opacity-50" : ""}`}>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">{ch.label}</Label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground">
                        <Switch
                          checked={!off}
                          onCheckedChange={(v) => {
                            setDisabledChannels((s) => {
                              const next = new Set(s);
                              if (v) next.delete(ch.key);
                              else { next.add(ch.key); setPriceMap((m) => ({ ...m, [ch.key]: "" })); }
                              return next;
                            });
                          }}
                          className="scale-75"
                        />
                        {off ? "Disabled" : "Enabled"}
                      </label>
                    </div>
                    <Input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      placeholder="0.00"
                      disabled={off}
                      value={off ? "" : (priceMap[ch.key] ?? "")}
                      onChange={(e) =>
                        setPriceMap((m) => ({ ...m, [ch.key]: e.target.value }))
                      }
                    />
                    {split && (
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 pl-1">
                        <span>Base: <span className="text-foreground">{inr(split.base)}</span></span>
                        <span>CGST: <span className="text-foreground">{inr(split.cgst)}</span></span>
                        <span>SGST: <span className="text-foreground">{inr(split.sgst)}</span></span>
                        <span>Total: <span className="text-foreground font-medium">{inr(split.total)}</span></span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stock */}
          <div className="rounded-xl border border-border p-3 space-y-3">
            <h4 className="font-semibold text-sm">Stock</h4>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={stockMode === "unlimited" ? "default" : "outline"}
                size="sm"
                onClick={() => setStockMode("unlimited")}
                className="flex-1"
              >
                Unlimited
              </Button>
              <Button
                type="button"
                variant={stockMode === "counted" ? "default" : "outline"}
                size="sm"
                onClick={() => setStockMode("counted")}
                className="flex-1"
              >
                Counted
              </Button>
            </div>

            {stockMode === "counted" && (
              <div className="space-y-4">
                {/* Base or linked */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setIsBase(true); setBaseItems([]); }}
                    className={`rounded-xl border p-3 text-left transition-colors ${isBase ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50"}`}
                  >
                    <div className="font-semibold text-sm">This IS a base item</div>
                    <div className="text-xs text-muted-foreground mt-0.5">You'll set the count in Daily Stock each morning</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsBase(false); }}
                    className={`rounded-xl border p-3 text-left transition-colors ${!isBase ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50"}`}
                  >
                    <div className="font-semibold text-sm">Uses base item(s)</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Availability is tied to one or more base items</div>
                  </button>
                </div>

                {isBase && (
                  <p className="text-xs text-muted-foreground rounded-lg bg-accent/50 px-3 py-2">
                    Set the opening count each day from the <strong>Daily Stock</strong> page. Availability drops by 1 each time this dish is ordered.
                  </p>
                )}

                {!isBase && (
                  <div className="space-y-1.5">
                    <Label className="text-sm">Base items &amp; quantity</Label>
                    {baseOptions.length === 0 ? (
                      <p className="text-xs text-muted-foreground rounded-lg bg-accent/50 px-3 py-2">
                        No base items yet — create one first by setting another item as "This IS a base item".
                      </p>
                    ) : (
                      <div className="rounded-lg border border-border divide-y max-h-56 overflow-y-auto">
                        {baseOptions.map((opt) => {
                          const entry = baseItems.find((b) => b.id === opt.id);
                          const checked = !!entry;
                          return (
                            <div
                              key={opt.id}
                              className="flex items-center gap-3 px-3 py-2.5"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) => {
                                  setBaseItems((prev) =>
                                    v
                                      ? [...prev, { id: opt.id, qty: 1 }]
                                      : prev.filter((b) => b.id !== opt.id),
                                  );
                                }}
                              />
                              <span className="text-sm flex-1">{opt.name}</span>
                              {checked && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <span className="text-xs text-muted-foreground">×</span>
                                  <Input
                                    type="number"
                                    min={0.01}
                                    step={0.01}
                                    value={entry!.qty}
                                    onChange={(e) => {
                                      const q = parseFloat(e.target.value);
                                      if (!Number.isFinite(q) || q <= 0) return;
                                      setBaseItems((prev) =>
                                        prev.map((b) => b.id === opt.id ? { ...b, qty: q } : b),
                                      );
                                    }}
                                    className="h-8 w-20 text-right text-sm"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">Each order consumes the specified quantity from each selected base item's stock.</p>
                  </div>
                )}

                {/* Benchmark */}
                <div className="space-y-1 border-t border-border pt-3">
                  <Label className="text-sm">Alert when stock drops to <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    placeholder="e.g. 5"
                    value={benchmark}
                    onChange={(e) => setBenchmark(e.target.value.replace(/\D/g, ""))}
                    className="w-32"
                  />
                  <p className="text-xs text-muted-foreground">Notifies admins when portions fall to this number. Leave blank for no alert.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <SheetFooter className="flex flex-row gap-2 sm:justify-between">
          {existing ? (
            <Button variant="destructive" onClick={() => setConfirmDel(true)}>
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </div>
        </SheetFooter>

        <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this item?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the item, its prices, and its recipe links. Stock pools are kept.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={deleteItem}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}

function Toggle({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-2 p-2 rounded-lg border border-border cursor-pointer hover:bg-accent/50">
      <Switch checked={value} onCheckedChange={onChange} className="mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
    </label>
  );
}
