-- Simplified stock tracking: each menu item can either BE a base item (tracked
-- directly in Daily Stock) or POINT TO one base item as its stock source.
-- stock_pools and recipes remain as the underlying ledger mechanism; they are
-- now auto-managed by the application layer and invisible to end-users.

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS is_base boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS base_item_id uuid REFERENCES public.menu_items(id) ON DELETE SET NULL;

-- Migrate existing "portions" items: pool name equals item name, consume_ratio = 1
UPDATE public.menu_items mi
SET is_base = true
WHERE stock_mode = 'counted'
  AND EXISTS (
    SELECT 1
      FROM public.recipes r
      JOIN public.stock_pools sp ON sp.id = r.stock_pool_id
     WHERE r.menu_item_id = mi.id
       AND ABS(r.consume_ratio - 1) < 0.001
       AND lower(sp.name) = lower(mi.name)
  );

-- Migrate existing non-base items whose recipe pointed to another item's pool
UPDATE public.menu_items mi
SET base_item_id = mi2.id
FROM public.recipes r
JOIN public.stock_pools sp ON sp.id = r.stock_pool_id
JOIN public.menu_items mi2
  ON lower(mi2.name) = lower(sp.name)
 AND mi2.restaurant_id = mi.restaurant_id
 AND mi2.is_base = true
WHERE r.menu_item_id = mi.id
  AND mi.is_base = false
  AND mi.base_item_id IS NULL;
