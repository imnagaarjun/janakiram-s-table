
CREATE OR REPLACE FUNCTION public.business_day_start(_rid uuid)
RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (((now() AT TIME ZONE 'Asia/Kolkata')::date)::timestamp AT TIME ZONE 'Asia/Kolkata');
$$;

REVOKE ALL ON FUNCTION public.business_day_start(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.business_day_start(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.close_business_day(_decisions jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

      INSERT INTO public.audit_log(restaurant_id, actor_id, action, entity, entity_id, after)
      VALUES (_rid, _uid, 'close_day_wastage', 'stock_pool', _pool, jsonb_build_object('qty', _qty));

    ELSIF _action = 'carry_forward' THEN
      INSERT INTO public.stock_ledger(restaurant_id, pool_id, qty_delta, reason, note, created_by)
      VALUES (_rid, _pool, -_qty, 'adjustment', 'End-of-day clear before carry-forward', _uid);

      INSERT INTO public.stock_ledger(restaurant_id, pool_id, qty_delta, reason, note, created_by, created_at)
      VALUES (_rid, _pool, _qty, 'opening', 'Carry-forward from previous day', _uid, _next_start);

      INSERT INTO public.audit_log(restaurant_id, actor_id, action, entity, entity_id, after)
      VALUES (_rid, _uid, 'close_day_carry_forward', 'stock_pool', _pool, jsonb_build_object('qty', _qty));
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.close_business_day(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_business_day(jsonb) TO authenticated, service_role;
