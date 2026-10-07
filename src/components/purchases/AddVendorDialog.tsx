import { useMemo, useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { inr, num, round2 } from "./numbers";
import { NumInput, UnitSelect } from "./shared";
import type { VendorType } from "./model";

interface Item {
  uid: number;
  name: string;
  qty: string;
  unit: string;
  price: string;
}

let uidSeq = 1;
const blankItem = (unit = "kg"): Item => ({ uid: uidSeq++, name: "", qty: "", unit, price: "" });

const ERRORS: Record<string, string> = {
  VENDOR_EXISTS:
    "This vendor is already in the vendor list. Use its row in the table (or “Add item for today” in its item table).",
  VENDOR_ALREADY_TODAY:
    "This one-time vendor already has an entry today. Find it in the table and edit it there.",
  NOT_ALLOWED: "You don't have permission to record purchases.",
  DAY_APPROVED: "This day is approved. Only the admin can change it.",
  DAY_CHECKED:
    "This day has been checked. Only people who can approve it (or the admin) can correct it.",
};

function friendly(message: string) {
  const key = Object.keys(ERRORS).find((k) => message.includes(k));
  return key ? ERRORS[key] : message;
}

const TYPES: { value: VendorType; label: string; hint: string }[] = [
  { value: "single", label: "Qty × Price", hint: "One purchase: quantity and price" },
  { value: "value", label: "Amount only", hint: "Just a value (rent, donation…)" },
  { value: "multi", label: "Several items", hint: "Its own item table" },
];

// Records a purchase from a vendor that is not in the vendor list. The vendor is stored as a
// one-time vendor for the books only; the owner's vendor & product setup is never changed here.
export function AddVendorDialog({
  businessDate,
  existingNames,
  unitOptions,
  categories,
  onClose,
  onCreated,
}: {
  businessDate: string;
  existingNames: string[];
  unitOptions: string[];
  categories: { id: string; name: string }[];
  onClose: () => void;
  onCreated: (vendorName: string) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<VendorType>("single");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<Item[]>(() => [blankItem()]);
  const [online, setOnline] = useState(false);
  const [full, setFull] = useState(true);
  const [paidTotal, setPaidTotal] = useState("");
  const [saving, setSaving] = useState(false);

  const validItems = useMemo(
    () => items.filter((i) => i.name.trim() && num(i.qty) > 0 && num(i.price) > 0),
    [items],
  );
  const amount =
    type === "multi"
      ? round2(validItems.reduce((s, i) => s + round2(num(i.qty) * num(i.price)), 0))
      : type === "value"
        ? round2(Math.max(num(price), 0))
        : num(qty) > 0 && num(price) > 0
          ? round2(num(qty) * num(price))
          : 0;
  const paid = full ? amount : Math.min(Math.max(num(paidTotal), 0), amount);
  const due = round2(amount - paid);
  const duplicate = existingNames.some((n) => n.trim().toLowerCase() === name.trim().toLowerCase());

  function patch(uid: number, p: Partial<Item>) {
    setItems((list) => list.map((i) => (i.uid === uid ? { ...i, ...p } : i)));
  }

  async function save() {
    if (!name.trim()) return toast.error("Enter the vendor name");
    if (duplicate) return toast.error(friendly("VENDOR_EXISTS"));
    const mode = online ? "online" : "cash";
    let lines: Record<string, unknown>[];

    if (type === "multi") {
      const started = items.filter((i) => i.name.trim() || i.qty || i.price);
      if (started.some((i) => !(i.name.trim() && num(i.qty) > 0 && num(i.price) > 0)))
        return toast.error("Each item needs a name, quantity and price (or remove the row)");
      if (validItems.length === 0) return toast.error("Add at least one item");
      // Part payment is applied to the items in order.
      let remaining = paid;
      lines = validItems.map((i) => {
        const a = round2(num(i.qty) * num(i.price));
        const p = Math.min(remaining, a);
        remaining = round2(remaining - p);
        return {
          description: i.name.trim(),
          unit: i.unit,
          qty: num(i.qty),
          unit_price: num(i.price),
          pay_mode: mode,
          paid_amount: p,
        };
      });
    } else if (type === "value") {
      if (amount <= 0) return toast.error("Enter the amount");
      lines = [
        {
          qty: 1,
          unit_price: amount,
          pay_mode: mode,
          paid_amount: paid,
          description: note.trim() || null,
        },
      ];
    } else {
      if (amount <= 0) return toast.error("Enter the quantity and price");
      lines = [
        {
          qty: num(qty),
          unit_price: num(price),
          pay_mode: mode,
          paid_amount: paid,
          description: note.trim() || null,
        },
      ];
    }

    setSaving(true);
    const { error } = await db.rpc("create_adhoc_vendor_purchase", {
      _business_date: businessDate,
      _name: name.trim(),
      _category_id: categoryId,
      _lines: lines,
      _vendor_type: type,
    });
    if (error) {
      toast.error(friendly(error.message));
      setSaving(false);
      return;
    }
    onCreated(name.trim());
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add vendor &amp; purchase</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground -mt-1">
            For a vendor that isn&apos;t in the list. It is recorded in today&apos;s accounts as a
            one-time vendor and does not change the vendor list; the owner can review it under
            Vendors &amp; products.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="block mb-1.5">Vendor name</Label>
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Type in Tamil or English"
                className="h-11 sm:h-9"
              />
              {duplicate && (
                <p className="text-xs text-destructive mt-1">{friendly("VENDOR_EXISTS")}</p>
              )}
            </div>
            <div>
              <Label className="block mb-1.5">Expense category</Label>
              <Select
                value={categoryId ?? "__none"}
                onValueChange={(v) => setCategoryId(v === "__none" ? null : v)}
              >
                <SelectTrigger className="h-11 sm:h-9">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— None —</SelectItem>
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
            <Label className="block mb-1.5">Type of purchase</Label>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Type of purchase">
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={type === t.value}
                  onClick={() => setType(t.value)}
                  className={cn(
                    "rounded-xl border px-2 py-2 text-left transition-colors",
                    type === t.value
                      ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                      : "border-border hover:bg-accent",
                  )}
                >
                  <div className="text-sm font-medium leading-tight">{t.label}</div>
                  <div className="hidden sm:block text-[11px] text-muted-foreground leading-tight mt-0.5">
                    {t.hint}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {type === "single" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="block mb-1.5">Quantity</Label>
                <NumInput label="Quantity" value={qty} onChange={setQty} />
              </div>
              <div>
                <Label className="block mb-1.5">Price</Label>
                <NumInput label="Price" value={price} onChange={setPrice} />
              </div>
            </div>
          )}
          {type === "value" && (
            <div>
              <Label className="block mb-1.5">Amount</Label>
              <div className="max-w-xs">
                <NumInput label="Amount" value={price} onChange={setPrice} />
              </div>
            </div>
          )}
          {type !== "multi" && (
            <div>
              <Label className="block mb-1.5">Note (optional)</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="h-11 sm:h-9"
                aria-label="Note"
              />
            </div>
          )}

          {type === "multi" && (
            <div>
              <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_72px_104px_84px_80px_32px] gap-2 text-[10px] uppercase tracking-wider text-muted-foreground pb-1">
                <span>Item</span>
                <span className="text-right">Qty</span>
                <span>Unit</span>
                <span className="text-right">Price</span>
                <span className="text-right">Amount</span>
                <span />
              </div>
              <div className="space-y-2">
                {items.map((i, idx) => {
                  const a = round2(num(i.qty) * num(i.price));
                  return (
                    <div
                      key={i.uid}
                      className="grid grid-cols-3 sm:grid-cols-[minmax(0,1fr)_72px_104px_84px_80px_32px] gap-2 items-end sm:items-center rounded-xl border border-border bg-muted/30 p-2 sm:border-0 sm:bg-transparent sm:p-0"
                    >
                      <div className="col-span-3 sm:col-span-1 flex gap-2">
                        <Input
                          data-entry
                          value={i.name}
                          onChange={(e) => patch(i.uid, { name: e.target.value })}
                          placeholder={`Item ${idx + 1} name`}
                          aria-label="Item name"
                          className="h-11 sm:h-9"
                        />
                        {items.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="sm:hidden h-11 w-11 shrink-0 text-destructive"
                            onClick={() => setItems((l) => l.filter((x) => x.uid !== i.uid))}
                            aria-label="Remove item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <div>
                        <span className="sm:hidden text-[10px] uppercase tracking-wider text-muted-foreground">
                          Qty
                        </span>
                        <NumInput
                          label="Quantity"
                          value={i.qty}
                          onChange={(v) => patch(i.uid, { qty: v })}
                        />
                      </div>
                      <div>
                        <span className="sm:hidden text-[10px] uppercase tracking-wider text-muted-foreground">
                          Unit
                        </span>
                        <UnitSelect
                          value={i.unit}
                          options={unitOptions}
                          onChange={(u) => patch(i.uid, { unit: u })}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <span className="sm:hidden text-[10px] uppercase tracking-wider text-muted-foreground">
                          Price
                        </span>
                        <NumInput
                          label="Price"
                          value={i.price}
                          onChange={(v) => patch(i.uid, { price: v })}
                        />
                      </div>
                      <div className="col-span-3 sm:col-span-1 text-right text-sm font-semibold tabular-nums sm:font-medium">
                        {a > 0 ? inr(a) : <span className="text-muted-foreground/60">—</span>}
                      </div>
                      {items.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="hidden sm:inline-flex h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setItems((l) => l.filter((x) => x.uid !== i.uid))}
                          aria-label="Remove item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setItems((l) => [...l, blankItem(l[l.length - 1]?.unit)])}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary/40 py-2 text-xs font-medium text-primary hover:bg-primary/5"
              >
                <Plus className="h-3.5 w-3.5" /> Add another item
              </button>
            </div>
          )}

          <div className="rounded-xl border border-border p-3">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={online}
                  onChange={(e) => setOnline(e.target.checked)}
                  aria-label="Paid online"
                  className="h-5 w-5 accent-sky-600"
                />
                Paid online
              </label>
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none">
                <Switch checked={full} onCheckedChange={setFull} aria-label="Paid in full" />
                Paid in full
              </label>
              {!full && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Amount paid</span>
                  <div className="w-28">
                    <NumInput label="Amount paid" value={paidTotal} onChange={setPaidTotal} />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm space-x-3">
              <span>
                Total <strong className="tabular-nums">{inr(amount)}</strong>
              </span>
              <span className="text-emerald-700">
                Paid <strong className="tabular-nums">{inr(paid)}</strong>
              </span>
              {due > 0 && (
                <span className="text-amber-700">
                  Due <strong className="tabular-nums">{inr(due)}</strong>
                </span>
              )}
            </div>
            <div className="flex gap-2 ml-auto">
              <Button variant="ghost" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1.5" />
                )}
                Save
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
