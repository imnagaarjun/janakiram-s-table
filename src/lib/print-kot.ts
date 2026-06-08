// Generates a KOT print HTML (no prices) and opens a print dialog.
import { escapeHtml } from "@/lib/utils";

interface KotLine {
  name: string;
  qty: number;
  note?: string | null;
}

export function printKOT(opts: {
  restaurantName?: string | null;
  kotNo: string;
  sentAt: string;
  tableLabel: string;
  pax: number;
  lines: KotLine[];
  note?: string | null;
}) {
  const { restaurantName, kotNo, sentAt, tableLabel, pax, lines, note } = opts;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>KOT ${kotNo}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 13px; color: #000; max-width: 320px; margin: 0 auto; padding: 8px; }
  h1 { font-size: 18px; text-align: center; margin: 0 0 4px; font-weight: bold; }
  .meta { text-align: center; font-size: 11px; margin-bottom: 8px; }
  .row { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th, td { text-align: left; padding: 3px 0; font-size: 13px; }
  th { border-bottom: 1px dashed #000; }
  td:last-child { text-align: right; font-weight: bold; }
  .note { font-size: 11px; font-style: italic; margin-top: 4px; border-top: 1px dashed #000; padding-top: 4px; }
  .footer { text-align: center; font-size: 10px; margin-top: 12px; }
</style></head><body>
<h1>KITCHEN ORDER TICKET</h1>
${restaurantName ? `<div class="meta">${escapeHtml(restaurantName)}</div>` : ""}
<div class="row"><span><b>${escapeHtml(kotNo)}</b></span><span>${new Date(sentAt).toLocaleString()}</span></div>
<div class="row"><span>${escapeHtml(tableLabel)}</span><span>Pax: ${pax}</span></div>
<table>
  <thead><tr><th>Item</th><th>Qty</th></tr></thead>
  <tbody>
    ${lines
      .map(
        (l) =>
          `<tr><td>${escapeHtml(l.name)}${l.note ? ` <span style="font-size:11px;font-style:italic">(${escapeHtml(l.note)})</span>` : ""}</td><td>${l.qty}</td></tr>`
      )
      .join("")}
  </tbody>
</table>
${note ? `<div class="note">Note: ${escapeHtml(note)}</div>` : ""}
<div class="footer">Hotel Sri Janakiram · KOT</div>
<script>window.onload=()=>{setTimeout(()=>{window.print();},100);}</script>
</body></html>`;

  const w = window.open("", "_blank", "width=380,height=600");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
