CREATE OR REPLACE FUNCTION public.settle_bill(_session_id uuid, _params jsonb, _payments jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _rid uuid := public.current_restaurant_id();
  _uid uuid := auth.uid();
  _s record;
  _prefix text;
  _year text := to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY');
  _seq int;
  _invoice_no text;
  _inv_id uuid;
  _base numeric := 0; _cgst numeric := 0; _sgst numeric := 0;
  _gross numeric := 0;
  _svc_pct numeric := COALESCE((_params->>'service_charge_pct')::numeric, 0);
  _svc_amt numeric := 0;
  _disc_amt numeric := COALESCE((_params->>'discount_amt')::numeric, 0);
  _disc_pct numeric := COALESCE((_params->>'discount_pct')::numeric, 0);
  _disc_reason text := NULLIF(_params->>'discount_reason','');
  _comp boolean := COALESCE((_params->>'complimentary')::boolean, false);
  _notes text := NULLIF(_params->>'notes','');
  _manager_pin text := NULLIF(_params->>'manager_pin','');
  _mgr uuid;
  _pre_tax numeric;
  _ratio numeric;
  _round_off numeric := 0;
  _total numeric;
  _pay_total numeric := 0;
  _p jsonb;
BEGIN
  IF _rid IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF NOT (public.has_role(_uid,'admin') OR public.has_role(_uid,'manager') OR public.has_role(_uid,'cashier')) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;

  SELECT * INTO _s FROM public.order_sessions WHERE id = _session_id AND restaurant_id = _rid;
  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
  IF _s.status NOT IN ('open','bill_requested') THEN RAISE EXCEPTION 'SESSION_CLOSED'; END IF;

  WITH lines AS (
    SELECT ki.menu_item_id, SUM(ki.qty) AS qty
      FROM public.kot_items ki
      JOIN public.kots k ON k.id = ki.kot_id
     WHERE k.session_id = _session_id
       AND ki.status <> 'void'
     GROUP BY ki.menu_item_id
  )
  SELECT
    COALESCE(SUM(l.qty * mp.base_price), 0)::numeric(12,4),
    COALESCE(SUM(l.qty * (mp.base_price * mp.gst_rate / 100) / 2), 0)::numeric(12,4),
    COALESCE(SUM(l.qty * (mp.base_price * mp.gst_rate / 100) / 2), 0)::numeric(12,4),
    COALESCE(SUM(l.qty * mp.inclusive_price), 0)::numeric(12,4)
    INTO _base, _cgst, _sgst, _gross
    FROM lines l
    JOIN public.menu_prices mp
      ON mp.menu_item_id = l.menu_item_id AND mp.channel_key = _s.channel::text;

  IF _gross <= 0 AND NOT _comp THEN RAISE EXCEPTION 'EMPTY_BILL'; END IF;

  IF _svc_pct < 0 OR _svc_pct > 100 THEN RAISE EXCEPTION 'BAD_SVC'; END IF;
  _svc_amt := ROUND(_base * _svc_pct / 100, 2);

  IF _disc_pct < 0 OR _disc_pct > 100 THEN RAISE EXCEPTION 'BAD_DISC'; END IF;
  IF _disc_amt < 0 THEN RAISE EXCEPTION 'BAD_DISC'; END IF;
  IF _disc_amt = 0 AND _disc_pct > 0 THEN
    _disc_amt := ROUND((_gross + _svc_amt) * _disc_pct / 100, 2);
  END IF;

  IF _comp THEN
    _disc_amt := ROUND(_gross + _svc_amt, 2);
  END IF;

  IF (_disc_amt > 0 OR _comp OR _svc_amt > 0) THEN
    IF _manager_pin IS NULL THEN RAISE EXCEPTION 'PIN_REQUIRED'; END IF;
    _mgr := public.verify_staff_pin(_manager_pin);
    IF _mgr IS NULL THEN RAISE EXCEPTION 'BAD_PIN'; END IF;
    IF NOT (public.has_role(_mgr,'admin') OR public.has_role(_mgr,'manager')) THEN
      RAISE EXCEPTION 'NOT_MANAGER';
    END IF;
    IF (_disc_amt > 0 OR _comp) AND _disc_reason IS NULL THEN
      RAISE EXCEPTION 'REASON_REQUIRED';
    END IF;
  END IF;

  _pre_tax := _gross + _svc_amt;
  IF _pre_tax <= 0 THEN
    _ratio := 0;
  ELSE
    _ratio := GREATEST(0, 1 - LEAST(_disc_amt, _pre_tax) / _pre_tax);
  END IF;
  _base := ROUND((_base + _svc_amt) * _ratio, 2);
  _cgst := ROUND(_cgst * _ratio, 2);
  _sgst := ROUND(_sgst * _ratio, 2);
  _total := _base + _cgst + _sgst;
  _round_off := ROUND(_total)::numeric - _total;
  _total := _total + _round_off;

  IF _comp THEN
    _pay_total := 0;
    _payments := '[]'::jsonb;
  ELSE
    IF jsonb_typeof(_payments) <> 'array' OR jsonb_array_length(_payments) = 0 THEN
      RAISE EXCEPTION 'PAYMENTS_REQUIRED';
    END IF;
    FOR _p IN SELECT * FROM jsonb_array_elements(_payments) LOOP
      IF COALESCE((_p->>'amount')::numeric, 0) <= 0 THEN RAISE EXCEPTION 'BAD_PAYMENT'; END IF;
      _pay_total := _pay_total + (_p->>'amount')::numeric;
    END LOOP;
    IF ROUND(_pay_total, 2) < ROUND(_total, 2) THEN
      RAISE EXCEPTION 'UNDERPAID:%', _total;
    END IF;
  END IF;

  SELECT COALESCE(invoice_prefix, 'HSJ') INTO _prefix FROM public.restaurants WHERE id = _rid;

  -- Derive next sequence from the MAX existing suffix (any status) so voided/reopened
  -- invoices don't collide. Loop with ON CONFLICT retry to be race-safe.
  LOOP
    SELECT COALESCE(MAX((regexp_replace(invoice_no, '^' || _prefix || '-' || _year || '-', ''))::int), 0) + 1
      INTO _seq
      FROM public.invoices
      WHERE restaurant_id = _rid
        AND invoice_no ~ ('^' || _prefix || '-' || _year || '-\d+$');
    _invoice_no := _prefix || '-' || _year || '-' || LPAD(_seq::text, 4, '0');

    BEGIN
      INSERT INTO public.invoices(
        restaurant_id, session_id, invoice_no, base, cgst, sgst, round_off,
        service_charge, discount, total, complimentary, discount_reason, notes, status, issued_by
      ) VALUES (
        _rid, _session_id, _invoice_no, _base, _cgst, _sgst, _round_off,
        _svc_amt, _disc_amt, _total, _comp, _disc_reason, _notes, 'settled', _uid
      ) RETURNING id INTO _inv_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      -- retry with next number
      CONTINUE;
    END;
  END LOOP;

  IF NOT _comp THEN
    INSERT INTO public.payments(restaurant_id, invoice_id, mode, amount, ref_no, created_by)
    SELECT _rid, _inv_id, (p->>'mode')::payment_mode, (p->>'amount')::numeric, NULLIF(p->>'ref_no',''), _uid
      FROM jsonb_array_elements(_payments) p;
  END IF;

  UPDATE public.order_sessions SET status='settled', closed_at=now() WHERE id = _session_id;
  IF _s.table_code IS NOT NULL THEN
    UPDATE public.tables SET status='free' WHERE restaurant_id=_rid AND code=_s.table_code;
  END IF;

  INSERT INTO public.audit_log(restaurant_id, actor, action, entity, entity_id, after)
  VALUES (_rid, _uid, 'settle_bill', 'invoice', _inv_id, jsonb_build_object(
    'invoice_no', _invoice_no, 'total', _total, 'discount', _disc_amt,
    'complimentary', _comp, 'service_charge', _svc_amt
  ));

  RETURN jsonb_build_object(
    'ok', true,
    'invoice_id', _inv_id,
    'invoice_no', _invoice_no,
    'base', _base, 'cgst', _cgst, 'sgst', _sgst,
    'service_charge', _svc_amt, 'discount', _disc_amt,
    'round_off', _round_off, 'total', _total,
    'tendered', _pay_total, 'change', GREATEST(_pay_total - _total, 0)
  );
END $function$;