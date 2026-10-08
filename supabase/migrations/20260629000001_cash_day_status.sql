-- Expected / counted per cash point for a day, worked out on the server so the
-- "all cash points tallied" rule cannot be bypassed from the browser.
CREATE OR REPLACE FUNCTION public.cash_recon_totals(_recon_id uuid)
RETURNS TABLE (expected numeric, counted numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH r AS (
    SELECT * FROM public.cash_reconciliations
    WHERE id = _recon_id AND restaurant_id = public.current_restaurant_id()
  ),
  fin AS (
    SELECT f.* FROM r, LATERAL public.section_finance(r.business_date, r.section_key) f
  ),
  lines AS (
    SELECT COALESCE(SUM(
      CASE WHEN l.sign = 'add' THEN 1 ELSE -1 END *
      CASE l.source
        WHEN 'manual' THEN COALESCE(v.manual_value, 0)
        WHEN 'auto_cash_expense' THEN
          CASE WHEN r.status = 'finalised' AND v.manual_value IS NOT NULL THEN v.manual_value
               ELSE public.cash_expense_total(r.business_date, r.section_key) END
        WHEN 'auto_sales' THEN (SELECT sales_total FROM fin)
        WHEN 'auto_gpay' THEN (SELECT gpay_total FROM fin)
        WHEN 'auto_card' THEN (SELECT card_total FROM fin)
        WHEN 'auto_swiggy' THEN (SELECT swiggy_total FROM fin)
        ELSE 0
      END
    ), 0) AS total
    FROM r
    JOIN public.cashflow_lines l
      ON l.restaurant_id = r.restaurant_id AND l.section_key = r.section_key AND l.is_active
    LEFT JOIN public.cash_recon_values v
      ON v.reconciliation_id = r.id AND v.cashflow_line_id = l.id
  ),
  extras AS (
    SELECT COALESCE(SUM(CASE WHEN e.sign = 'add' THEN e.amount ELSE -e.amount END), 0) AS total
    FROM public.cash_recon_extra_lines e WHERE e.reconciliation_id = _recon_id
  ),
  cnt AS (
    SELECT COALESCE(SUM(c.count * COALESCE(dc.value, 1)), 0) AS total
    FROM public.denomination_counts c
    JOIN public.denomination_config dc ON dc.id = c.denomination_id
    WHERE c.reconciliation_id = _recon_id
  )
  SELECT (SELECT total FROM lines) + (SELECT total FROM extras), (SELECT total FROM cnt)
  WHERE EXISTS (SELECT 1 FROM r);
$$;
REVOKE EXECUTE ON FUNCTION public.cash_recon_totals(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cash_recon_totals(uuid) TO authenticated;

-- One row per active cash point for the day. "tallied" = closed (finalised) and counted = expected.
CREATE OR REPLACE FUNCTION public.cash_day_status(_business_date date)
RETURNS TABLE (
  section_key text, label text, recon_id uuid, status text,
  expected numeric, counted numeric, tallied boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT s.key, COALESCE(s.label, s.key), r.id, r.status,
         t.expected, t.counted,
         COALESCE(r.status = 'finalised' AND abs(t.counted - t.expected) < 0.005, false)
  FROM public.cash_sections s
  LEFT JOIN public.cash_reconciliations r
    ON r.restaurant_id = s.restaurant_id AND r.section_key = s.key AND r.business_date = _business_date
  LEFT JOIN LATERAL public.cash_recon_totals(r.id) t ON r.id IS NOT NULL
  WHERE s.restaurant_id = public.current_restaurant_id() AND s.is_active
  ORDER BY s.display_order, s.key;
$$;
REVOKE EXECUTE ON FUNCTION public.cash_day_status(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cash_day_status(date) TO authenticated;
