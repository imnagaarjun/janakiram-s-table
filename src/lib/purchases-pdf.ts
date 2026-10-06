export interface PurchasesPdfRow {
  item: string;
  qty: number;
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
}

// Standard PDF fonts have no rupee glyph, so amounts are written as "Rs.".
const money = (n: number) =>
  `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const qtyFmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 3 });

export async function downloadPurchasesPdf(input: PurchasesPdfInput) {
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
        qtyFmt(r.qty),
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

  const pages = doc.getNumberOfPages();
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(120);
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.text(`Page ${i} of ${pages}`, pageW - margin, pageH - 18, { align: "right" });
  }

  doc.save(`daily-purchases-${input.date}.pdf`);
}
