
CREATE OR REPLACE FUNCTION public.close_business_day(_decisions jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _rid uuid := current_restaurant_id();
  _uid uuid := auth.uid();
  _next_start timestamptz;
  _rec jsonb;
  _pool uuid;
  _action text;
  _qty numeric;
BEGIN
  IF _rid IS NULL THEN RAISE EXCEPTION 'no restaurant context'; END IF;
  IF NOT (public.has_role(_uid,'admin') OR public.has_role(_uid,'manager')) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  _next_start := public.business_day_start(_rid) + interval '1 day';

  FOR _rec IN SELECT * FROM jsonb_array_elements(_decisions) LOOP
    _pool := (_rec->>'pool_id')::uuid;
    _action := _rec->>'action';
    _qty := COALESCE((_rec->>'qty')::numeric, 0);
    IF _qty <= 0 THEN CONTINUE; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.stock_pools WHERE id = _pool AND restaurant_id = _rid) THEN
      CONTINUE;
    END IF;

    IF _action = 'wastage' THEN
      INSERT INTO public.stock_ledger(restaurant_id, pool_id, qty_delta, reason, note, created_by)
      VALUES (_rid, _pool, -_qty, 'wastage', 'End-of-day wastage', _uid);

      INSERT INTO public.audit_log(restaurant_id, actor, action, entity, entity_id, after)
      VALUES (_rid, _uid, 'close_day_wastage', 'stock_pool', _pool, jsonb_build_object('qty', _qty));

    ELSIF _action = 'carry_forward' THEN
      INSERT INTO public.stock_ledger(restaurant_id, pool_id, qty_delta, reason, note, created_by)
      VALUES (_rid, _pool, -_qty, 'adjustment', 'End-of-day clear before carry-forward', _uid);

      INSERT INTO public.stock_ledger(restaurant_id, pool_id, qty_delta, reason, note, created_by, created_at)
      VALUES (_rid, _pool, _qty, 'opening', 'Carry-forward from previous day', _uid, _next_start);

      INSERT INTO public.audit_log(restaurant_id, actor, action, entity, entity_id, after)
      VALUES (_rid, _uid, 'close_day_carry_forward', 'stock_pool', _pool, jsonb_build_object('qty', _qty));
    END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_cash_reconciliation(_business_date date, _section_key text, _values jsonb, _counts jsonb, _finalise boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _rid uuid := public.current_restaurant_id();
  _uid uuid := auth.uid();
  _recon_id uuid;
  _status text;
  _v jsonb;
  _c jsonb;
  _line record;
BEGIN
  IF _rid IS NULL THEN
    RAISE EXCEPTION 'No restaurant context';
  END IF;

  SELECT id, status INTO _recon_id, _status
  FROM public.cash_reconciliations
  WHERE restaurant_id = _rid
    AND business_date = _business_date
    AND section_key = _section_key
  FOR UPDATE;

  IF _recon_id IS NULL THEN
    INSERT INTO public.cash_reconciliations(
      restaurant_id, business_date, section_key, status, created_by
    ) VALUES (
      _rid, _business_date, _section_key, 'draft', _uid
    ) RETURNING id INTO _recon_id;
    _status := 'draft';
  END IF;

  IF _status = 'finalised' THEN
    RAISE EXCEPTION 'Reconciliation is finalised. Reopen before editing.';
  END IF;

  DELETE FROM public.cash_recon_values WHERE reconciliation_id = _recon_id;

  IF _values IS NOT NULL AND jsonb_typeof(_values) = 'array' THEN
    FOR _v IN SELECT * FROM jsonb_array_elements(_values) LOOP
      SELECT id, source INTO _line
      FROM public.cashflow_lines
      WHERE id = (_v->>'cashflow_line_id')::uuid
        AND restaurant_id = _rid
        AND section_key = _section_key;

      IF _line.id IS NOT NULL AND _line.source = 'manual' THEN
        INSERT INTO public.cash_recon_values(
          restaurant_id, reconciliation_id, cashflow_line_id, manual_value, note
        ) VALUES (
          _rid, _recon_id, _line.id,
          COALESCE((_v->>'manual_value')::numeric, 0),
          NULLIF(_v->>'note', '')
        );
      END IF;
    END LOOP;
  END IF;

  DELETE FROM public.denomination_counts WHERE reconciliation_id = _recon_id;

  IF _counts IS NOT NULL AND jsonb_typeof(_counts) = 'array' THEN
    FOR _c IN SELECT * FROM jsonb_array_elements(_counts) LOOP
      INSERT INTO public.denomination_counts(
        restaurant_id, reconciliation_id, denomination_id, count
      )
      SELECT _rid, _recon_id, dc.id, COALESCE((_c->>'count')::numeric, 0)
      FROM public.denomination_config dc
      WHERE dc.id = (_c->>'denomination_id')::uuid
        AND dc.restaurant_id = _rid;
    END LOOP;
  END IF;

  IF _finalise THEN
    UPDATE public.cash_reconciliations
       SET status = 'finalised',
           finalised_by = _uid,
           finalised_at = now()
     WHERE id = _recon_id;

    INSERT INTO public.audit_log(restaurant_id, actor, action, entity, entity_id, after)
    VALUES (_rid, _uid, 'finalise_cash_reconciliation', 'cash_reconciliation', _recon_id,
            jsonb_build_object('business_date', _business_date, 'section_key', _section_key));
  END IF;

  RETURN _recon_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reopen_cash_reconciliation(_recon_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _rid uuid := public.current_restaurant_id();
  _uid uuid := auth.uid();
BEGIN
  UPDATE public.cash_reconciliations
     SET status = 'draft', finalised_by = NULL, finalised_at = NULL
   WHERE id = _recon_id AND restaurant_id = _rid;

  INSERT INTO public.audit_log(restaurant_id, actor, action, entity, entity_id, after)
  VALUES (_rid, _uid, 'reopen_cash_reconciliation', 'cash_reconciliation', _recon_id, '{}'::jsonb);
END;
$function$;
