import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { vendorKind } from "@/components/vendors/vendorKind";
import { inr2 } from "./numbers";
import { draftAmount, itemAmount, type ItemRow, type Vendor, type VendorDraft } from "./model";
import { NumInput, UnitSelect } from "./shared";

// Item | Qty | Price | Amount on wider screens; stacked on phones.
const GRID = "sm:grid-cols-[minmax(0,1fr)_92px_92px_104px]";

function ItemLine({
  row,
  locked,
  unitOptions,
  autoFocus,
  hint,
  onChange,
  onRemove,
}: {
  row: ItemRow;
  locked: boolean;
  unitOptions: string[];
  autoFocus: boolean;
  hint?: number;
  onChange: (patch: Partial<ItemRow>) => void;
  onRemove: () => void;
}) {
  const amt = itemAmount(row);
  const priceHint = hint ? String(hint) : "0";
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-x-2 gap-y-1 items-end sm:items-center py-2 sm:py-1.5 px-1 -mx-1 rounded-lg",
        "hover:bg-surface/70 focus-within:bg-surface",
        row.adhoc && "border-l-2 border-dashed border-primary/40",
        GRID,
      )}
    >
      <div className={cn("col-span-2 min-w-0", row.adhoc ? "sm:col-span-4" : "sm:col-span-1")}>
        {row.adhoc ? (
          <div className="flex items-center gap-1.5">
            <Input
              data-entry
              autoFocus={autoFocus}
              enterKeyHint="next"
              value={row.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="Item name (today only)"
              aria-label="Item name"
              className="h-11 sm:h-9 flex-1 min-w-0"
            />
            <UnitSelect
              value={row.unit}
              options={unitOptions}
              onChange={(u) => onChange({ unit: u })}
              className="w-[92px] shrink-0"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 sm:h-9 sm:w-9 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={onRemove}
              aria-label="Remove item"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <span className="block font-medium text-sm truncate" title={row.name}>
            {row.name}
          </span>
        )}
      </div>
      {row.adhoc && <div className="hidden sm:block" aria-hidden />}
      <label className="flex flex-col gap-0.5 min-w-0">
        <span className="sm:hidden text-[10px] uppercase tracking-wider text-muted-foreground">
          Qty ({row.unit})
        </span>
        <NumInput
          label={`Quantity of ${row.name || "item"}`}
          value={row.qty}
          suffix={row.adhoc ? undefined : row.unit}
          onChange={(v) => onChange({ qty: v })}
        />
      </label>
      <label className="flex flex-col gap-0.5 min-w-0">
        <span className="sm:hidden text-[10px] uppercase tracking-wider text-muted-foreground">
          Price
        </span>
        <NumInput
          label={`Price of ${row.name || "item"}`}
          value={row.price}
          readOnly={row.fixedPrice}
          locked={row.fixedPrice}
          placeholder={priceHint}
          onChange={(v) => onChange({ price: v })}
        />
      </label>
      <div className="col-span-2 sm:col-span-1 flex items-center justify-between sm:justify-end px-1">
        <span className="sm:hidden text-[10px] uppercase tracking-wider text-muted-foreground">
          Amount
        </span>
        <span
          className={cn(
            "tabular-nums text-sm whitespace-nowrap",
            amt > 0 ? "font-semibold sm:font-medium" : "text-muted-foreground/50",
          )}
        >
          {inr2(amt)}
        </span>
      </div>
    </div>
  );
}

export function DetailCard({
  vendor,
  draft,
  open,
  onToggle,
  locked,
  unitOptions,
  hints,
  focusUid,
  onItem,
  onAdd,
  onRemove,
}: {
  vendor: Vendor;
  draft: VendorDraft;
  open: boolean;
  onToggle: () => void;
  locked: boolean;
  unitOptions: string[];
  hints: Record<string, number>;
  focusUid: string | null;
  onItem: (vendorId: string, uid: string, patch: Partial<ItemRow>) => void;
  onAdd: (vendorId: string) => void;
  onRemove: (vendorId: string, uid: string) => void;
}) {
  const kind = vendorKind(vendor);
  const amount = draftAmount(draft);
  const filled = draft.items.filter((i) => itemAmount(i) > 0).length;

  return (
    <div
      id={`detail-${vendor.id}`}
      className={cn(
        "relative scroll-mt-4 rounded-2xl border bg-surface overflow-hidden shadow-sm",
        open ? "border-primary/40" : "border-border",
      )}
    >
      <span className={`absolute inset-y-0 left-0 w-1.5 ${kind.bar}`} aria-hidden />
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-3 py-2.5 pl-5 pr-3 text-left",
          open && kind.tint,
        )}
      >
        <span className={`h-9 w-9 shrink-0 rounded-xl grid place-items-center ${kind.tile}`}>
          <kind.Icon className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold leading-tight truncate">{vendor.name}</span>
          <span className="block text-xs text-muted-foreground">
            {draft.legacy
              ? "Saved earlier as an itemised day"
              : `${filled} of ${draft.items.length} items entered`}
          </span>
        </span>
        <span className="shrink-0 text-right font-semibold tabular-nums">{inr2(amount)}</span>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open && (
        <fieldset
          disabled={locked}
          className={cn("block min-w-0 border-t border-border pl-5 pr-3 py-2", kind.tint)}
        >
          {draft.legacy ? (
            <div>
              <p className="text-xs text-muted-foreground py-1">
                This day was saved when {vendor.name} was set up differently. The numbers are kept
                exactly as saved and can&apos;t be edited here.
              </p>
              <div className="divide-y divide-border/60">
                {draft.legacy.lines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                    <span className="min-w-0 truncate">{l.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {l.qty} {l.unit} × {inr2(l.price)}
                    </span>
                    <span className="shrink-0 tabular-nums font-medium">{inr2(l.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {draft.items.length === 0 && (
                <p className="text-xs text-muted-foreground italic py-3 text-center">
                  No saved products for {vendor.name} yet. Add today&apos;s items below, or save
                  products under Vendors &amp; products.
                </p>
              )}
              {draft.items.length > 0 && (
                <div
                  className={cn(
                    "hidden sm:grid gap-x-2 pb-1 border-b border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground",
                    GRID,
                  )}
                >
                  <span>Item</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Price</span>
                  <span className="text-right">Amount</span>
                </div>
              )}
              <div className="divide-y divide-border/60">
                {draft.items.map((r) => (
                  <ItemLine
                    key={r.uid}
                    row={r}
                    locked={locked}
                    unitOptions={unitOptions}
                    autoFocus={r.uid === focusUid}
                    hint={r.productId ? hints[`p:${r.productId}`] : undefined}
                    onChange={(patch) => onItem(vendor.id, r.uid, patch)}
                    onRemove={() => onRemove(vendor.id, r.uid)}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => onAdd(vendor.id)}
                className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary/40 py-2 text-xs font-medium text-primary hover:bg-primary/5 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" /> Add item for today
              </button>
            </>
          )}
        </fieldset>
      )}
    </div>
  );
}
