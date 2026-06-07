// Bill computation helpers (server is source of truth; client mirrors for preview).
export interface BillLine {
  menu_item_id: string;
  name: string;
  qty: number;
  inclusive_price: number;
  base_price: number;
  gst_rate: number;
  line_total: number; // qty * inclusive_price
}

export interface BillTotals {
  base: number;
  cgst: number;
  sgst: number;
  gross: number; // base + cgst + sgst (pre-discount, pre-service)
  service_charge: number;
  discount: number;
  round_off: number;
  total: number; // rounded to ₹1
}

export interface BillInputs {
  service_charge_pct: number;
  discount_amt: number;
  discount_pct: number;
  complimentary: boolean;
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function computeBill(lines: BillLine[], inp: BillInputs): BillTotals {
  let base = 0,
    cgst = 0,
    sgst = 0,
    gross = 0;
  for (const l of lines) {
    base += l.qty * l.base_price;
    const gst = l.qty * (l.base_price * l.gst_rate) / 100;
    cgst += gst / 2;
    sgst += gst / 2;
    gross += l.qty * l.inclusive_price;
  }
  const svc = round2((base * inp.service_charge_pct) / 100);
  let disc = inp.discount_amt;
  if (disc <= 0 && inp.discount_pct > 0) disc = round2(((gross + svc) * inp.discount_pct) / 100);
  if (inp.complimentary) disc = round2(gross + svc);

  const preTax = gross + svc;
  const ratio = preTax <= 0 ? 0 : Math.max(0, 1 - Math.min(disc, preTax) / preTax);
  const newBase = round2((base + svc) * ratio);
  const newCgst = round2(cgst * ratio);
  const newSgst = round2(sgst * ratio);
  let total = newBase + newCgst + newSgst;
  const round_off = round2(Math.round(total) - total);
  total = round2(total + round_off);

  return {
    base: round2(base),
    cgst: round2(cgst),
    sgst: round2(sgst),
    gross: round2(gross),
    service_charge: svc,
    discount: round2(disc),
    round_off,
    total,
  };
}
