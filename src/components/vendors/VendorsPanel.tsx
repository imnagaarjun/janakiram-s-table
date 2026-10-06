import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  Lock,
  EyeOff,
  Search,
  ChevronsUpDown,
  ChevronsDownUp,
  CornerDownRight,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { inr } from "@/lib/gst";
import { vendorKind, type VendorKind } from "./vendorKind";
import { mergeUnits } from "@/lib/units";

interface ExpenseCategory {
  id: string;
  name: string;
  display_order: number;
  is_active: boolean;
}

interface Vendor {
  id: string;
  restaurant_id: string;
  name: string;
  name_tamil: string | null;
  is_multi_product: boolean;
  is_fixed_amount: boolean;
  default_category_id: string | null;
  phone: string | null;
  is_active: boolean;
  display_order: number;
  is_adhoc?: boolean;
}

interface VendorProduct {
  id: string;
  restaurant_id: string;
  vendor_id: string;
  name: string;
  name_tamil: string | null;
  unit: string;
  price_mode: "fixed" | "variable";
  fixed_price: number | null;
  gst_applicable: boolean;
  category_id: string | null;
  display_order: number;
  is_active: boolean;
}

export function VendorsPanel() {
  const { profile } = useAuth();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [cats, setCats] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Vendor | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [v, p, c] = await Promise.all([
      db.from("vendors").select("*").order("display_order").order("name"),
      db.from("vendor_products").select("*").order("display_order").order("name"),
      db.from("expense_categories").select("*").eq("is_active", true).order("display_order"),
    ]);
    if (v.error) toast.error(v.error.message);
    setVendors(v.data ?? []);
    setProducts(p.data ?? []);
    setCats(c.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggleExpand(id: string) {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function toggleActive(v: Vendor, val: boolean) {
    // Activating a one-time vendor promotes it into the regular vendor list.
    const { error } = await db
      .from("vendors")
      .update({ is_active: val, ...(val && v.is_adhoc ? { is_adhoc: false } : {}) })
      .eq("id", v.id);
    if (error) toast.error(error.message);
    else load();
  }

  async function deleteVendor(v: Vendor) {
    // check history
    const { count, error: cErr } = await db
      .from("purchase_lines")
      .select("id", { count: "exact", head: true })
      .eq("vendor_id", v.id);
    if (cErr) {
      toast.error(cErr.message);
      return;
    }
    if ((count ?? 0) > 0) {
      const { error } = await db.from("vendors").update({ is_active: false }).eq("id", v.id);
      if (error) toast.error(error.message);
      else {
        toast.success("Vendor has purchase history — deactivated instead of deleted.");
        load();
      }
    } else {
      const { error } = await db.from("vendors").delete().eq("id", v.id);
      if (error) toast.error(error.message);
      else {
        toast.success("Vendor deleted");
        load();
      }
    }
    setConfirmDel(null);
  }

  if (!profile) return null;

  const q = query.trim().toLowerCase();
  const visibleVendors = q
    ? vendors.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          (v.name_tamil ?? "").toLowerCase().includes(q) ||
          products.some(
            (p) =>
              p.vendor_id === v.id &&
              (p.name.toLowerCase().includes(q) || (p.name_tamil ?? "").toLowerCase().includes(q)),
          ),
      )
    : vendors;
  const multiIds = vendors.filter((v) => v.is_multi_product).map((v) => v.id);
  const allOpen = multiIds.length > 0 && multiIds.every((id) => expanded.has(id));

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search vendors or products…"
            className="pl-9 min-h-[44px]"
          />
        </div>
        <div className="flex gap-2">
          {multiIds.length > 0 && (
            <Button
              variant="outline"
              className="min-h-[44px] flex-1 sm:flex-none"
              onClick={() => setExpanded(allOpen ? new Set() : new Set(multiIds))}
            >
              {allOpen ? (
                <ChevronsDownUp className="h-4 w-4 mr-2" />
              ) : (
                <ChevronsUpDown className="h-4 w-4 mr-2" />
              )}
              {allOpen ? "Collapse all" : "Expand all"}
            </Button>
          )}
          <Button onClick={() => setCreating(true)} className="min-h-[44px] flex-1 sm:flex-none">
            <Plus className="h-4 w-4 mr-2" />
            New vendor
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-primary" /> Multi-product (has items)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-warning" /> Fixed amount
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/40" /> Single item
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : vendors.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
          No vendors yet. Create your first one.
        </div>
      ) : visibleVendors.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
          Nothing matches “{query}”.
        </div>
      ) : (
        <div className="space-y-3">
          {visibleVendors.map((v) => {
            const cat = cats.find((c) => c.id === v.default_category_id);
            const vprods = products.filter((p) => p.vendor_id === v.id);
            const kind = vendorKind(v);
            // a search hit on a product auto-opens its vendor
            const open =
              expanded.has(v.id) ||
              (!!q &&
                v.is_multi_product &&
                vprods.some(
                  (p) =>
                    p.name.toLowerCase().includes(q) ||
                    (p.name_tamil ?? "").toLowerCase().includes(q),
                ));
            return (
              <div
                key={v.id}
                className={`relative rounded-2xl border bg-surface overflow-hidden shadow-sm transition-colors ${
                  open ? "border-primary/40 shadow-md" : "border-border"
                } ${v.is_active ? "" : "opacity-60"}`}
              >
                <span className={`absolute inset-y-0 left-0 w-1.5 ${kind.bar}`} aria-hidden />

                <div className={`flex items-start gap-3 py-3 pl-5 pr-3 ${open ? kind.tint : ""}`}>
                  <button
                    type="button"
                    disabled={!v.is_multi_product}
                    onClick={() => v.is_multi_product && toggleExpand(v.id)}
                    className={`flex flex-1 min-w-0 items-start gap-3 text-left ${
                      v.is_multi_product ? "cursor-pointer" : "cursor-default"
                    }`}
                    aria-expanded={v.is_multi_product ? open : undefined}
                    aria-label={v.is_multi_product ? `Toggle ${v.name} products` : undefined}
                  >
                    <span
                      className={`h-10 w-10 shrink-0 rounded-xl grid place-items-center ${kind.tile}`}
                    >
                      <kind.Icon className="h-5 w-5" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-base leading-tight">{v.name}</span>
                        {v.name_tamil && (
                          <span className="text-sm text-muted-foreground">{v.name_tamil}</span>
                        )}
                        {v.is_adhoc && (
                          <Badge
                            variant="secondary"
                            className="text-xs"
                            title="Added by staff on a daily purchase. Turn it on to make it a regular vendor."
                          >
                            One-time
                          </Badge>
                        )}
                        {!v.is_active && (
                          <Badge variant="outline" className="text-xs">
                            <EyeOff className="h-3 w-3 mr-1" /> inactive
                          </Badge>
                        )}
                      </span>
                      <span className="flex items-center gap-x-2 gap-y-1 flex-wrap mt-1 text-xs text-muted-foreground">
                        <span className="font-medium">{kind.label}</span>
                        <span aria-hidden>·</span>
                        <span>{cat?.name ?? "No category"}</span>
                        {v.phone && (
                          <>
                            <span aria-hidden>·</span>
                            <span>{v.phone}</span>
                          </>
                        )}
                      </span>
                      {v.is_multi_product && (
                        <span className="inline-flex items-center gap-1 mt-2 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-medium">
                          {open ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                          {vprods.length} {vprods.length === 1 ? "product" : "products"}
                        </span>
                      )}
                    </span>
                  </button>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <Switch
                      checked={v.is_active}
                      onCheckedChange={(c) => toggleActive(v, c)}
                      aria-label="Active"
                      className="mr-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditing(v)}
                      aria-label="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setConfirmDel(v)}
                      aria-label="Delete"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {v.is_multi_product && open && (
                  <ProductsEditor
                    restaurantId={profile.restaurant_id}
                    vendor={v}
                    products={vprods}
                    allUnits={mergeUnits(products.map((p) => p.unit))}
                    cats={cats}
                    kind={kind}
                    onReload={load}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {(creating || editing) && (
        <VendorEditor
          restaurantId={profile.restaurant_id}
          existing={editing}
          cats={cats}
          nextOrder={vendors.length}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            load();
          }}
        />
      )}

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete vendor?</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmDel?.name}" will be removed. If it has purchase history it will be
              deactivated instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDel && deleteVendor(confirmDel)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function VendorEditor({
  restaurantId,
  existing,
  cats,
  nextOrder,
  onClose,
  onSaved,
}: {
  restaurantId: string;
  existing: Vendor | null;
  cats: ExpenseCategory[];
  nextOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [nameTamil, setNameTamil] = useState(existing?.name_tamil ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(
    existing?.default_category_id ?? null,
  );
  const [isMulti, setIsMulti] = useState(existing?.is_multi_product ?? false);
  const [isFixedAmount, setIsFixedAmount] = useState(existing?.is_fixed_amount ?? false);
  const [isActive, setIsActive] = useState(existing?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    const payload = {
      restaurant_id: restaurantId,
      name: name.trim(),
      name_tamil: nameTamil.trim() || null,
      phone: phone.trim() || null,
      default_category_id: categoryId,
      is_multi_product: isMulti,
      is_fixed_amount: isMulti ? false : isFixedAmount,
      is_active: isActive,
    };
    if (existing) {
      const { error } = await db.from("vendors").update(payload).eq("id", existing.id);
      if (error) toast.error(error.message);
      else {
        toast.success("Saved");
        onSaved();
      }
    } else {
      const { error } = await db.from("vendors").insert({ ...payload, display_order: nextOrder });
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
          <DialogTitle>{existing ? "Edit vendor" : "New vendor"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="block mb-1.5">Name (English)</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div>
              <Label className="block mb-1.5">Name (Tamil)</Label>
              <Input value={nameTamil} onChange={(e) => setNameTamil(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="block mb-1.5">Default category</Label>
              <Select
                value={categoryId ?? "__none"}
                onValueChange={(v) => setCategoryId(v === "__none" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— None —</SelectItem>
                  {cats.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="block mb-1.5">Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>

          <div className="rounded-xl border border-border p-3 flex items-center justify-between gap-3">
            <div>
              <div className="font-medium text-sm">Multi-product vendor</div>
              <div className="text-xs text-muted-foreground">
                Turn on to manage an item catalog for this vendor (e.g. Kumar Mutton: Full Mutton,
                Liver). Off = single-line vendor with default category.
              </div>
            </div>
            <Switch
              checked={isMulti}
              onCheckedChange={(c) => {
                setIsMulti(c);
                if (c) setIsFixedAmount(false);
              }}
            />
          </div>

          {!isMulti && (
            <div className="rounded-xl border border-border p-3 flex items-center justify-between gap-3">
              <div>
                <div className="font-medium text-sm">Fixed amount (no qty / price)</div>
                <div className="text-xs text-muted-foreground">
                  For flat-fee vendors (donations, rent, subscriptions). Daily entry shows a single
                  amount field instead of Qty × Price.
                </div>
              </div>
              <Switch checked={isFixedAmount} onCheckedChange={setIsFixedAmount} />
            </div>
          )}

          <div className="flex items-center gap-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} id="vend-active" />
            <Label htmlFor="vend-active">Active</Label>
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

function ProductsEditor({
  restaurantId,
  vendor,
  products,
  allUnits,
  cats,
  kind,
  onReload,
}: {
  restaurantId: string;
  vendor: Vendor;
  products: VendorProduct[];
  allUnits: string[];
  cats: ExpenseCategory[];
  kind: VendorKind;
  onReload: () => void;
}) {
  const [editing, setEditing] = useState<VendorProduct | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDel, setConfirmDel] = useState<VendorProduct | null>(null);

  async function toggleActive(p: VendorProduct, val: boolean) {
    const { error } = await db.from("vendor_products").update({ is_active: val }).eq("id", p.id);
    if (error) toast.error(error.message);
    else onReload();
  }

  async function deleteProduct(p: VendorProduct) {
    const { count, error: cErr } = await db
      .from("purchase_lines")
      .select("id", { count: "exact", head: true })
      .eq("vendor_product_id", p.id);
    if (cErr) {
      toast.error(cErr.message);
      return;
    }
    if ((count ?? 0) > 0) {
      const { error } = await db
        .from("vendor_products")
        .update({ is_active: false })
        .eq("id", p.id);
      if (error) toast.error(error.message);
      else {
        toast.success("Product has history — deactivated instead of deleted.");
        onReload();
      }
    } else {
      const { error } = await db.from("vendor_products").delete().eq("id", p.id);
      if (error) toast.error(error.message);
      else {
        toast.success("Product deleted");
        onReload();
      }
    }
    setConfirmDel(null);
  }

  return (
    <div className={`border-t border-border ${kind.tint} pl-5 pr-3 py-3`}>
      <div className="flex items-center justify-between gap-2 mb-3 pl-1">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <CornerDownRight className="h-3.5 w-3.5" />
          Products
          <span className="rounded-full bg-background border border-border px-2 py-px text-[10px] normal-case tracking-normal">
            {products.length}
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setCreating(true)}
          className={`min-h-[36px] ${kind.soft}`}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Add product
        </Button>
      </div>

      {products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface/60 text-xs text-muted-foreground py-5 text-center ml-3">
          No products yet — add the first item this vendor supplies.
        </div>
      ) : (
        <div className={`ml-3 border-l-2 ${kind.rail} pl-4 space-y-2`}>
          {products.map((p) => {
            const cat = cats.find((c) => c.id === p.category_id);
            return (
              <div
                key={p.id}
                className={`relative flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 ${
                  p.is_active ? "" : "opacity-60"
                }`}
              >
                <span
                  className={`absolute -left-4 top-1/2 h-0 w-4 border-t-2 ${kind.rail}`}
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-x-2 gap-y-1 flex-wrap">
                    <span className="font-medium text-sm">{p.name}</span>
                    {p.name_tamil && (
                      <span className="text-xs text-muted-foreground">{p.name_tamil}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
                    <Badge variant="outline" className="text-[10px]">
                      {p.unit}
                    </Badge>
                    {p.price_mode === "fixed" ? (
                      <Badge className="text-[10px] gap-1">
                        <Lock className="h-2.5 w-2.5" />
                        {inr(p.fixed_price ?? 0)}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        variable
                      </Badge>
                    )}
                    {p.gst_applicable && (
                      <Badge variant="outline" className="text-[10px]">
                        GST
                      </Badge>
                    )}
                    {!p.is_active && (
                      <Badge variant="outline" className="text-[10px]">
                        <EyeOff className="h-2.5 w-2.5 mr-0.5" /> inactive
                      </Badge>
                    )}
                  </div>
                  {cat && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">{cat.name}</div>
                  )}
                </div>
                <Switch
                  checked={p.is_active}
                  onCheckedChange={(c) => toggleActive(p, c)}
                  aria-label="Active"
                />
                <Button variant="ghost" size="icon" onClick={() => setEditing(p)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setConfirmDel(p)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {(creating || editing) && (
        <ProductEditor
          restaurantId={restaurantId}
          vendor={vendor}
          existing={editing}
          units={allUnits}
          cats={cats}
          nextOrder={products.length}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            onReload();
          }}
        />
      )}

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmDel?.name}" will be removed. If it has purchase history it will be
              deactivated instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDel && deleteProduct(confirmDel)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ProductEditor({
  restaurantId,
  vendor,
  existing,
  units,
  cats,
  nextOrder,
  onClose,
  onSaved,
}: {
  restaurantId: string;
  vendor: Vendor;
  existing: VendorProduct | null;
  units: string[];
  cats: ExpenseCategory[];
  nextOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [nameTamil, setNameTamil] = useState(existing?.name_tamil ?? "");
  const [unit, setUnit] = useState(existing?.unit ?? "kg");
  const [extraUnits, setExtraUnits] = useState<string[]>([]);
  const [addingUnit, setAddingUnit] = useState(false);
  const [newUnit, setNewUnit] = useState("");
  const unitOptions = mergeUnits([...units, ...extraUnits, unit]);

  function commitNewUnit() {
    const u = newUnit.trim();
    if (!u) return;
    if (u.length > 20) {
      toast.error("Unit name is too long (max 20 characters)");
      return;
    }
    const existingMatch = unitOptions.find((x) => x.toLowerCase() === u.toLowerCase());
    if (!existingMatch) setExtraUnits((e) => [...e, u]);
    setUnit(existingMatch ?? u);
    setNewUnit("");
    setAddingUnit(false);
  }
  const [priceMode, setPriceMode] = useState<"fixed" | "variable">(
    existing?.price_mode ?? "variable",
  );
  const [fixedPrice, setFixedPrice] = useState<string>(
    existing?.fixed_price != null ? String(existing.fixed_price) : "",
  );
  const [gstApplicable, setGstApplicable] = useState(existing?.gst_applicable ?? false);
  const [categoryId, setCategoryId] = useState<string | null>(
    existing?.category_id ?? vendor.default_category_id,
  );
  const [isActive, setIsActive] = useState(existing?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      toast.error("Product name is required");
      return;
    }
    if (priceMode === "fixed") {
      const n = parseFloat(fixedPrice);
      if (!isFinite(n) || n <= 0) {
        toast.error("Fixed price must be a positive number");
        return;
      }
    }
    setSaving(true);
    const payload = {
      restaurant_id: restaurantId,
      vendor_id: vendor.id,
      name: name.trim(),
      name_tamil: nameTamil.trim() || null,
      unit,
      price_mode: priceMode,
      fixed_price: priceMode === "fixed" ? parseFloat(fixedPrice) : null,
      gst_applicable: gstApplicable,
      category_id: categoryId,
      is_active: isActive,
    };
    if (existing) {
      const { error } = await db.from("vendor_products").update(payload).eq("id", existing.id);
      if (error) toast.error(error.message);
      else {
        toast.success("Saved");
        onSaved();
      }
    } else {
      const { error } = await db
        .from("vendor_products")
        .insert({ ...payload, display_order: nextOrder });
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
          <DialogTitle>
            {existing ? "Edit product" : "New product"} · {vendor.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="block mb-1.5">Name (English)</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div>
              <Label className="block mb-1.5">Name (Tamil)</Label>
              <Input value={nameTamil} onChange={(e) => setNameTamil(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="block mb-1.5">Unit</Label>
              <Select
                value={unit}
                onValueChange={(v) => {
                  if (v === "__new") setAddingUnit(true);
                  else {
                    setAddingUnit(false);
                    setUnit(v);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {unitOptions.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                  <SelectItem value="__new" className="text-primary font-medium">
                    + Add new unit…
                  </SelectItem>
                </SelectContent>
              </Select>
              {addingUnit && (
                <div className="flex gap-2 mt-2">
                  <Input
                    autoFocus
                    value={newUnit}
                    maxLength={20}
                    onChange={(e) => setNewUnit(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitNewUnit();
                      }
                    }}
                    placeholder="e.g. Bag, Crate"
                    aria-label="New unit name"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={commitNewUnit}
                    disabled={!newUnit.trim()}
                  >
                    Add
                  </Button>
                </div>
              )}
            </div>
            <div>
              <Label className="block mb-1.5">Category</Label>
              <Select
                value={categoryId ?? "__none"}
                onValueChange={(v) => setCategoryId(v === "__none" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— None —</SelectItem>
                  {cats.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-xl border border-border p-3 space-y-3">
            <div>
              <Label className="block mb-1.5">Price mode</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={priceMode === "fixed" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPriceMode("fixed")}
                  className="flex-1"
                >
                  <Lock className="h-3.5 w-3.5 mr-1" /> Fixed
                </Button>
                <Button
                  type="button"
                  variant={priceMode === "variable" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPriceMode("variable")}
                  className="flex-1"
                >
                  Variable
                </Button>
              </div>
            </div>
            {priceMode === "fixed" && (
              <div>
                <Label className="block mb-1.5">Fixed price (₹ per {unit})</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={fixedPrice}
                  onChange={(e) => setFixedPrice(e.target.value)}
                  placeholder="750.00"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch checked={gstApplicable} onCheckedChange={setGstApplicable} id="prod-gst" />
              <Label htmlFor="prod-gst">GST applicable</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} id="prod-active" />
              <Label htmlFor="prod-active">Active</Label>
            </div>
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
