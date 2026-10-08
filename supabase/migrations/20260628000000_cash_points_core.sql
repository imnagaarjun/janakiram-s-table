-- Customisable cash points, per-cash-point cash expense, admin-only setup.

ALTER TABLE public.cash_sections ADD COLUMN IF NOT EXISTS label text;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS cash_section_key text;

-- Setup (cash points + lines) is for the owner/admin only. Managers still run the daily close.
DROP POLICY IF EXISTS "tenant write cash_sections" ON public.cash_sections;
DROP POLICY IF EXISTS "admin write cash_sections" ON public.cash_sections;
CREATE POLICY "admin write cash_sections" ON public.cash_sections
  FOR ALL TO authenticated
  USING (restaurant_id = public.current_restaurant_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (restaurant_id = public.current_restaurant_id() AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "tenant write cashflow_lines" ON public.cashflow_lines;
DROP POLICY IF EXISTS "admin write cashflow_lines" ON public.cashflow_lines;
CREATE POLICY "admin write cashflow_lines" ON public.cashflow_lines
  FOR ALL TO authenticated
  USING (restaurant_id = public.current_restaurant_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (restaurant_id = public.current_restaurant_id() AND public.has_role(auth.uid(), 'admin'));
