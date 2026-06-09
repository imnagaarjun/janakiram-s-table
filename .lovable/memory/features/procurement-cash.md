---
name: Procurement & Cash domain
description: New domain — daily vendor purchases + end-of-day cash reconciliation per section, plus their configuration. Sits behind billing as cost/cash layer, feeds Reports/P&L.
type: feature
---

New domain: Procurement & Cash. Two new operational areas — daily vendor purchases, and end-of-day cash reconciliation per section — plus their configuration. They sit behind billing as the cost/cash layer and feed Reports/P&L.

Iron rule 1 — Config vs Operations are separate screens. Configuration (vendor structure, which product prices are fixed, the list of cash-flow lines, denomination set) lives under Admin/Manager-only screens. Operations (daily purchase entry, daily cash reconciliation) is what cashiers use. Whatever is fixed in Config appears read-only in Operations; whatever is variable is editable inline with sane defaults.

Iron rule 2 — Reconciliation is auto-derived, cashier only confirms. Section sales totals, GPay, Card, Swiggy, and cash-expense (from the day's vendor purchases paid in cash) must be computed by the system from settled invoices + payments grouped by tables.section, NOT typed by hand. The cashier only enters manual lines (e.g., "NN Cash", "Vimal Personal", tips out) and the physical denomination count. The screen shows: Expected Cash vs Counted Cash vs Difference.

Iron rule 3 — Everything user-configurable, nothing hard-coded. Vendors (single-line or multi-product with per-item fixed/variable prices), cash-flow lines (adds/subtracts/manual/auto-fed, per section or all-sections), and denominations are all admin-editable. No hard-coded vendor names, line names, or note values in code.

Reuse boundaries: roles/PIN auth, design tokens, responsive law (phone=ops, tablet=admin config), restaurant_id + RLS on every new table, configurable close time, audit_log, and the Reports hub. Match the existing UI/UX exactly.

Domain facts: "NN Cash" = Owner's Drawings (N. Nageshvarathan personal withdrawal) — a manual subtract line. Sections today are NON-AC, AC, Takeaway (reuse tables.section). Some vendors (e.g., Kumar Mutton) supply many items at item-level prices, some fixed (Full Mutton, Liver) and some variable. Vendor "Due" carries forward across days. Online-paid purchases do not reduce the cash drawer.
