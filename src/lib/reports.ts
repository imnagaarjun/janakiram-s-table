// Reports utility: date ranges, CSV + PDF export helpers.
import { startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, format } from "date-fns";

export type RangeKey = "today" | "yesterday" | "week" | "month" | "custom";

export interface DateRange {
  from: Date;
  to: Date;
  label: string;
}

const IST_TZ = "Asia/Kolkata";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Compute a date that, when reading its UTC y/m/d, equals IST y/m/d of `d`.
function istBoundary(d: Date, kind: "start" | "end"): Date {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const day = ist.getUTCDate();
  if (kind === "start") return new Date(Date.UTC(y, m, day) - IST_OFFSET_MS);
  return new Date(Date.UTC(y, m, day, 23, 59, 59, 999) - IST_OFFSET_MS);
}

export function presetRange(key: RangeKey, custom?: { from: Date; to: Date }): DateRange {
  const now = new Date();
  if (key === "today") {
    return { from: istBoundary(now, "start"), to: istBoundary(now, "end"), label: "Today" };
  }
  if (key === "yesterday") {
    const y = subDays(now, 1);
    return { from: istBoundary(y, "start"), to: istBoundary(y, "end"), label: "Yesterday" };
  }
  if (key === "week") {
    const s = startOfWeek(now, { weekStartsOn: 1 });
    const e = endOfWeek(now, { weekStartsOn: 1 });
    return { from: istBoundary(s, "start"), to: istBoundary(e, "end"), label: "This week" };
  }
  if (key === "month") {
    const s = startOfMonth(now);
    const e = endOfMonth(now);
    return { from: istBoundary(s, "start"), to: istBoundary(e, "end"), label: "This month" };
  }
  const from = custom?.from ?? startOfDay(now);
  const to = custom?.to ?? endOfDay(now);
  return {
    from: istBoundary(from, "start"),
    to: istBoundary(to, "end"),
    label: `${format(from, "dd MMM")} → ${format(to, "dd MMM yyyy")}`,
  };
}

export function fmtIST(d: string | Date, pat = "dd MMM yyyy HH:mm"): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TZ,
    year: "numeric", month: "short", day: "2-digit",
    hour: pat.includes("HH") ? "2-digit" : undefined,
    minute: pat.includes("HH") ? "2-digit" : undefined,
    hour12: false,
  }).format(dt);
}

export function istDayKey(d: string | Date): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST_TZ }).format(dt); // YYYY-MM-DD
}

export function istHour(d: string | Date): number {
  const dt = typeof d === "string" ? new Date(d) : d;
  return Number(new Intl.DateTimeFormat("en-IN", { timeZone: IST_TZ, hour: "2-digit", hour12: false }).format(dt));
}

// ----- CSV -----
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: unknown) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ----- PDF (print to PDF via window) -----
export function openPdfReport(opts: {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  footer?: string;
  summary?: { label: string; value: string }[];
}) {
  const { title, subtitle, headers, rows, footer, summary } = opts;
  const esc = (s: unknown) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 11px; color: #111; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .sub { color: #555; margin-bottom: 10px; font-size: 11px; }
  .summary { display: flex; flex-wrap: wrap; gap: 12px; margin: 8px 0 12px; }
  .summary .item { border: 1px solid #ddd; padding: 6px 10px; border-radius: 6px; }
  .summary .label { color: #666; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; }
  .summary .value { font-weight: 700; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #eee; padding: 5px 6px; text-align: left; vertical-align: top; }
  th { background: #fafafa; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: #444; }
  tr:nth-child(even) td { background: #fcfcfc; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .footer { margin-top: 14px; color: #666; font-size: 10px; }
</style></head><body>
<h1>${esc(title)}</h1>
${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ""}
${summary?.length ? `<div class="summary">${summary.map((s) => `<div class="item"><div class="label">${esc(s.label)}</div><div class="value">${esc(s.value)}</div></div>`).join("")}</div>` : ""}
<table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
<tbody>${rows
    .map(
      (r) =>
        `<tr>${r
          .map((c, i) => {
            const isNum = typeof c === "number";
            const v = isNum ? (c as number).toLocaleString("en-IN", { maximumFractionDigits: 2 }) : esc(c);
            return `<td class="${isNum ? "num" : ""}">${v}</td>`;
          })
          .join("")}</tr>`,
    )
    .join("")}</tbody></table>
${footer ? `<div class="footer">${esc(footer)}</div>` : ""}
<script>window.onload=()=>setTimeout(()=>window.print(),150);</script>
</body></html>`;
  const w = window.open("", "_blank", "width=1000,height=700");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

export function safeFilename(s: string): string {
  return s.replace(/[^a-z0-9-_]+/gi, "_").toLowerCase();
}

export function inr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "₹0.00";
  return `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
