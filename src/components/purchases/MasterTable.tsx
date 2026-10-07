import { useState } from "react";
import { ChevronRight, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { inr2, num } from "./numbers";
import {
  draftAmount,
  draftDue,
  draftPaid,
  vendorType,
  type Vendor,
  type VendorDraft,
} from "./model";

export interface MasterRowData {
  vendor: Vendor;
  draft: VendorDraft;
  saved: boolean;
  dirty: boolean;
}

interface Props {
  rows: MasterRowData[];
  phone: boolean;
  locked: boolean;
  priceHints: Record<string, number>;
  totals: { amount: number; paid: number; due: number; online: number };
  onChange: (vendorId: string, patch: Partial<VendorDraft>) => void;
  onOpenItems: (vendorId: string) => void;
}

const BAR: Record<string, string> = {
  single: "border-l-muted-foreground/40",
  value: "border-l-warning",
  multi: "border-l-primary",
};

const TYPE_LABEL: Record<string, string> = {
  single: "Qty × Price",
  value: "Amount only",
  multi: "Multi-product",
};

// Compact numeric input used inside the table.
function Cell({
  value,
  onChange,
  col,
  label,
  placeholder,
  disabled,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  col: string;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Input
      data-entry
      data-col={col}
      type="number"
      inputMode="decimal"
      enterKeyHint="next"
      step="0.01"
      min="0"
      value={value}
      disabled={disabled}
      aria-label={label}
      placeholder={placeholder ?? "0"}
      onChange={(e) => onChange(e.target.value)}
      onFocus={(e) => e.target.select()}
      onWheel={(e) => e.currentTarget.blur()}
      className={cn(
        "h-9 sm:h-8 px-2 text-right text-sm tabular-nums bg-background",
        "placeholder:text-muted-foreground/45",
        "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        className,
      )}
    />
  );
}

function NotApplicable() {
  return <span className="text-muted-foreground/40 select-none">—</span>;
}

// Shared editing behaviour for both layouts.
function useRowActions(
  row: MasterRowData,
  locked: boolean,
  hints: Record<string, number>,
  onChange: Props["onChange"],
) {
  const { vendor, draft } = row;
  const type = vendorType(vendor);
  const readOnly = locked || !!draft.legacy;
  const amount = draftAmount(draft);
  const paid = draftPaid(draft);
  const due = draftDue(draft);
  const hint = hints[`v:${vendor.id}`];
  return {
    type,
    readOnly,
    amount,
    paid,
    due,
    setQty: (v: string) => {
      // Typing a quantity on an empty price pulls in the last price paid (still editable).
      const patch: Partial<VendorDraft> = { qty: v };
      if (num(v) > 0 && !draft.price && hint) patch.price = String(hint);
      onChange(vendor.id, patch);
    },
    setPrice: (v: string) => onChange(vendor.id, { price: v }),
    setPaid: (v: string) => onChange(vendor.id, { paid: v === "" ? null : v }),
    setOnline: (v: boolean) => onChange(vendor.id, { online: v }),
    setNote: (v: string) => onChange(vendor.id, { note: v }),
    hint,
  };
}

function NameCell({
  row,
  readOnly,
  onOpenItems,
  onNote,
}: {
  row: MasterRowData;
  readOnly: boolean;
  onOpenItems: () => void;
  onNote: (v: string) => void;
}) {
  const { vendor, draft } = row;
  const type = vendorType(vendor);
  const [noteOpen, setNoteOpen] = useState(false);
  const showNote = (noteOpen || !!draft.note) && type !== "multi" && !draft.legacy;
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-medium truncate" title={vendor.name}>
          {vendor.name}
        </span>
        {vendor.is_adhoc && (
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
            Today only
          </span>
        )}
        {row.dirty && (
          <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-amber-500" title="Unsaved" />
        )}
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>{TYPE_LABEL[type]}</span>
        {type !== "multi" && !draft.legacy && !readOnly && !showNote && (
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            className="inline-flex items-center gap-0.5 text-primary hover:underline"
          >
            <Pencil className="h-3 w-3" /> note
          </button>
        )}
        {(type === "multi" || draft.legacy) && (
          <button
            type="button"
            onClick={onOpenItems}
            className="inline-flex items-center gap-0.5 text-primary hover:underline"
          >
            {draft.legacy
              ? "Itemised earlier"
              : `${draft.items.filter((i) => num(i.qty) > 0).length}/${draft.items.length} items`}
            <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>
      {showNote && (
        <Input
          data-entry
          value={draft.note}
          disabled={readOnly}
          onChange={(e) => onNote(e.target.value)}
          placeholder="Note (optional)"
          aria-label={`Note for ${vendor.name}`}
          className="mt-1 h-7 px-2 text-xs"
        />
      )}
    </div>
  );
}

function TableRow({
  index,
  row,
  locked,
  hints,
  onChange,
  onOpenItems,
}: {
  index: number;
  row: MasterRowData;
  locked: boolean;
  hints: Record<string, number>;
  onChange: Props["onChange"];
  onOpenItems: (id: string) => void;
}) {
  const a = useRowActions(row, locked, hints, onChange);
  const { draft, vendor } = row;
  const shade = "bg-muted/40";
  return (
    <tr
      className={cn(
        "border-t border-border/70 align-middle",
        draft.online ? "bg-sky-50/80" : index % 2 === 1 ? "bg-muted/20" : "bg-surface",
      )}
    >
      <td
        className={cn(
          "border-l-4 pl-2 pr-1 py-2 text-xs text-muted-foreground tabular-nums w-10",
          BAR[a.type],
        )}
      >
        {index + 1}
      </td>
      <td className="py-1.5 pr-3 min-w-[180px]">
        <NameCell
          row={row}
          readOnly={a.readOnly}
          onOpenItems={() => onOpenItems(vendor.id)}
          onNote={a.setNote}
        />
      </td>
      <td className={cn("px-2 py-1.5 text-right", a.type !== "single" && shade)}>
        {a.type === "single" && !draft.legacy ? (
          <Cell
            col="qty"
            label={`Quantity for ${vendor.name}`}
            value={draft.qty}
            onChange={a.setQty}
            disabled={a.readOnly}
          />
        ) : (
          <NotApplicable />
        )}
      </td>
      <td className={cn("px-2 py-1.5 text-right", a.type !== "single" && shade)}>
        {a.type === "single" && !draft.legacy ? (
          <Cell
            col="price"
            label={`Price for ${vendor.name}`}
            value={draft.price}
            placeholder={a.hint ? String(a.hint) : "0"}
            onChange={a.setPrice}
            disabled={a.readOnly}
          />
        ) : (
          <NotApplicable />
        )}
      </td>
      <td className="px-2 py-1.5 text-right">
        {a.type === "value" && !draft.legacy ? (
          <Cell
            col="amount"
            label={`Amount for ${vendor.name}`}
            value={draft.price}
            onChange={a.setPrice}
            disabled={a.readOnly}
            className="border-emerald-300/70"
          />
        ) : (
          <span
            className={cn(
              "tabular-nums",
              a.amount > 0 ? "font-medium" : "text-muted-foreground/50",
            )}
          >
            {inr2(a.amount)}
          </span>
        )}
      </td>
      <td className="px-2 py-1.5 text-right">
        {draft.legacy ? (
          <span className="tabular-nums text-muted-foreground">{inr2(a.paid)}</span>
        ) : (
          <Cell
            col="paid"
            label={`Paid to ${vendor.name}`}
            value={draft.paid ?? ""}
            placeholder={a.amount > 0 ? a.amount.toFixed(2) : "0"}
            onChange={a.setPaid}
            disabled={a.readOnly || a.amount <= 0}
            className={cn(draft.paid === null && "placeholder:text-emerald-700/70")}
          />
        )}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {a.due > 0 ? (
          <span className="font-medium text-amber-700">{inr2(a.due)}</span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </td>
      <td className="px-2 py-1.5 text-center">
        <input
          type="checkbox"
          checked={draft.online}
          disabled={a.readOnly}
          onChange={(e) => a.setOnline(e.target.checked)}
          aria-label={`Paid online to ${vendor.name}`}
          className="h-5 w-5 rounded border-border accent-sky-600 cursor-pointer disabled:cursor-not-allowed"
        />
      </td>
    </tr>
  );
}

function PhoneCard({
  index,
  row,
  locked,
  hints,
  onChange,
  onOpenItems,
}: {
  index: number;
  row: MasterRowData;
  locked: boolean;
  hints: Record<string, number>;
  onChange: Props["onChange"];
  onOpenItems: (id: string) => void;
}) {
  const a = useRowActions(row, locked, hints, onChange);
  const { draft, vendor } = row;
  return (
    <div
      className={cn(
        "rounded-2xl border border-border border-l-4 p-3 shadow-sm",
        BAR[a.type],
        draft.online ? "bg-sky-50/80" : "bg-surface",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">{index + 1}</span>
            <NameCell
              row={row}
              readOnly={a.readOnly}
              onOpenItems={() => onOpenItems(vendor.id)}
              onNote={a.setNote}
            />
          </div>
        </div>
        <div className="text-right shrink-0">
          <div
            className={cn(
              "text-base font-semibold tabular-nums",
              a.amount <= 0 && "text-muted-foreground/50",
            )}
          >
            {inr2(a.amount)}
          </div>
          {a.due > 0 && (
            <div className="text-[11px] font-medium text-amber-700">Due {inr2(a.due)}</div>
          )}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        {a.type === "single" && !draft.legacy && (
          <>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Qty
              <Cell
                col="qty"
                label={`Quantity for ${vendor.name}`}
                value={draft.qty}
                onChange={a.setQty}
                disabled={a.readOnly}
                className="h-11 mt-0.5 text-base"
              />
            </label>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Price
              <Cell
                col="price"
                label={`Price for ${vendor.name}`}
                value={draft.price}
                placeholder={a.hint ? String(a.hint) : "0"}
                onChange={a.setPrice}
                disabled={a.readOnly}
                className="h-11 mt-0.5 text-base"
              />
            </label>
          </>
        )}
        {a.type === "value" && !draft.legacy && (
          <label className="col-span-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            Amount
            <Cell
              col="amount"
              label={`Amount for ${vendor.name}`}
              value={draft.price}
              onChange={a.setPrice}
              disabled={a.readOnly}
              className="h-11 mt-0.5 text-base border-emerald-300/70"
            />
          </label>
        )}
        {(a.type === "multi" || draft.legacy) && (
          <button
            type="button"
            onClick={() => onOpenItems(vendor.id)}
            className="col-span-2 rounded-xl border border-dashed border-primary/40 py-2.5 text-sm font-medium text-primary"
          >
            {draft.legacy ? "View items saved earlier" : "Enter items"} →
          </button>
        )}
        {!draft.legacy && (
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Paid
            <Cell
              col="paid"
              label={`Paid to ${vendor.name}`}
              value={draft.paid ?? ""}
              placeholder={a.amount > 0 ? a.amount.toFixed(2) : "0"}
              onChange={a.setPaid}
              disabled={a.readOnly || a.amount <= 0}
              className="h-11 mt-0.5 text-base"
            />
          </label>
        )}
        <label
          className={cn(
            "flex items-center gap-2 self-end h-11 rounded-md border border-border px-3 text-sm bg-background",
            draft.legacy && "col-span-2",
          )}
        >
          <input
            type="checkbox"
            checked={draft.online}
            disabled={a.readOnly}
            onChange={(e) => a.setOnline(e.target.checked)}
            aria-label={`Paid online to ${vendor.name}`}
            className="h-5 w-5 accent-sky-600"
          />
          Online
        </label>
      </div>
    </div>
  );
}

export function MasterTable({
  rows,
  phone,
  locked,
  priceHints,
  totals,
  onChange,
  onOpenItems,
}: Props) {
  if (phone) {
    return (
      <div className="space-y-2">
        {rows.map((r, i) => (
          <PhoneCard
            key={r.vendor.id}
            index={i}
            row={r}
            locked={locked}
            hints={priceHints}
            onChange={onChange}
            onOpenItems={onOpenItems}
          />
        ))}
        <div className="rounded-2xl border border-border bg-muted/40 p-3 text-sm grid grid-cols-2 gap-y-1">
          <span className="text-muted-foreground">Total</span>
          <span className="text-right font-semibold tabular-nums">{inr2(totals.amount)}</span>
          <span className="text-muted-foreground">Paid</span>
          <span className="text-right tabular-nums text-emerald-700">{inr2(totals.paid)}</span>
          <span className="text-muted-foreground">Due</span>
          <span className="text-right tabular-nums text-amber-700">{inr2(totals.due)}</span>
          <span className="text-muted-foreground">Online</span>
          <span className="text-right tabular-nums text-sky-700">{inr2(totals.online)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-x-auto">
      <table className="w-full text-sm min-w-[860px]">
        <thead>
          <tr className="bg-muted/60 text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="w-10 pl-3 pr-1 py-2 text-left font-semibold">#</th>
            <th className="py-2 pr-3 text-left font-semibold">Vendor</th>
            <th className="w-[96px] px-2 py-2 text-right font-semibold">Qty</th>
            <th className="w-[112px] px-2 py-2 text-right font-semibold">Price</th>
            <th className="w-[140px] px-2 py-2 text-right font-semibold">Amount</th>
            <th className="w-[140px] px-2 py-2 text-right font-semibold">Paid</th>
            <th className="w-[112px] px-2 py-2 text-right font-semibold">Due</th>
            <th className="w-[72px] px-2 py-2 text-center font-semibold">Online</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <TableRow
              key={r.vendor.id}
              index={i}
              row={r}
              locked={locked}
              hints={priceHints}
              onChange={onChange}
              onOpenItems={onOpenItems}
            />
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border bg-muted/50 font-semibold">
            <td />
            <td className="py-2 pr-3">Total</td>
            <td />
            <td />
            <td className="px-2 py-2 text-right tabular-nums">{inr2(totals.amount)}</td>
            <td className="px-2 py-2 text-right tabular-nums text-emerald-700">
              {inr2(totals.paid)}
            </td>
            <td className="px-2 py-2 text-right tabular-nums text-amber-700">{inr2(totals.due)}</td>
            <td
              className="px-2 py-2 text-center text-[11px] tabular-nums text-sky-700"
              title="Paid online"
            >
              {totals.online > 0 ? inr2(totals.online) : "—"}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
