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
      _cat := _v.default_category_id;
      _desc := NULLIF(_ln->>'description','');
    END IF;
    _note := NULLIF(_ln->>'note','');

    INSERT INTO public.purchase_lines(
      restaurant_id, business_date, vendor_id, vendor_product_id,
      description, qty, unit_price, amount, pay_mode, paid_amount, due_amount,
      category_id, note, created_by
    ) VALUES (
      _rid, _business_date, _vendor_id, _vp_id,
      _desc, _qty, _price, _amount, _mode, _paid, _due,
      _cat, _note, _uid
    );
    _inserted := _inserted + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'inserted', _inserted);
END $function$;