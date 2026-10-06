-- One-off purchase entries made on the Daily Purchases screen.
--
-- Owner/admin controls the vendor and product catalogue. Employees only record purchases, so:
--   * a vendor an employee adds on the day is stored as a one-time vendor (is_adhoc, inactive):
--     it never appears in the daily vendor list or the catalogue unless the owner activates it;
--   * an item an employee adds under an existing vendor is stored only on the purchase line
--     (is_adhoc) and never creates a catalogue product;
--   * every line keeps its own unit, amount, paid and due, so reports, vendor dues and the
--     accounts stay correct for these entries.

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS is_adhoc boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by uuid;

ALTER TABLE public.purchase_lines
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS is_adhoc boolean NOT NULL DEFAULT false;

-- Backfill the unit for catalogue lines already recorded.
UPDATE public.purchase_lines pl
   SET unit = vp.unit
  FROM public.vendor_products vp
 WHERE pl.vendor_product_id = vp.id AND pl.unit IS NULL;

-- Early builds tagged one-off lines with note = 'adhoc|<unit>'. Move that into proper columns.
UPDATE public.purchase_lines
   SET is_adhoc = true,
       unit = NULLIF(substr(note, 7), ''),
       note = NULL
 WHERE note LIKE 'adhoc|%';

-- save_vendor_day_purchases: now also stores unit, is_adhoc and an optional per-line category.
CREATE OR REPLACE FUNCTION public.save_vendor_day_purchases(_business_date date, _vendor_id uuid, _lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _rid uuid := public.current_restaurant_id();
  _uid uuid := auth.uid();
  _v record;
  _ln jsonb;
  _vp record;
  _has_vp boolean;
  _qty numeric;
  _price numeric;
  _amount numeric;
  _paid numeric;
  _due numeric;
  _mode public.purchase_pay_mode;
  _cat uuid;
  _vp_id uuid;
  _desc text;
  _note text;
  _inserted int := 0;
  _unit text;
  _adhoc boolean;
BEGIN
  IF _rid IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF NOT (public.has_role(_uid,'admin') OR public.has_role(_uid,'manager') OR public.has_role(_uid,'cashier')) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;

  SELECT * INTO _v FROM public.vendors WHERE id = _vendor_id AND restaurant_id = _rid;
  IF NOT FOUND THEN RAISE EXCEPTION 'VENDOR_NOT_FOUND'; END IF;

  DELETE FROM public.purchase_lines
   WHERE restaurant_id = _rid
     AND vendor_id = _vendor_id
     AND business_date = _business_date;

  IF jsonb_typeof(_lines) <> 'array' THEN RAISE EXCEPTION 'BAD_LINES'; END IF;

  FOR _ln IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    _qty := COALESCE((_ln->>'qty')::numeric, 0);
    IF _qty <= 0 THEN CONTINUE; END IF;

    _has_vp := false;
    _vp_id := NULL;
    IF (_ln ? 'vendor_product_id') AND NULLIF(_ln->>'vendor_product_id','') IS NOT NULL THEN
      SELECT * INTO _vp FROM public.vendor_products
       WHERE id = (_ln->>'vendor_product_id')::uuid
         AND vendor_id = _vendor_id
         AND restaurant_id = _rid;
      IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
      _has_vp := true;
      _vp_id := _vp.id;
    END IF;

    IF _has_vp AND _vp.price_mode = 'fixed' THEN
      IF _vp.fixed_price IS NULL THEN RAISE EXCEPTION 'FIXED_PRICE_MISSING:%', _vp.name; END IF;
      _price := _vp.fixed_price;
    ELSE
      _price := COALESCE((_ln->>'unit_price')::numeric, 0);
      IF _price < 0 THEN RAISE EXCEPTION 'BAD_PRICE'; END IF;
    END IF;

    _amount := ROUND(_qty * _price, 2);
    _paid := LEAST(GREATEST(COALESCE((_ln->>'paid_amount')::numeric, 0), 0), _amount);
    _due := _amount - _paid;
    _mode := COALESCE((_ln->>'pay_mode')::public.purchase_pay_mode, 'cash');
    IF _has_vp THEN
      _cat := COALESCE(_vp.category_id, _v.default_category_id);
      _desc := COALESCE(_vp.name, NULLIF(_ln->>'description',''));
    ELSE
      _cat := COALESCE(NULLIF(_ln->>'category_id','')::uuid, _v.default_category_id);
      IF _cat IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.expense_categories WHERE id = _cat AND restaurant_id = _rid
      ) THEN
        _cat := _v.default_category_id;
      END IF;
      _desc := NULLIF(_ln->>'description','');
    END IF;
    -- Snapshot the unit on the line so history stays correct if the catalogue unit changes later.
    _unit := CASE WHEN _has_vp THEN _vp.unit ELSE NULLIF(btrim(_ln->>'unit'),'') END;
    _adhoc := (NOT _has_vp) AND COALESCE((_ln->>'is_adhoc')::boolean, false);
    _note := NULLIF(_ln->>'note','');

    INSERT INTO public.purchase_lines(
      restaurant_id, business_date, vendor_id, vendor_product_id,
      description, qty, unit_price, amount, pay_mode, paid_amount, due_amount,
      category_id, note, created_by, unit, is_adhoc
    ) VALUES (
      _rid, _business_date, _vendor_id, _vp_id,
      _desc, _qty, _price, _amount, _mode, _paid, _due,
      _cat, _note, _uid, _unit, _adhoc
    );
    _inserted := _inserted + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'inserted', _inserted);
END $function$;

-- create_adhoc_vendor_purchase: lets an employee record a purchase from a vendor that is not in
-- the vendor list. Runs with definer rights because only admin/manager may write to vendors
-- directly. Everything happens in one transaction.
CREATE OR REPLACE FUNCTION public.create_adhoc_vendor_purchase(
  _business_date date,
  _name text,
  _name_tamil text,
  _category_id uuid,
  _lines jsonb
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
  IF _lines IS NULL OR jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) = 0 THEN
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
    -- A real catalogue vendor: the employee must use "Add item for today" on that vendor instead.
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
    INSERT INTO public.vendors(
      restaurant_id, name, name_tamil, is_multi_product, is_fixed_amount,
      default_category_id, is_active, is_adhoc, created_by, display_order
    ) VALUES (
      _rid, _nm, NULLIF(btrim(COALESCE(_name_tamil, '')), ''), true, false,
      _cat, false, true, _uid, 9999
    ) RETURNING id INTO _vid;
  END IF;

  PERFORM public.save_vendor_day_purchases(
    _business_date,
    _vid,
    (SELECT jsonb_agg(l || '{"is_adhoc": true}'::jsonb) FROM jsonb_array_elements(_lines) AS l)
  );

  RETURN jsonb_build_object('ok', true, 'vendor_id', _vid);
END $function$;

REVOKE EXECUTE ON FUNCTION public.create_adhoc_vendor_purchase(date, text, text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_adhoc_vendor_purchase(date, text, text, uuid, jsonb) TO authenticated;
