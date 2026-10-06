-- A fixed-price product's price now flows straight into the daily purchase entries.
--
--  * When the owner changes a fixed price in Vendors & products, entries for today and later
--    are repriced automatically (amount and due follow; a line that was fully paid stays fully
--    paid). Entries for past days are never touched.
--  * Entries that are out of date right now (price changed earlier) are repaired once, below.
--  * Saving a past day again keeps the price it was saved at; today and later use the catalogue.

CREATE OR REPLACE FUNCTION public.reprice_open_purchase_lines()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.purchase_lines pl
     SET unit_price  = NEW.fixed_price,
         amount      = ROUND(pl.qty * NEW.fixed_price, 2),
         paid_amount = CASE WHEN pl.paid_amount >= pl.amount
                            THEN ROUND(pl.qty * NEW.fixed_price, 2)
                            ELSE LEAST(pl.paid_amount, ROUND(pl.qty * NEW.fixed_price, 2)) END,
         due_amount  = ROUND(pl.qty * NEW.fixed_price, 2)
                       - CASE WHEN pl.paid_amount >= pl.amount
                              THEN ROUND(pl.qty * NEW.fixed_price, 2)
                              ELSE LEAST(pl.paid_amount, ROUND(pl.qty * NEW.fixed_price, 2)) END
   WHERE pl.vendor_product_id = NEW.id
     AND pl.restaurant_id = NEW.restaurant_id
     AND pl.business_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date
     AND pl.unit_price IS DISTINCT FROM NEW.fixed_price;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_vendor_products_reprice ON public.vendor_products;
CREATE TRIGGER trg_vendor_products_reprice
  AFTER UPDATE OF fixed_price, price_mode ON public.vendor_products
  FOR EACH ROW
  WHEN (NEW.price_mode = 'fixed' AND NEW.fixed_price IS NOT NULL
        AND (OLD.fixed_price IS DISTINCT FROM NEW.fixed_price
             OR OLD.price_mode IS DISTINCT FROM NEW.price_mode))
  EXECUTE FUNCTION public.reprice_open_purchase_lines();

-- One-time repair of today's/future entries that already disagree with the catalogue price.
UPDATE public.purchase_lines pl
   SET unit_price  = vp.fixed_price,
       amount      = ROUND(pl.qty * vp.fixed_price, 2),
       paid_amount = CASE WHEN pl.paid_amount >= pl.amount
                          THEN ROUND(pl.qty * vp.fixed_price, 2)
                          ELSE LEAST(pl.paid_amount, ROUND(pl.qty * vp.fixed_price, 2)) END,
       due_amount  = ROUND(pl.qty * vp.fixed_price, 2)
                     - CASE WHEN pl.paid_amount >= pl.amount
                            THEN ROUND(pl.qty * vp.fixed_price, 2)
                            ELSE LEAST(pl.paid_amount, ROUND(pl.qty * vp.fixed_price, 2)) END
  FROM public.vendor_products vp
 WHERE vp.id = pl.vendor_product_id
   AND vp.price_mode = 'fixed'
   AND vp.fixed_price IS NOT NULL
   AND pl.business_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date
   AND pl.unit_price IS DISTINCT FROM vp.fixed_price;

-- save_vendor_day_purchases: past days keep their saved price on re-save.
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
  _old jsonb;
  _today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF _rid IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF NOT (public.has_role(_uid,'admin') OR public.has_role(_uid,'manager') OR public.has_role(_uid,'cashier')) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;

  SELECT * INTO _v FROM public.vendors WHERE id = _vendor_id AND restaurant_id = _rid;
  IF NOT FOUND THEN RAISE EXCEPTION 'VENDOR_NOT_FOUND'; END IF;

  -- Remember the prices already saved for this vendor/day (used below to keep past days frozen).
  SELECT COALESCE(jsonb_object_agg(vendor_product_id::text, unit_price), '{}'::jsonb) INTO _old
    FROM public.purchase_lines
   WHERE restaurant_id = _rid
     AND vendor_id = _vendor_id
     AND business_date = _business_date
     AND vendor_product_id IS NOT NULL;

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
      -- Today and later follow the catalogue price. A past day keeps the price it was saved at,
      -- so changing a price never rewrites history when an old entry is saved again.
      IF _business_date < _today AND _old ? _vp.id::text THEN
        _price := (_old ->> _vp.id::text)::numeric;
      ELSE
        _price := _vp.fixed_price;
      END IF;
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
