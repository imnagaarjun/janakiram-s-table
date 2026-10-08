// Where a cash-flow line's figure can come from. "manual" is typed each day; the rest are filled
// in automatically. Add a source here when a feature starts providing the number.
export type CashSource =
  "manual" | "auto_cash_expense" | "auto_sales" | "auto_gpay" | "auto_card" | "auto_swiggy";

export interface CashSourceInfo {
  id: Exclude<CashSource, "manual">;
  label: string;
  group: string;
  hint: string;
  // Ready today. The rest wait for billing; they stay selectable only on lines that already use them.
  available: boolean;
}

export const AUTO_SOURCES: CashSourceInfo[] = [
  {
    id: "auto_cash_expense",
    label: "Cash expenses",
    group: "Daily Purchases",
    hint: "Cash paid to vendors that day, for vendors set to this cash point",
    available: true,
  },
  {
    id: "auto_sales",
    label: "Total sales",
    group: "Billing",
    hint: "Settled bills",
    available: false,
  },
  {
    id: "auto_gpay",
    label: "GPay / UPI sales",
    group: "Billing",
    hint: "Bills paid by UPI",
    available: false,
  },
  {
    id: "auto_card",
    label: "Card sales",
    group: "Billing",
    hint: "Bills paid by card",
    available: false,
  },
  { id: "auto_swiggy", label: "Swiggy", group: "Billing", hint: "Swiggy orders", available: false },
];

export function sourceInfo(id: CashSource): CashSourceInfo | undefined {
  return AUTO_SOURCES.find((s) => s.id === id);
}
