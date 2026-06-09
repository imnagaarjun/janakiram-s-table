-- Add fixed-amount toggle to vendors (for single-line vendors with no qty/price, e.g. donations, rent, fixed services)
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS is_fixed_amount boolean NOT NULL DEFAULT false;

-- Ensure an "Others" expense category exists per restaurant so it appears in the category dropdown
INSERT INTO public.expense_categories (restaurant_id, name, display_order, is_active)
SELECT r.id, 'Others', 9999, true
FROM public.restaurants r
WHERE NOT EXISTS (
  SELECT 1 FROM public.expense_categories ec
  WHERE ec.restaurant_id = r.id AND lower(ec.name) = 'others'
);