-- Drop the single base_item_id column now that multi-base links are stored in recipes.
ALTER TABLE public.menu_items DROP COLUMN IF EXISTS base_item_id;
