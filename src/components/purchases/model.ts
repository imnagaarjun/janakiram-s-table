import { num, round2 } from "./numbers";

export type PayMode = "cash" | "online";
// single = quantity x price, value = just an amount, multi = several items (its own table)
export type VendorType = "single" | "value" | "multi";

export interface Vendor {
  id: string;
  name: string;
  is_multi_product: boolean;
  is_fixed_amount: boolean;
  default_category_id: string | null;
  is_active: boolean;
  display_order: number;
  is_adhoc?: boolean;
}

export interface VendorProduct {
  id: string;
  vendor_id: string;
  name: string;
  unit: string;
  price_mode: "fixed" | "variable";
  fixed_price: number | null;
  is_active: boolean;
  display_order: number;
}

export interface PurchaseLine {
  id: string;
  business_date: string;
  vendor_id: string;
  vendor_product_id: string | null;
  description: string | null;
  qty: number;
  unit_price: number;
  amount: number;
  pay_mode: PayMode;
  paid_amount: number;
  due_amount: number;
  note: string | null;
  unit: string | null;
  is_adhoc: boolean;
}

// One item of a multi-product vendor for the day (a catalogue product, or a day-only item).
export interface ItemRow {
  uid: string;
  productId: string | null;
  name: string;
  unit: string;
  qty: string;
  price: string;
  fixedPrice: boolean;
  adhoc: boolean;
}

// A day saved in a different shape than the vendor's current type: shown, never edited or lost.
export interface LegacyInfo {
  amount: number;
  paid: number;
  lines: { name: string; qty: number; unit: string; price: number; amount: number }[];
}

// Everything editable about one vendor on the day sheet.
export interface VendorDraft {
  type: VendorType;
  qty: string; // single
  price: string; // single: unit price; value: the amount
  note: string; // single / value
  items: ItemRow[]; // multi
  paid: string | null; // null = paid in full (follows the amount)
  online: boolean;
  legacy: LegacyInfo | null;
}

export function vendorType(v: Pick<Vendor, "is_multi_product" | "is_fixed_amount">): VendorType {
  return v.is_multi_product ? "multi" : v.is_fixed_amount ? "value" : "single";
}

export function itemAmount(r: Pick<ItemRow, "qty" | "price">): number {
  const q = num(r.qty);
  const p = num(r.price);
  return q > 0 && p > 0 ? round2(q * p) : 0;
}

export function draftAmount(d: VendorDraft): number {
  if (d.legacy) return d.legacy.amount;
  if (d.type === "multi") return round2(d.items.reduce((s, r) => s + itemAmount(r), 0));
  if (d.type === "value") return num(d.price) > 0 ? round2(num(d.price)) : 0;
  const q = num(d.qty);
  const p = num(d.price);
  return q > 0 && p > 0 ? round2(q * p) : 0;
}

export function draftPaid(d: VendorDraft): number {
  if (d.legacy) return d.legacy.paid;
  const a = draftAmount(d);
  if (d.paid === null) return a;
  return round2(Math.min(Math.max(num(d.paid), 0), a));
}

export function draftDue(d: VendorDraft): number {
  return round2(draftAmount(d) - draftPaid(d));
}

export function emptyDraft(v: Vendor): VendorDraft {
  return {
    type: vendorType(v),
    qty: "",
    price: "",
    note: "",
    items: [],
    paid: null,
    online: false,
    legacy: null,
  };
}

// Rebuilds the editable state of a vendor from what is saved for the day.
export function buildVendorDraft(
  v: Vendor,
  prods: VendorProduct[],
  vLines: PurchaseLine[],
): VendorDraft {
  const type = vendorType(v);
  const d = emptyDraft(v);
  const amount = round2(vLines.reduce((s, l) => s + Number(l.amount), 0));
  const paid = round2(vLines.reduce((s, l) => s + Number(l.paid_amount), 0));
  d.online = vLines[0]?.pay_mode === "online";
  d.paid = vLines.length === 0 || paid >= amount ? null : String(paid);

  if (type !== "multi") {
    // Exactly one plain line is the normal shape. Anything else was saved as an itemised day
    // under an earlier vendor type: keep it visible and untouched.
    const normal = vLines.length === 0 || (vLines.length === 1 && !vLines[0].vendor_product_id);
    if (!normal) {
      d.legacy = {
        amount,
        paid,
        lines: vLines.map((l) => ({
          name: l.description ?? prods.find((p) => p.id === l.vendor_product_id)?.name ?? "—",
          qty: Number(l.qty),
          unit: l.unit ?? prods.find((p) => p.id === l.vendor_product_id)?.unit ?? "",
          price: Number(l.unit_price),
          amount: Number(l.amount),
        })),
      };
      return d;
    }
    const l = vLines[0];
    if (l) {
      d.qty = type === "value" ? "" : String(l.qty);
      d.price = String(type === "value" ? l.amount : l.unit_price);
      d.note = l.description ?? "";
    }
    return d;
  }

  const used = new Set<string>();
  d.items = prods.map((pr) => {
    const ex = vLines.find((x) => x.vendor_product_id === pr.id && !used.has(x.id));
    if (ex) used.add(ex.id);
    return {
      uid: pr.id,
      productId: pr.id,
      name: pr.name,
      unit: pr.unit,
      qty: ex ? String(ex.qty) : "",
      // A saved line keeps the price it was saved at, even if the catalogue price changed later.
      price: ex
        ? String(ex.unit_price)
        : pr.price_mode === "fixed"
          ? String(pr.fixed_price ?? 0)
          : "",
      fixedPrice: pr.price_mode === "fixed",
      adhoc: false,
    };
  });
  // Day-only items, and any saved line that doesn't match a catalogue product, stay as rows.
  for (const l of vLines) {
    if (used.has(l.id)) continue;
    d.items.push({
      uid: l.id,
      productId: null,
      name: l.description ?? prods.find((p) => p.id === l.vendor_product_id)?.name ?? "",
      unit: l.unit || "Nos",
      qty: String(l.qty),
      price: String(l.unit_price),
      fixedPrice: false,
      adhoc: true,
    });
  }
  return d;
}

export interface PayloadLine {
  vendor_product_id: string | null;
  qty: number;
  unit_price: number;
  pay_mode: PayMode;
  paid_amount: number;
  description: string | null;
  unit?: string;
  is_adhoc?: boolean;
}

// The lines to save for a vendor's day, or an error to show. Vendor-level "paid" is shared
// across the items in order.
export function buildPayload(
  v: Vendor,
  d: VendorDraft,
): { lines: PayloadLine[]; error?: string; skip?: boolean } {
  if (d.legacy) return { lines: [], skip: true };
  const mode: PayMode = d.online ? "online" : "cash";
  const amount = draftAmount(d);
  const paid = draftPaid(d);
  const adhocFlag = v.is_adhoc ? { is_adhoc: true } : {};

  if (d.type === "single") {
    if (amount <= 0) return { lines: [] };
    return {
      lines: [
        {
          vendor_product_id: null,
          qty: num(d.qty),
          unit_price: num(d.price),
          pay_mode: mode,
          paid_amount: paid,
          description: d.note.trim() || null,
          ...adhocFlag,
        },
      ],
    };
  }
  if (d.type === "value") {
    if (amount <= 0) return { lines: [] };
    return {
      lines: [
        {
          vendor_product_id: null,
          qty: 1,
          unit_price: amount,
          pay_mode: mode,
          paid_amount: paid,
          description: d.note.trim() || null,
          ...adhocFlag,
        },
      ],
    };
  }

  const rows = d.items.filter((r) => itemAmount(r) > 0);
  if (rows.some((r) => r.adhoc && !r.name.trim())) {
    return { lines: [], error: `${v.name}: give the item you added a name` };
  }
  let remaining = paid;
  return {
    lines: rows.map((r) => {
      const a = itemAmount(r);
      const p = round2(Math.min(remaining, a));
      remaining = round2(remaining - p);
      return {
        vendor_product_id: r.productId,
        qty: num(r.qty),
        unit_price: num(r.price),
        pay_mode: mode,
        paid_amount: p,
        description: r.adhoc ? r.name.trim() : null,
        ...(r.adhoc ? { unit: r.unit || "Nos", is_adhoc: true } : {}),
      };
    }),
  };
}

// ---- sign-off (unchanged behaviour) -------------------------------------------------------

export interface Approval {
  checked_by_name: string | null;
  checked_at: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  corrected_by_name: string | null;
  corrected_at: string | null;
  revised_by_name: string | null;
  revised_at: string | null;
}

export type Stage = "open" | "checked" | "approved";
export type SignoffAction = "check" | "approve" | "sendback" | "reopen";

export const SIGNOFF_RPC: Record<SignoffAction, string> = {
  check: "check_purchase_day",
  approve: "approve_purchase_day",
  sendback: "send_back_purchase_day",
  reopen: "reopen_purchase_day",
};
export const SIGNOFF_DONE: Record<SignoffAction, string> = {
  check: "Day checked",
  approve: "Day approved",
  sendback: "Sent back for correction",
  reopen: "Day reopened",
};

export const stageOf = (a: Approval | null): Stage =>
  !a?.checked_by_name ? "open" : a.approved_by_name ? "approved" : "checked";

export const fmtTime = (ts: string) =>
  new Date(ts).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

export function friendlyApproval(message: string): string {
  if (message.includes("DAY_APPROVED"))
    return "This day is approved. Only the admin can change it.";
  if (message.includes("DAY_CHECKED"))
    return "This day has been checked. Only people who can approve it (or the admin) can correct it.";
  if (message.includes("NOT_ALLOWED")) return "You don't have permission to do this.";
  if (message.includes("ALREADY_CHECKED")) return "This day is already checked.";
  if (message.includes("ALREADY_APPROVED")) return "This day is already approved.";
  if (message.includes("NOT_CHECKED")) return "Check the day before approving it.";
  if (message.includes("FUTURE_DATE")) return "You can't sign off a day that hasn't happened yet.";
  if (message.includes("NOT_APPROVED")) return "This day isn't approved.";
  return message;
}

export function todayIST(): string {
  const d = new Date();
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const ist = new Date(utc + 5.5 * 3600 * 1000);
  return ist.toISOString().slice(0, 10);
}

export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
