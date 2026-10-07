-- Day-only vendors can now be any of the three vendor types:
--   'single'  one line, quantity x price
--   'value'   one line, just an amount (no quantity / price)
--   'multi'   several items (its own table on the daily sheet)
-- The old 5-argument version is replaced (the Tamil-name argument is gone: one name box only).

DROP FUNCTION IF EXISTS public.create_adhoc_vendor_purchase(date, text, text, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.create_adhoc_vendor_purchase(
  _business_date date,
  _name text,
  _category_id uuid,
  _lines jsonb,
  _vendor_type text DEFAULT 'multi'
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _rid uuid := public.current_restaurant_id();
  _uid uuid := auth.uid();
  _nm text := btrim(COALESCE(_name, ''));
  _v record;
  _vid uuid;
  _cat uuid := _category_id;
BEGIN
  IF _rid IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF NOT (public.has_role(_uid,'admin') OR public.has_role(_uid,'manager') OR public.has_role(_uid,'cashier')) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF _nm = '' THEN RAISE EXCEPTION 'VENDOR_NAME_REQUIRED'; END IF;
  IF _vendor_type NOT IN ('single', 'value', 'multi') THEN RAISE EXCEPTION 'BAD_TYPE'; END IF;
  IF _lines IS NULL OR jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) = 0 THEN
    RAISE EXCEPTION 'BAD_LINES';
  END IF;
  -- A single-line vendor has exactly one line.
  IF _vendor_type <> 'multi' AND jsonb_array_length(_lines) <> 1 THEN
    RAISE EXCEPTION 'BAD_LINES';
  END IF;

  IF _cat IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.expense_categories WHERE id = _cat AND restaurant_id = _rid
  ) THEN
    _cat := NULL;
  END IF;

  SELECT * INTO _v FROM public.vendors
   WHERE restaurant_id = _rid AND lower(name) = lower(_nm)
   LIMIT 1;

  IF FOUND THEN
    -- A real catalogue vendor: the employee must use its row / "Add item for today" instead.
    IF NOT _v.is_adhoc THEN RAISE EXCEPTION 'VENDOR_EXISTS'; END IF;
    -- Saving would replace the day's lines, so refuse to overwrite an existing entry.
    IF EXISTS (
      SELECT 1 FROM public.purchase_lines
       WHERE restaurant_id = _rid AND vendor_id = _v.id AND business_date = _business_date
    ) THEN
      RAISE EXCEPTION 'VENDOR_ALREADY_TODAY';
    END IF;
    _vid := _v.id;
  ELSE
    -- Day-only vendors stay at the end of the list, in the order they were added.
    INSERT INTO public.vendors(
      restaurant_id, name, is_multi_product, is_fixed_amount,
      default_category_id, is_active, is_adhoc, created_by, display_order
    ) VALUES (
      _rid, _nm, _vendor_type = 'multi', _vendor_type = 'value',
      _cat, false, true, _uid,
      9999 + (SELECT count(*) FROM public.vendors WHERE restaurant_id = _rid AND is_adhoc)
    ) RETURNING id INTO _vid;
  END IF;

  PERFORM public.save_vendor_day_purchases(
    _business_date,
    _vid,
    (SELECT jsonb_agg(l || '{"is_adhoc": true}'::jsonb) FROM jsonb_array_elements(_lines) AS l)
  );

  RETURN jsonb_build_object('ok', true, 'vendor_id', _vid);
END $function$;

REVOKE EXECUTE ON FUNCTION public.create_adhoc_vendor_purchase(date, text, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_adhoc_vendor_purchase(date, text, uuid, jsonb, text) TO authenticated;
