export interface PurchasesPdfRow {
  item: string;
  qty: number;
  unit?: string;
  price: number;
  amount: number;
  paid: number;
  due: number;
  mode: "cash" | "online";
}

export interface PurchasesPdfInput {
  restaurant: string;
  date: string;
  groups: { vendor: string; rows: PurchasesPdfRow[] }[];
  totals: { gross: number; cash: number; online: number; due: number };
  outstanding: { vendor: string; due: number }[];
  approval: {
    checkedBy: string;
    checkedAt: string;
    approvedBy: string;
    approvedAt: string;
    correctedBy?: string;
    correctedAt?: string;
    revisedBy?: string;
    revisedAt?: string;
  };
}

// Standard PDF fonts have no rupee glyph, so amounts are written as "Rs.".
const money = (n: number) =>
  `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const qtyFmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 3 });

async function buildPurchasesPdf(input: PurchasesPdfInput) {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableMod.default;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 36;
  const prettyDate = new Date(`${input.date}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(input.restaurant, margin, 44);
  doc.setFontSize(12);
  doc.text("Daily Purchases", margin, 62);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(21, 128, 61);
  doc.text("APPROVED", pageW - margin, 44, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(prettyDate, pageW - margin, 62, { align: "right" });
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 78,
    margin: { left: margin, right: margin },
    theme: "grid",
    head: [["Gross purchases", "Cash paid", "Online paid", "Due today"]],
    body: [
      [
        money(input.totals.gross),
        money(input.totals.cash),
        money(input.totals.online),
        money(input.totals.due),
      ],
    ],
    styles: { fontSize: 9, halign: "center" },
    headStyles: { fillColor: [241, 245, 249], textColor: 60 },
  });

  type Cell = string | { content: string; colSpan?: number; styles?: Record<string, unknown> };
  const body: Cell[][] = [];
  if (input.groups.length === 0) {
    body.push([
      {
        content: "No purchases recorded for this day.",
        colSpan: 7,
        styles: { halign: "center", textColor: 120 },
      },
    ]);
  }
  for (const g of input.groups) {
    body.push([
      {
        content: g.vendor,
        colSpan: 7,
        styles: { fontStyle: "bold", fillColor: [238, 242, 255] },
      },
    ]);
    let a = 0;
    let p = 0;
    let d = 0;
    for (const r of g.rows) {
      a += r.amount;
      p += r.paid;
      d += r.due;
      body.push([
        r.item,
        `${qtyFmt(r.qty)}${r.unit ? ` ${r.unit}` : ""}`,
        money(r.price),
        money(r.amount),
        money(r.paid),
        r.due > 0 ? money(r.due) : "-",
        r.mode === "cash" ? "Cash" : "Online",
      ]);
    }
    const bold = { fontStyle: "bold" };
    body.push([
      { content: "Subtotal", colSpan: 3, styles: { ...bold, halign: "right" } },
      { content: money(a), styles: bold },
      { content: money(p), styles: bold },
      { content: d > 0 ? money(d) : "-", styles: bold },
      "",
    ]);
  }

  autoTable(doc, {
    startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14,
    margin: { left: margin, right: margin },
    theme: "grid",
    head: [["Item", "Qty", "Price", "Amount", "Paid", "Due", "Mode"]],
    body: body as never,
    foot: [
      [
        { content: "Total", colSpan: 3, styles: { halign: "right" } },
        money(input.totals.gross),
        money(input.totals.cash + input.totals.online),
        money(input.totals.due),
        "",
      ],
    ] as never,
    styles: { fontSize: 8.5, cellPadding: 4 },
    headStyles: { fillColor: [30, 64, 175] },
    footStyles: { fillColor: [241, 245, 249], textColor: 0, fontStyle: "bold" },
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
    },
    showFoot: "lastPage",
  });

  if (input.outstanding.length > 0) {
    const total = input.outstanding.reduce((s, x) => s + x.due, 0);
    autoTable(doc, {
      startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18,
      margin: { left: margin, right: margin },
      theme: "grid",
      head: [["Outstanding vendor dues", "Amount owed"]],
      body: input.outstanding.map((o) => [o.vendor, money(o.due)]),
      foot: [["Total outstanding", money(total)]],
      styles: { fontSize: 8.5, cellPadding: 4 },
      headStyles: { fillColor: [180, 83, 9] },
      footStyles: { fillColor: [254, 243, 199], textColor: 0, fontStyle: "bold" },
      columnStyles: { 1: { halign: "right" } },
    });
  }

  const pageH = doc.internal.pageSize.getHeight();
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 30;
  if (y > pageH - 90) {
    doc.addPage();
    y = 60;
  }
  doc.setDrawColor(180);
  doc.line(margin, y - 12, pageW - margin, y - 12);
  const ap = input.approval;
  const colB = margin + (pageW - margin * 2) / 2;
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`Checked by: ${ap.checkedBy}`, margin, y);
  doc.text(`Approved by: ${ap.approvedBy}`, colB, y);
  doc.setFont("helvetica", "normal");
  doc.text(`Checked on: ${ap.checkedAt}`, margin, y + 15);
  doc.text(`Approved on: ${ap.approvedAt}`, colB, y + 15);
  doc.setTextColor(180, 83, 9);
  let noteY = y + 32;
  if (ap.correctedBy) {
    doc.text(
      `Corrected after checking by ${ap.correctedBy}${ap.correctedAt ? `, ${ap.correctedAt}` : ""}`,
      margin,
      noteY,
    );
    noteY += 14;
  }
  if (ap.revisedBy) {
    doc.text(
      `Revised after approval by ${ap.revisedBy}${ap.revisedAt ? `, ${ap.revisedAt}` : ""}`,
      margin,
      noteY,
    );
  }

  const pages = doc.getNumberOfPages();
  doc.setFontSize(8);
  doc.setTextColor(120);
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.text(`Page ${i} of ${pages}`, pageW - margin, pageH - 18, { align: "right" });
  }

  return doc;
}

export async function downloadPurchasesPdf(input: PurchasesPdfInput) {
  const doc = await buildPurchasesPdf(input);
  doc.save(`daily-purchases-${input.date}.pdf`);
}

// Opens the browser print dialog for the same PDF, without leaving the page.
export async function printPurchasesPdf(input: PurchasesPdfInput) {
  const doc = await buildPurchasesPdf(input);
  doc.autoPrint();
  const url = URL.createObjectURL(doc.output("blob"));
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  frame.src = url;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => {
      frame.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
  };
  document.body.appendChild(frame);
}
