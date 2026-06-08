## Goal

Eliminate the duplicate "New Table" tab. The Tables tab becomes the single entry point for everything table-related: viewing status, opening running orders, starting new orders on free tables, and creating takeaways — without losing any current functionality.

## Why merge

- **Tables** (`/tables`): grid of all table groups with status colors. Tapping a free tile currently does nothing; tapping an occupied/bill-requested tile opens its session.
- **New Table** (`/new-table`): the same grid, but tapping a free tile opens a Pax/Channel dialog and creates a new `order_sessions` row. Also has a "New takeaway" button.

The only unique things `/new-table` adds are:
1. The Pax + Channel picker dialog when starting an order
2. The "New takeaway" button
3. Waiter-only filtering to allocated tables
4. Resume-existing-open-session shortcut

All four can live inside `/tables` cleanly.

## Changes

### 1. `src/components/tables/TablesGrid.tsx`
- Add a **"New takeaway"** button in the header (next to Manage). Available to admin/manager/waiter/cashier.
- Extend `openTile` so that tapping a **free** tile (and `seated_no_kot`) opens a Pax/Channel dialog (reused from `new-table.tsx`) and creates a new `order_sessions` row, then navigates to `/order/$sessionId`. Occupied/bill-requested behavior stays as-is.
- If a free tile already has an open session for that code, resume it (same shortcut as today).
- For waiter-only users, hide groups whose `waiter_id` is not theirs (today's allocation logic is already group-level via `waiter_id` on `table_groups`, so this is a simple filter — no need for `waiter_allocations` lookup here).
- Keep status filter, waiter filter, manage sheet, and legend unchanged.

### 2. `src/components/AppShell.tsx`
- Remove the `/new-table` nav item from both phone and tablet nav arrays. Tables tab is now the single entry.

### 3. `src/routes/_authenticated/new-table.tsx`
- Delete the file. The route tree regenerates automatically. Any deep link to `/new-table` would 404 — acceptable since it's only an internal nav target.

### 4. No other code references
- Verified `/new-table` is only linked from `AppShell.tsx`. `index.tsx` routes everyone to `/tables` already.
- Backend, RLS, session creation logic untouched.

## What is preserved

- Start dine-in order (Pax + Channel dialog)
- Start takeaway order (button + dialog, pax only)
- Resume existing open session on a table
- Waiter-only allocation filter
- Status + waiter filters, Manage sheet, legend
- Tablet 5-column nav still fits (one fewer item)

## Phone nav after change
```
Tables · Menu · Reports · More    (4 items, was 5)
```
Waiter still has full create-order access from the Tables tab (free tile → dialog, or Takeaway button).
