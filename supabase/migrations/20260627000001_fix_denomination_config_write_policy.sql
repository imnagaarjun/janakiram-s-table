-- Adding a denomination failed with "new row violates row-level security policy".
-- The write policy checked has_role(..., 'admin'|'manager'); the role type change
-- (enum -> text, DROP TYPE ... CASCADE) can remove it. Recreate it with the text helper.
DROP POLICY IF EXISTS "tenant write denomination_config" ON public.denomination_config;
CREATE POLICY "tenant write denomination_config" ON public.denomination_config
  FOR ALL TO authenticated
  USING (restaurant_id = public.current_restaurant_id()
         AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')))
  WITH CHECK (restaurant_id = public.current_restaurant_id()
         AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));
