# Hotel Sri Janakiram — Restaurant Management App

- **App:** Professional restaurant management web app (installable PWA) for Hotel Sri Janakiram
- **Primary users:** Waiters (phone, portrait), Cashier & Kitchen (tablet, landscape), Manager/Admin
- **Stack:** React + Vite + TypeScript, Tailwind + shadcn/ui, Supabase (Postgres, Auth, Storage, Realtime, Edge Functions), PWA with offline resilience
- **Build approach:** Module by module; never break a previously built module

---

Product. A professional restaurant management web app (installable PWA) for Hotel Sri Janakiram. Primary users: Waiters (phone, portrait), Cashier & Kitchen (tablet, landscape), Manager/Admin. Built module by module; never break a previously built module.

Stack. React + Vite + TypeScript, Tailwind + shadcn/ui, Supabase (Postgres, Auth, Storage, Realtime, Edge Functions). PWA with offline resilience. Use Supabase RPC/Postgres functions for all transactional logic (never trust the client for stock or money).

Multi-tenant from day one. Every table has a restaurant_id; Row-Level Security ON for every table; seed one restaurant. This is for future multi-branch — do not expose it in the UI yet.

Responsive law (non-negotiable).

Phone = portrait, waiter flows. Tablet = landscape, kitchen + billing flows. Detect and adapt; never force horizontal scroll.

Large, legible, touch-first: min 48px touch targets, large numerals, generous spacing. The order-quantity field must look like a big calculator readout.

Category buttons and the favorites strip must fit on a phone screen with no scroll or minimal scroll; size the grid to the item count.

Navigation. Persistent bottom tab bar on phone: Tables · New Table · Menu · Reports · More. Every module screen keeps this bar and a back affordance. Nothing important should be more than 2 taps away.

Design tokens. Light mode only. Clean, high-contrast, calm. Define CSS variables: primary, surface, border, success(green), info(blue), warning(amber), danger(red), muted(grey). Status colours fixed: 🟩 occupied/running · 🔵 free · 🟡 seated-no-KOT · 🔴 bill-requested · ⚪ inactive. Rounded cards, soft shadows, no clutter.

Data conventions.

GST is inclusive. Store base_price + gst_rate; the price the owner types includes GST. Bill shows base + CGST + SGST + total. KOT shows NO price.

Stock is a ledger. stock_ledger is append-only (opening / sale / void / wastage / restock). Live availability is always DERIVED, never a mutable counter.

Connected stock (BOM). A menu item links to one+ stock_pools via recipes(consume_ratio). available(item) = MIN over its pools of floor(pool_available / ratio). Unlimited items have no pools and no cap.

KOT commit, void, and bill settlement are atomic Supabase functions that validate-then-write.

Auth & roles. PIN login (4-digit per user). Roles: Admin, Manager, Cashier, Waiter, Kitchen. Gate every screen and action by role. Audit-log all sensitive actions (void, discount, price/stock edit) with user + timestamp.

Definition of Done (apply to every step). Works in both phone-portrait and tablet-landscape; RLS enforced; loading / empty / error states present; optimistic UI with rollback where relevant; no console errors; previously built modules still work.

Defaults already decided (use these unless told otherwise): English UI; GST 5% (CGST 2.5 + SGST 2.5); channels = Dine-in + Takeaway; payment = Cash + UPI; round-off to ₹1; continuous invoice numbering HSJ-YYYY-####; KOT numbering K-#### resetting at the business-day close (default midnight); one kitchen.
