export function num(s: string): number {
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

// Whole rupees without ".00" keeps narrow phone columns readable.
export const inr = (n: number) =>
  `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;

// Table amounts keep two decimals, like a ledger.
export const inr2 = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
