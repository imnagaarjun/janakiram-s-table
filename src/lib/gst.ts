// GST-inclusive price splitter.
// Given inclusive price and rate (e.g. 5 = 5%), returns base, cgst, sgst, total.
export interface PriceSplit {
  inclusive: number;
  base: number;
  cgst: number;
  sgst: number;
  total: number;
}

export function splitInclusive(inclusive: number, gstRate: number): PriceSplit {
  const r = Number.isFinite(gstRate) ? gstRate : 0;
  const inc = Number.isFinite(inclusive) ? inclusive : 0;
  const base = inc / (1 + r / 100);
  const gst = inc - base;
  const cgst = gst / 2;
  const sgst = gst / 2;
  return {
    inclusive: round2(inc),
    base: round2(base),
    cgst: round2(cgst),
    sgst: round2(sgst),
    total: round2(inc),
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function inr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `₹${n.toFixed(2)}`;
}
