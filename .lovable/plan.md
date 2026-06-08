## Goal
Close the takeaway settlement gap by flipping the order of operations: **for takeaway, cashier collects payment first, then sends the KOT to kitchen**. No final invoice reprint — the pro-forma that prints on settlement is the customer copy.

## New takeaway flow
1. Cashier opens takeaway order, adds items to draft.
2. Cashier taps **Settle & Send KOT** (replaces the current Send KOT button for takeaway only).
3. Settlement dialog opens (cash / UPI / split, tendered, change). PIN required only if discount/service/comp is applied (existing rule).
4. On successful settlement:
   - Backend creates the invoice + payments (existing `settle_bill` RPC).
   - Frontend immediately calls `send_kot` with the draft lines.
   - KOT prints at kitchen printer.
   - Bill (with invoice no., payment mode, change due, "PAID") prints at cash counter.
5. Session closes; takeaway tile clears.

Dine-in flow is unchanged (Send KOT → … → Request Bill → Settle).

## Technical changes

**Backend — one new RPC:** `settle_takeaway(_session_id, _draft_items, _kot_note, _settle_params, _payments)`
- Wraps both operations in a single transaction:
  1. Validates session is `open` and `channel = 'takeaway'`.
  2. Calls existing `send_kot` logic inline (stock checks, KOT row, ledger, kot_no).
  3. Calls existing `settle_bill` logic inline (invoice, payments, close session).
- Returns `{ kot_no, invoice_no, total, tendered, change, … }` so the client can print both dockets.
- Reuses existing validation (insufficient stock, empty cart, bad PIN) — same error codes.
- Atomicity matters: if stock fails, payment must not be recorded; if payment validation fails, KOT must not be sent.

**Frontend — `OrderScreen.tsx`:**
- For `session.channel === "takeaway"`:
  - Replace the **Send KOT** primary button with **Settle & Send KOT** (disabled when draft is empty).
  - Remove the takeaway-specific block that currently auto-prints pro-forma + flags `request_bill` on Send KOT.
  - On tap: open the existing `SettlementDialog` (currently only opens from BillPanel) seeded with the draft total.
  - On confirm: call `settle_takeaway` RPC → on success, `printKOT(...)` then `printBill(...)` with `waiterName`, invoice no., payment mode, and "PAID" marker → toast → navigate back to Tables.
- For dine-in: no change.

**Frontend — `BillPanel.tsx`:** no behaviour change for takeaway (takeaway sessions will already be settled and won't route here). Keep dine-in path intact.

**Frontend — `print-bill.ts`:** add optional `paidMarker?: boolean` to render a "PAID" stamp above the totals block when the bill is printed post-settlement (visual only; payments section already exists).

**Frontend — `SettlementDialog`:** extract the settle form currently inside `BillPanel` into a reusable dialog component (or lift its state) so OrderScreen can mount it without routing to the bill page. Keep the existing `SettlementDialog.tsx` (result view) as-is.

## Files touched
- `supabase/migrations/*` — new `settle_takeaway` RPC + GRANT EXECUTE to authenticated.
- `src/components/order/OrderScreen.tsx` — button swap, settlement dialog wiring, takeaway-specific submit handler.
- `src/components/billing/BillPanel.tsx` — extract settle form into shared component; dine-in path unchanged.
- `src/components/billing/SettleForm.tsx` *(new)* — the shared payment-entry form used by both BillPanel and OrderScreen.
- `src/lib/print-bill.ts` — add `paidMarker` flag.

## Out of scope
- No reprint of a separate final tax invoice (per your decision — pro-forma post-settlement is the customer copy, and it already carries invoice no. + payment details).
- Dine-in flow untouched.
- No new UI for refunds/voids of takeaway after settlement (existing `reopen_invoice` already covers same-day reversals).

## Definition of done
- Takeaway: cart → Settle & Send KOT → payment dialog → KOT prints in kitchen + bill prints at counter with invoice no. and PAID → session settled, tile cleared.
- Dine-in: identical to today.
- Stock failure rolls back payment; payment failure prevents KOT send.
- Works on phone (waiter taking cash at counter) and tablet (cashier).
- No regressions in BillPanel dine-in settlement.
