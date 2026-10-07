-- Only the admin (owner) can create, rename, reorder or switch off expense categories.
-- Everyone in the restaurant can still read them (to pick a category on a vendor or purchase).

DROP POLICY IF EXISTS "tenant write expense_categories" ON public.expense_categories;
DROP POLICY IF EXISTS "admin write expense_categories" ON public.expense_categories;

CREATE POLICY "admin write expense_categories" ON public.expense_categories
  FOR ALL TO authenticated
  USING (restaurant_id = public.current_restaurant_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (restaurant_id = public.current_restaurant_id() AND public.has_role(auth.uid(), 'admin'));
