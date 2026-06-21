"use strict";

/**
 * Builds an ESC/POS byte sequence for a KOT or Bill payload.
 * Returns a Buffer ready to send to the printer.
 */

const ESC = 0x1b;
const GS  = 0x1d;

function cmd(...bytes) {
  return Buffer.from(bytes);
}

const INIT         = cmd(ESC, 0x40);               // Initialize
const BOLD_ON      = cmd(ESC, 0x45, 0x01);
const BOLD_OFF     = cmd(ESC, 0x45, 0x00);
const ALIGN_CENTER = cmd(ESC, 0x61, 0x01);
const ALIGN_LEFT   = cmd(ESC, 0x61, 0x00);
const ALIGN_RIGHT  = cmd(ESC, 0x61, 0x02);
const DOUBLE_H_ON  = cmd(ESC, 0x21, 0x10);        // Double height
const DOUBLE_OFF   = cmd(ESC, 0x21, 0x00);
const FEED_3       = cmd(ESC, 0x64, 3);            // Feed 3 lines
const CUT          = cmd(GS,  0x56, 0x41, 0x03);  // Partial cut

const COLS = 42;                                   // 80mm @ 42 chars/line

function line(text = "") {
  return Buffer.from(text.slice(0, COLS) + "\n");
}

function rule() {
  return line("-".repeat(COLS));
}

function padRight(str, width) {
  return String(str).padEnd(width, " ").slice(0, width);
}

function padLeft(str, width) {
  return String(str).padStart(width, " ").slice(0, width);
}

function twoCol(left, right, totalWidth = COLS) {
  const r = String(right);
  const l = String(left).slice(0, totalWidth - r.length - 1);
  return Buffer.from(l.padEnd(totalWidth - r.length, " ") + r + "\n");
}

function inr(n) {
  return "Rs." + Number(n).toFixed(2);
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
  } catch {
    return iso;
  }
}

function renderKOT(payload) {
  const { restaurantName, kotNo, sentAt, tableLabel, pax, lines, note, waiterName } = payload;
  const chunks = [
    INIT,
    ALIGN_CENTER,
    BOLD_ON,
    DOUBLE_H_ON,
    Buffer.from("KOT\n"),
    DOUBLE_OFF,
    BOLD_OFF,
    restaurantName ? line(restaurantName) : Buffer.alloc(0),
    ALIGN_LEFT,
    rule(),
    twoCol(kotNo, formatDate(sentAt)),
    twoCol(tableLabel, `Pax: ${pax}`),
    waiterName ? line(`Server: ${waiterName}`) : Buffer.alloc(0),
    rule(),
    BOLD_ON,
    twoCol(padRight("ITEM", 32), padLeft("QTY", 8)),
    BOLD_OFF,
    rule(),
  ];

  for (const l of lines) {
    const name = l.name + (l.note ? ` (${l.note})` : "");
    chunks.push(twoCol(padRight(name, 32), padLeft(String(l.qty), 8)));
  }

  chunks.push(rule());
  if (note) {
    chunks.push(line(`Note: ${note}`));
    chunks.push(rule());
  }

  chunks.push(FEED_3, CUT);
  return Buffer.concat(chunks);
}

function renderBill(payload, copies = 1) {
  const {
    restaurant, invoice_no, issued_at, table_label, pax, lines, totals,
    payments, notes, duplicate, waiterName, paidMarker,
  } = payload;

  function buildOneCopy() {
    const chunks = [
      INIT,
      ALIGN_CENTER,
      BOLD_ON,
      DOUBLE_H_ON,
      Buffer.from((restaurant.name ?? "Hotel Sri Janakiram") + "\n"),
      DOUBLE_OFF,
      BOLD_OFF,
    ];

    if (restaurant.address) chunks.push(line(restaurant.address));
    if (restaurant.phone)   chunks.push(line(`Ph: ${restaurant.phone}`));
    if (restaurant.gstin)   chunks.push(line(`GSTIN: ${restaurant.gstin}`));
    if (restaurant.fssai)   chunks.push(line(`FSSAI: ${restaurant.fssai}`));

    chunks.push(ALIGN_LEFT, rule());

    if (duplicate) {
      chunks.push(ALIGN_CENTER, BOLD_ON, line("** DUPLICATE / REPRINT **"), BOLD_OFF, ALIGN_LEFT);
    }
    if (paidMarker) {
      chunks.push(ALIGN_CENTER, BOLD_ON, line("****** PAID ******"), BOLD_OFF, ALIGN_LEFT);
    }

    chunks.push(
      twoCol(`Bill: ${invoice_no}`, formatDate(issued_at)),
      twoCol(table_label, `Pax: ${pax}`),
    );
    if (waiterName) chunks.push(line(`Server: ${waiterName}`));

    chunks.push(rule(), BOLD_ON, twoCol(padRight("ITEM", 22), padLeft("QTY", 4) + padLeft("RATE", 8) + padLeft("AMT", 8)), BOLD_OFF, rule());

    for (const l of lines) {
      const name = padRight(l.name, 22);
      const qty  = padLeft(String(l.qty), 4);
      const rate = padLeft(l.inclusive_price.toFixed(2), 8);
      const amt  = padLeft(l.line_total.toFixed(2), 8);
      chunks.push(Buffer.from(name + qty + rate + amt + "\n"));
    }

    chunks.push(rule());

    const t = totals;
    chunks.push(
      twoCol("Taxable", inr(t.base - t.service_charge)),
    );
    if (t.service_charge > 0) chunks.push(twoCol("Service charge", inr(t.service_charge)));
    chunks.push(
      twoCol("CGST", inr(t.cgst)),
      twoCol("SGST", inr(t.sgst)),
    );
    if (t.discount > 0) chunks.push(twoCol("Discount", `- ${inr(t.discount)}`));
    if (t.round_off !== 0) chunks.push(twoCol("Round off", inr(t.round_off)));

    chunks.push(rule(), BOLD_ON, twoCol("TOTAL", inr(t.total)), BOLD_OFF, rule());

    if (payments && payments.length) {
      chunks.push(line("Payment:"));
      for (const p of payments) {
        chunks.push(twoCol(
          (p.mode || "").toUpperCase() + (p.ref_no ? ` ${p.ref_no}` : ""),
          inr(p.amount),
        ));
      }
      chunks.push(rule());
    }

    if (notes) chunks.push(line(notes));

    chunks.push(ALIGN_CENTER, line("Thank you. Visit again!"), ALIGN_LEFT, FEED_3, CUT);
    return Buffer.concat(chunks);
  }

  const copy = buildOneCopy();
  if (copies <= 1) return copy;
  return Buffer.concat(Array.from({ length: copies }, () => copy));
}

module.exports = { renderKOT, renderBill };
