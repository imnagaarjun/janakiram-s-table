// Daily purchases PDF / print.
//
// A real vector PDF (selectable text, small file) built with pdfmake. Noto Sans Tamil is
// embedded, and pdfmake shapes Tamil correctly, so Tamil vendor names, English names, digits and
// the ₹ sign all come out right. Page 1 is always the master table fitted onto one page with the
// sign-off block under it; the multi-product vendors' item tables follow on the next pages.

export interface MasterPdfRow {
  sno: number;
  vendor: string;
  qty: number | null;
  price: number | null;
  amount: number;
  paid: number;
  due: number;
  online: boolean;
}

export interface DetailPdfGroup {
  vendor: string;
  rows: { item: string; qty: number; unit: string; price: number; amount: number }[];
}

export interface PurchasesPdfInput {
  restaurant: string;
  date: string;
  master: MasterPdfRow[];
  details: DetailPdfGroup[];
  totals: { gross: number; cash: number; online: number; due: number };
  outstanding: { vendor: string; due: number }[];
  approval: {
    checkedBy: string;
    checkedAt: string;
    approvedBy?: string;
    approvedAt?: string;
    correctedBy?: string;
    correctedAt?: string;
    revisedBy?: string;
    revisedAt?: string;
  };
}

const money = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qtyFmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 3 });

const C = {
  head: "#1e3a8a",
  zebra: "#f8fafc",
  online: "#e0f2fe",
  line: "#e2e8f0",
  muted: "#64748b",
  faint: "#cbd5e1",
  foot: "#f1f5f9",
  amber: "#b45309",
  green: "#047857",
  blue: "#0369a1",
};

const MARGIN = 32;

type Cell = Record<string, unknown>;
const cell = (text: string, o: Cell = {}): Cell => ({ text, ...o });

// ---- fonts (bundled as assets; loaded once, only when someone exports) ----------------------

let fontsReady: Promise<void> | null = null;

async function toBase64(url: string): Promise<string> {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) {
    s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

async function loadPdfMake() {
  const mod = await import("pdfmake/build/pdfmake");
  const pdfMake = ((mod as { default?: unknown }).default ?? mod) as (typeof mod)["default"];
  if (!fontsReady) {
    fontsReady = (async () => {
      const [{ default: regular }, { default: bold }] = await Promise.all([
        import("@/assets/fonts/NotoSansTamil-Regular.ttf?url"),
        import("@/assets/fonts/NotoSansTamil-Bold.ttf?url"),
      ]);
      const [r, b] = await Promise.all([toBase64(regular), toBase64(bold)]);
      pdfMake.addVirtualFileSystem({ "NotoSansTamil-Regular.ttf": r, "NotoSansTamil-Bold.ttf": b });
      pdfMake.addFonts({
        Noto: {
          normal: "NotoSansTamil-Regular.ttf",
          bold: "NotoSansTamil-Bold.ttf",
          italics: "NotoSansTamil-Regular.ttf",
          bolditalics: "NotoSansTamil-Bold.ttf",
        },
      });
    })().catch((e) => {
      fontsReady = null;
      throw e;
    });
  }
  await fontsReady;
  return pdfMake;
}

// ---- content --------------------------------------------------------------------------------

function headerBlock(input: PurchasesPdfInput): unknown {
  const approved = !!input.approval.approvedBy;
  const pretty = new Date(`${input.date}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return {
    columns: [
      {
        width: "*",
        stack: [
          { text: input.restaurant, fontSize: 18, bold: true },
          { text: "Daily Purchases", fontSize: 12, bold: true, margin: [0, 2, 0, 0] },
        ],
      },
      {
        width: "auto",
        alignment: "right",
        stack: [
          {
            text: approved ? "APPROVED" : "CHECKED · AWAITING APPROVAL",
            fontSize: 10,
            bold: true,
            color: approved ? "#15803d" : C.blue,
          },
          { text: pretty, fontSize: 11, color: "#475569", margin: [0, 2, 0, 0] },
        ],
      },
    ],
  };
}

function summaryBlock(t: PurchasesPdfInput["totals"]): unknown {
  const box = (label: string, value: string, color?: string): unknown => ({
    stack: [
      { text: label.toUpperCase(), fontSize: 7, color: C.muted, characterSpacing: 0.5 },
      { text: value, fontSize: 12, bold: true, color: color ?? "#111827" },
    ],
  });
  return {
    margin: [0, 10, 0, 10],
    table: {
      widths: ["*", "*", "*", "*"],
      body: [
        [
          box("Purchases", money(t.gross)),
          box("Cash paid", money(t.cash), C.green),
          box("Online paid", money(t.online), C.blue),
          box("Due", money(t.due), t.due > 0 ? C.amber : undefined),
        ],
      ],
    },
    layout: {
      hLineColor: () => C.line,
      vLineColor: () => C.line,
      paddingLeft: () => 8,
      paddingRight: () => 8,
      paddingTop: () => 5,
      paddingBottom: () => 5,
    },
  };
}

function masterTable(
  rows: MasterPdfRow[],
  totals: PurchasesPdfInput["totals"],
  fs: number,
  padV: number,
): unknown {
  const th = (t: string, align = "right"): Cell =>
    cell(t, { bold: true, color: "#ffffff", alignment: align, fontSize: fs });
  const dash = (align = "right"): Cell =>
    cell("—", { color: C.faint, alignment: align, fontSize: fs });
  const body: Cell[][] = [
    [
      th("#", "left"),
      th("Vendor", "left"),
      th("Qty"),
      th("Price"),
      th("Amount"),
      th("Paid"),
      th("Due"),
      th("Mode", "center"),
    ],
  ];
  for (const r of rows) {
    body.push([
      cell(String(r.sno), { color: C.muted, fontSize: fs }),
      cell(r.vendor, { fontSize: fs }),
      r.qty != null ? cell(qtyFmt(r.qty), { alignment: "right", fontSize: fs }) : dash(),
      r.price != null ? cell(money(r.price), { alignment: "right", fontSize: fs }) : dash(),
      cell(money(r.amount), { alignment: "right", bold: true, fontSize: fs }),
      cell(money(r.paid), { alignment: "right", fontSize: fs }),
      r.due > 0
        ? cell(money(r.due), { alignment: "right", bold: true, color: C.amber, fontSize: fs })
        : dash(),
      cell(r.online ? "Online" : "Cash", {
        alignment: "center",
        fontSize: Math.max(fs - 1, 6),
        color: r.online ? C.blue : C.muted,
      }),
    ]);
  }
  const f = (t: string, align = "right"): Cell =>
    cell(t, { bold: true, alignment: align, fontSize: fs });
  body.push([
    f("", "left"),
    f("Total", "left"),
    f(""),
    f(""),
    f(money(totals.gross)),
    f(money(totals.cash + totals.online)),
    f(money(totals.due)),
    f("", "center"),
  ]);
  const last = body.length - 1;
  return {
    table: { headerRows: 1, widths: [20, "*", 40, 54, 68, 68, 58, 38], body },
    layout: {
      hLineWidth: (i: number) => (i === 0 || i === last ? 1 : 0.4),
      hLineColor: (i: number) => (i === last ? "#94a3b8" : C.line),
      vLineWidth: () => 0,
      paddingLeft: () => 4,
      paddingRight: () => 4,
      paddingTop: () => padV,
      paddingBottom: () => padV,
      fillColor: (i: number) =>
        i === 0
          ? C.head
          : i === last
            ? C.foot
            : rows[i - 1]?.online
              ? C.online
              : i % 2 === 0
                ? C.zebra
                : null,
    },
  };
}

function approvalBlock(a: PurchasesPdfInput["approval"]): unknown {
  const col = (title: string, name: string, at: string): unknown => ({
    width: "*",
    stack: [
      { text: title.toUpperCase(), fontSize: 7, color: C.muted, characterSpacing: 0.5 },
      { text: name, fontSize: 11, bold: true, margin: [0, 2, 0, 0] },
      { text: at, fontSize: 9, color: "#475569" },
    ],
  });
  const notes: unknown[] = [];
  if (a.correctedBy)
    notes.push({
      text: `Corrected after checking by ${a.correctedBy}${a.correctedAt ? `, ${a.correctedAt}` : ""}`,
      fontSize: 9,
      color: C.amber,
    });
  if (a.revisedBy)
    notes.push({
      text: `Revised after approval by ${a.revisedBy}${a.revisedAt ? `, ${a.revisedAt}` : ""}`,
      fontSize: 9,
      color: C.amber,
    });
  return {
    unbreakable: true,
    margin: [0, 12, 0, 0],
    stack: [
      {
        canvas: [
          {
            type: "line",
            x1: 0,
            y1: 0,
            x2: 595.28 - MARGIN * 2,
            y2: 0,
            lineWidth: 0.7,
            lineColor: "#94a3b8",
          },
        ],
      },
      {
        margin: [0, 8, 0, 0],
        columns: [
          col("Checked by", a.checkedBy, a.checkedAt),
          a.approvedBy
            ? col("Approved by", a.approvedBy, a.approvedAt ?? "")
            : col("Approval", "Pending", ""),
        ],
      },
      ...(notes.length ? [{ margin: [0, 6, 0, 0], stack: notes }] : []),
    ],
  };
}

function detailTable(
  title: string,
  widths: unknown[],
  head: Cell[],
  rows: Cell[][],
  foot: Cell[],
): unknown {
  const body: Cell[][] = [
    [
      cell(title, { bold: true, fontSize: 11, colSpan: head.length, margin: [0, 0, 0, 2] }),
      ...head.slice(1).map(() => ({})),
    ],
    head,
    ...rows,
    foot,
  ];
  const last = body.length - 1;
  return {
    margin: [0, 10, 0, 0],
    table: { headerRows: 2, keepWithHeaderRows: 1, dontBreakRows: true, widths, body },
    layout: {
      hLineWidth: (i: number) => (i <= 1 ? 0 : i === last ? 0.8 : 0.4),
      hLineColor: (i: number) => (i === last ? "#94a3b8" : C.line),
      vLineWidth: () => 0,
      paddingLeft: () => 5,
      paddingRight: () => 5,
      paddingTop: () => 3,
      paddingBottom: () => 3,
      fillColor: (i: number) => (i === 1 ? "#e2e8f0" : i === last ? C.foot : null),
    },
  };
}

function detailsContent(input: PurchasesPdfInput): unknown[] {
  const out: unknown[] = [];
  const th = (t: string, align = "right"): Cell =>
    cell(t.toUpperCase(), { bold: true, fontSize: 8, alignment: align, characterSpacing: 0.3 });
  for (const g of input.details) {
    const total = g.rows.reduce((s, r) => s + r.amount, 0);
    out.push(
      detailTable(
        g.vendor,
        ["*", 80, 80, 90],
        [th("Item", "left"), th("Qty"), th("Price"), th("Amount")],
        g.rows.map((r) => [
          cell(r.item, { fontSize: 9 }),
          cell(`${qtyFmt(r.qty)}${r.unit ? ` ${r.unit}` : ""}`, {
            alignment: "right",
            fontSize: 9,
          }),
          cell(money(r.price), { alignment: "right", fontSize: 9 }),
          cell(money(r.amount), { alignment: "right", bold: true, fontSize: 9 }),
        ]),
        [
          cell(`Total · ${g.vendor}`, { bold: true, fontSize: 9, colSpan: 3 }),
          {},
          {},
          cell(money(total), { alignment: "right", bold: true, fontSize: 9 }),
        ],
      ),
    );
  }
  if (input.outstanding.length > 0) {
    const total = input.outstanding.reduce((s, x) => s + x.due, 0);
    out.push(
      detailTable(
        "Outstanding vendor dues",
        ["*", 120],
        [th("Vendor", "left"), th("Amount owed")],
        input.outstanding.map((o) => [
          cell(o.vendor, { fontSize: 9 }),
          cell(money(o.due), { alignment: "right", bold: true, color: C.amber, fontSize: 9 }),
        ]),
        [
          cell("Total outstanding", { bold: true, fontSize: 9 }),
          cell(money(total), { alignment: "right", bold: true, fontSize: 9 }),
        ],
      ),
    );
  }
  return out;
}

// ---- document -------------------------------------------------------------------------------

type PdfMake = Awaited<ReturnType<typeof loadPdfMake>>;

function docDefinition(input: PurchasesPdfInput, fs: number, padV: number, withDetails: boolean) {
  const prettyDate = new Date(`${input.date}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return {
    pageSize: "A4",
    pageMargins: [MARGIN, MARGIN, MARGIN, 44],
    defaultStyle: { font: "Noto", fontSize: 10, lineHeight: 1.15 },
    info: { title: `Daily purchases ${input.date}`, author: input.restaurant },
    header: (page: number) =>
      page > 1
        ? {
            margin: [MARGIN, 14, MARGIN, 0],
            columns: [
              { text: `${input.restaurant} · Daily Purchases`, fontSize: 9, color: C.muted },
              { text: prettyDate, fontSize: 9, color: C.muted, alignment: "right" },
            ],
          }
        : null,
    footer: (page: number, pages: number) => ({
      margin: [MARGIN, 10, MARGIN, 0],
      columns: [
        { text: input.restaurant, fontSize: 8, color: "#94a3b8" },
        { text: `Page ${page} of ${pages}`, fontSize: 8, color: "#94a3b8", alignment: "right" },
      ],
    }),
    content: [
      headerBlock(input),
      summaryBlock(input.totals),
      masterTable(input.master, input.totals, fs, padV),
      approvalBlock(input.approval),
      ...(withDetails ? detailsContent(input) : []),
    ],
  };
}

const pageCount = (buf: Uint8Array) =>
  (new TextDecoder("latin1").decode(buf).match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;

// Largest type size at which the whole master table + sign-off block still fits on page 1.
const SIZES: [number, number][] = [
  [10.5, 5],
  [10, 4.5],
  [9.5, 4],
  [9, 3.4],
  [8.5, 2.8],
  [8, 2.2],
  [7.5, 1.7],
  [7, 1.2],
  [6.5, 0.8],
  [6, 0.5],
  [5.5, 0.3],
];

async function fitFirstPage(pdfMake: PdfMake, input: PurchasesPdfInput): Promise<[number, number]> {
  for (const [fs, pad] of SIZES) {
    const buf = await pdfMake.createPdf(docDefinition(input, fs, pad, false)).getBuffer();
    if (pageCount(buf) <= 1) return [fs, pad];
  }
  return SIZES[SIZES.length - 1];
}

export async function purchasesPdfBlob(input: PurchasesPdfInput): Promise<Blob> {
  const pdfMake = await loadPdfMake();
  const [fs, pad] = await fitFirstPage(pdfMake, input);
  // The master table (with the sign-off block) stays alone on page 1; details start on a new page.
  const def = docDefinition(input, fs, pad, true) as { content: unknown[] };
  if (input.details.length > 0 || input.outstanding.length > 0) {
    def.content[3] = { ...(def.content[3] as object), pageBreak: "after" };
  }
  return pdfMake.createPdf(def).getBlob();
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function downloadPurchasesPdf(input: PurchasesPdfInput) {
  triggerDownload(await purchasesPdfBlob(input), `daily-purchases-${input.date}.pdf`);
}

// Opens the browser print dialog for the same PDF, without leaving the page.
export async function printPurchasesPdf(input: PurchasesPdfInput) {
  const url = URL.createObjectURL(await purchasesPdfBlob(input));
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  frame.src = url;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => {
      frame.remove();
      URL.revokeObjectURL(url);
    }, 120_000);
  };
  document.body.appendChild(frame);
}
