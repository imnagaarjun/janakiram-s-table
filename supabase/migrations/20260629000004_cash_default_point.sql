-- The cash point that receives cash expenses from vendors with no "paid from" choice.
-- Until now this was whichever cash point came first; it is now an explicit choice.
ALTER TABLE public.cash_sections ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.cash_expense_total(_business_date date, _section_key text)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH rid AS (SELECT public.current_restaurant_id() AS r),
  def AS (
    SELECT key FROM public.cash_sections
    WHERE restaurant_id = (SELECT r FROM rid) AND is_active
    ORDER BY is_default DESC, display_order, key LIMIT 1
  )
  SELECT COALESCE(SUM(pl.paid_amount), 0)::numeric
  FROM public.purchase_lines pl
  LEFT JOIN public.vendors v ON v.id = pl.vendor_id
  LEFT JOIN public.cash_sections cs
    ON cs.restaurant_id = pl.restaurant_id AND cs.key = v.cash_section_key AND cs.is_active
  WHERE pl.restaurant_id = (SELECT r FROM rid)
    AND pl.business_date = _business_date
    AND pl.pay_mode = 'cash'
    AND COALESCE(cs.key, (SELECT key FROM def)) = _section_key;
$$;
GRANT EXECUTE ON FUNCTION public.cash_expense_total(date, text) TO authenticated;
