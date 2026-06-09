# Daily Cash Reconciliation (Operations)

You've built the **templates** (cashflow lines + denominations) under *Cash reconciliation setup*. What's missing is the **daily operations screen** that uses those templates to actually close cash each evening, per section (NON-AC / AC / Takeaway). That's what this step adds. Strictly additive — no existing module is touched.

## Where it lives

- New route: `/cash-recon` (Admin, Manager, Cashier).
- New entry in **More** tab → "Daily cash reconciliation" (under Daily purchases).
- The existing *Cash reconciliation setup* (`/cash-config`) stays as a config-only screen for Admin/Manager.

## Screen layout

Top bar:
- Business-date picker (defaults to today's business day).
- Section tabs: NON-AC · AC · Takeaway (driven by `cash_sections`).
- Status badge: Draft / Finalised. Once finalised, inputs lock; Admin can reopen.

Body — two stacked cards per section:

**1. Cash-flow tally** (driven by `cashflow_lines` for that section)
- Renders every active line in `display_order`.
- Auto-source lines (Section Sales / GPay / Card / Swiggy / Cash Expense) are **read-only** and pulled live from `section_finance(business_date, section_key)` + purchase totals. Shown with a small "auto" chip.
- Manual lines (Cash Opening, Owner's Drawings, Temple Donation, etc.) have an editable ₹ input with optional note.
- Running **Expected Cash in Drawer** computed as Σ(add) − Σ(subtract), updated live.

**2. Denomination count** (driven by `denomination_config`)
- Grid of rows: label · value · count · subtotal.
- Free-text rows (value = null, e.g. "Coins", "Damage") accept a ₹ amount directly instead of a count.
- **Counted Total** at the bottom.

Footer summary bar (sticky):
- Expected · Counted · **Variance (Short / Excess / Tally ✓)** with color.
- Buttons: *Save draft* · *Finalise* (Manager/Admin only; confirm dialog).

## Data flow

Per (business_date, section_key) there is one row in `cash_reconciliations`:
- Save draft → upsert reconciliation (status='draft'), upsert `cash_recon_values` (one per manual line), upsert `denomination_counts` (one per active denomination).
- Finalise → set status='finalised', stamp `finalised_by`/`finalised_at`, write to `audit_log`.
- Reopen (Admin only) → status back to 'draft'.

All writes go through one atomic RPC `save_cash_reconciliation(_date, _section, _values jsonb, _counts jsonb, _finalise bool)` to keep parent + children consistent and to ignore any client-supplied values for auto-source lines (server re-derives them on finalise from `section_finance`).

Reads use existing `section_finance(_business_date, _section_key)` for auto rows and a new helper `cash_expense_total(_date, _section)` summing purchase_lines paid in cash for that section (or restaurant-wide for Cash Expense if section-tagging is absent — clarify below).

## Wiring with existing reports

The existing `CashReconArchive` report already reads `cash_reconciliations` / `denomination_counts`. Once this screen starts writing real data, the archive populates automatically. No report-side changes needed.

## Iron rules respected

- No edits to billing, invoices, payments, KOT, tables.
- Auto-source values are server-derived; client values are ignored — same pattern as fixed vendor prices.
- All new logic in new files; only `more.tsx` and `routeTree.gen.ts` get an additive entry.
- RLS already on the four tables; nothing new to migrate except the two RPCs.

## Files to add / touch

- `src/components/cash-recon/DailyCashReconScreen.tsx` (new)
- `src/routes/_authenticated/cash-recon.tsx` (new)
- `src/routes/_authenticated/more.tsx` (append one link)
- New migration: `save_cash_reconciliation` RPC + `cash_expense_total` helper.

## One open question before I build

**Cash Expense scope** — purchase_lines currently store `paid_cash` per vendor/day for the whole restaurant, not per section. For the auto "Cash Expense" line, should I:
(a) attribute the full day's cash purchases to NON-AC only (kitchen lives there),
(b) split equally across active sections, or
(c) leave Cash Expense as a manual line and drop the auto source for now?

Default if you don't answer: **(c)** — safest, fully reversible, and matches the existing pattern of "auto only when the source is unambiguous".
