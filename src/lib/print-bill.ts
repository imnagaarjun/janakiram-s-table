// Generates a printable bill HTML and opens a print dialog.
import { inr } from "@/lib/gst";

interface Restaurant {
  name?: string | null;
  address?: string | null;
  gstin?: string | null;
  fssai?: string | null;
  phone?: string | null;
}
interface Line {
  name: string;
  qty: number;
  inclusive_price: number;
  line_total: number;
}
interface Totals {
  base: number;
  cgst: number;
  sgst: number;
  service_charge: number;
  discount: number;
  round_off: number;
  total: number;
}

export function printBill(opts: {
  restaurant: Restaurant;
  invoice_no: string;
  issued_at: string;
  table_label: string;
  pax: number;
  lines: Line[];
  totals: Totals;
  payments: { mode: string; amount: number; ref_no?: string | null }[];
  notes?: string | null;
  duplicate?: boolean;
  waiterName?: string | null;
}) {
  const { restaurant, invoice_no, issued_at, table_label, pax, lines, totals, payments, notes, duplicate, waiterName } = opts;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${invoice_no}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px; color: #000; max-width: 320px; margin: 0 auto; padding: 8px; }
  h1 { font-size: 17px; text-align: center; margin: 0 0 2px; text-transform: uppercase; letter-spacing: 0.5px; }
  .addr { text-align: center; font-size: 12px; margin: 0 0 6px; font-weight: 600; }
  .meta { text-align: center; font-size: 11px; margin-bottom: 8px; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0; }
  th, td { text-align: left; padding: 2px 0; font-size: 11px; }
  th:last-child, td:last-child { text-align: right; }
  th { border-bottom: 1px dashed #000; }
  .totals { margin-top: 6px; border-top: 1px dashed #000; padding-top: 6px; }
  .grand { font-weight: bold; font-size: 14px; border-top: 1px solid #000; padding-top: 4px; margin-top: 4px; }
  .footer { text-align: center; font-size: 10px; margin-top: 10px; }
  .dup { text-align: center; font-weight: bold; border: 2px solid #000; padding: 2px; margin-bottom: 6px; }
</style></head><body>
${duplicate ? `<div class="dup">DUPLICATE / REPRINT</div>` : ""}
<h1>${escape(restaurant.name ?? "—")}</h1>
<div class="meta">
  ${escape(restaurant.address ?? "")}<br>
  ${restaurant.phone ? `Ph: ${escape(restaurant.phone)} · ` : ""}${restaurant.gstin ? `GSTIN: ${escape(restaurant.gstin)}` : ""}
  ${restaurant.fssai ? `<br>FSSAI: ${escape(restaurant.fssai)}` : ""}
</div>
<div class="row"><span>Bill: <b>${invoice_no}</b></span><span>${new Date(issued_at).toLocaleString()}</span></div>
<div class="row"><span>${table_label}</span><span>Pax: ${pax}</span></div>
<table>
  <thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amt</th></tr></thead>
  <tbody>
    ${lines
      .map(
        (l) =>
          `<tr><td>${escape(l.name)}</td><td style="text-align:right">${l.qty}</td><td style="text-align:right">${l.inclusive_price.toFixed(2)}</td><td>${l.line_total.toFixed(2)}</td></tr>`,
      )
      .join("")}
  </tbody>
</table>
<div class="totals">
  <div class="row"><span>Taxable</span><span>${inr(totals.base - totals.service_charge)}</span></div>
  ${totals.service_charge > 0 ? `<div class="row"><span>Service</span><span>${inr(totals.service_charge)}</span></div>` : ""}
  <div class="row"><span>CGST</span><span>${inr(totals.cgst)}</span></div>
  <div class="row"><span>SGST</span><span>${inr(totals.sgst)}</span></div>
  ${totals.discount > 0 ? `<div class="row"><span>Discount</span><span>− ${inr(totals.discount)}</span></div>` : ""}
  <div class="row"><span>Round off</span><span>${inr(totals.round_off)}</span></div>
  <div class="row grand"><span>TOTAL</span><span>${inr(totals.total)}</span></div>
</div>
${
  payments.length
    ? `<div style="margin-top:6px"><b>Paid</b><br>${payments
        .map((p) => `<div class="row"><span>${escape(p.mode.toUpperCase())}${p.ref_no ? " · " + escape(p.ref_no) : ""}</span><span>${inr(p.amount)}</span></div>`)
        .join("")}</div>`
    : ""
}
${notes ? `<div style="margin-top:6px">${escape(notes)}</div>` : ""}
<div class="footer">Thank you. Visit again!</div>
<script>window.onload=()=>{setTimeout(()=>{window.print();},100);}</script>
</body></html>`;
  const w = window.open("", "_blank", "width=380,height=600");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

function escape(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}
