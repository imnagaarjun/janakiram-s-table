
-- Live stock updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_ledger;
ALTER PUBLICATION supabase_realtime ADD TABLE public.kots;
ALTER PUBLICATION supabase_realtime ADD TABLE public.kot_items;

-- Helper to verify a staff PIN. Returns matching user_id, or NULL if none.
CREATE OR REPLACE FUNCTION public.verify_staff_pin(_pin text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles
  WHERE pin = _pin
    AND restaurant_id = public.current_restaurant_id()
  LIMIT 1;
$$;

-- Atomic Send KOT
CREATE OR REPLACE FUNCTION public.send_kot(
  _session_id uuid,
  _items jsonb,
  _note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  _rid uuid := public.current_restaurant_id();
  _uid uuid := auth.uid();
  _session record;
  _next_no int;
  _kot_id uuid;
  _it jsonb;
  _mi record;
  _qty numeric;
  _note_line text;
  _req record;
  _avail numeric;
  _day_start timestamptz;
BEGIN
  IF _rid IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'EMPTY_KOT';
  END IF;

  SELECT * INTO _session FROM public.order_sessions
   WHERE id = _session_id AND restaurant_id = _rid;
  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
  IF _session.status <> 'open' THEN RAISE EXCEPTION 'SESSION_CLOSED'; END IF;

  -- Validate each item + accumulate per-pool requirements
  CREATE TEMP TABLE IF NOT EXISTS _kot_lines(
    menu_item_id uuid, qty numeric, note text, name text
  ) ON COMMIT DROP;
  DELETE FROM _kot_lines;

  FOR _it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _qty := COALESCE((_it->>'qty')::numeric, 0);
    IF _qty <= 0 THEN RAISE EXCEPTION 'BAD_QTY'; END IF;

    SELECT id, name, stock_mode, is_active, is_86
      INTO _mi
      FROM public.menu_items
     WHERE id = (_it->>'menu_item_id')::uuid AND restaurant_id = _rid;
    IF NOT FOUND THEN RAISE EXCEPTION 'ITEM_NOT_FOUND'; END IF;
    IF NOT _mi.is_active THEN RAISE EXCEPTION 'ITEM_INACTIVE:%', _mi.name; END IF;
    IF _mi.is_86 THEN RAISE EXCEPTION 'ITEM_86:%', _mi.name; END IF;

    INSERT INTO _kot_lines(menu_item_id, qty, note, name)
    VALUES (_mi.id, _qty, NULLIF(_it->>'note',''), _mi.name);
  END LOOP;

  -- Per-pool required = sum(qty * ratio) across all counted items.
  -- Validate availability against pool_qty().
  FOR _req IN
    SELECT r.stock_pool_id AS pool_id,
           SUM(l.qty * r.consume_ratio) AS required,
           MIN(l.name) AS sample_name
      FROM _kot_lines l
      JOIN public.menu_items mi ON mi.id = l.menu_item_id
      JOIN public.recipes r ON r.menu_item_id = l.menu_item_id
     WHERE mi.stock_mode = 'counted'
     GROUP BY r.stock_pool_id
  LOOP
    _avail := public.pool_qty(_req.pool_id);
    IF _avail < _req.required THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK:%:%', _req.sample_name,
        GREATEST(FLOOR(_avail)::int, 0);
    END IF;
  END LOOP;

  -- Also reject counted items with NO recipe (truly zero availability)
  IF EXISTS (
    SELECT 1 FROM _kot_lines l
    JOIN public.menu_items mi ON mi.id = l.menu_item_id
    WHERE mi.stock_mode = 'counted'
      AND NOT EXISTS (SELECT 1 FROM public.recipes r WHERE r.menu_item_id = l.menu_item_id)
  ) THEN
    RAISE EXCEPTION 'NO_STOCK_DEFINED';
  END IF;

  -- Daily KOT number (per restaurant, per business day)
  _day_start := public.business_day_start(_rid);
  SELECT COALESCE(MAX(kot_no), 0) + 1 INTO _next_no
    FROM public.kots
   WHERE restaurant_id = _rid AND sent_at >= _day_start;

  INSERT INTO public.kots(restaurant_id, session_id, kot_no, note, created_by)
  VALUES (_rid, _session_id, _next_no, NULLIF(_note,''), _uid)
  RETURNING id INTO _kot_id;

  INSERT INTO public.kot_items(restaurant_id, kot_id, menu_item_id, qty, note)
  SELECT _rid, _kot_id, menu_item_id, qty, note FROM _kot_lines;

  -- Debit stock ledger per pool
  INSERT INTO public.stock_ledger(restaurant_id, pool_id, qty_delta, reason, ref_id, note, created_by)
  SELECT _rid, r.stock_pool_id, -SUM(l.qty * r.consume_ratio),
         'sale'::ledger_reason, _kot_id,
         'KOT #' || _next_no, _uid
    FROM _kot_lines l
    JOIN public.menu_items mi ON mi.id = l.menu_item_id
    JOIN public.recipes r ON r.menu_item_id = l.menu_item_id
   WHERE mi.stock_mode = 'counted'
   GROUP BY r.stock_pool_id;

  -- Mark table occupied
  IF _session.table_code IS NOT NULL THEN
    UPDATE public.tables
       SET status = 'occupied'
     WHERE restaurant_id = _rid AND code = _session.table_code;
  END IF;

  RETURN jsonb_build_object('kot_id', _kot_id, 'kot_no', _next_no);
END;
$func$;

-- Void a single sent KOT line (manager PIN required)
CREATE OR REPLACE FUNCTION public.void_kot_item(
  _kot_item_id uuid,
  _reason text,
  _note text,
  _manager_pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  _rid uuid := public.current_restaurant_id();
  _uid uuid := auth.uid();
  _mgr uuid;
  _ki record;
  _mi record;
BEGIN
  IF _rid IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF COALESCE(_reason,'') = '' THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;

  _mgr := public.verify_staff_pin(_manager_pin);
  IF _mgr IS NULL THEN RAISE EXCEPTION 'BAD_PIN'; END IF;
  IF NOT (public.has_role(_mgr,'admin') OR public.has_role(_mgr,'manager')) THEN
    RAISE EXCEPTION 'NOT_MANAGER';
  END IF;

  SELECT * INTO _ki FROM public.kot_items
   WHERE id = _kot_item_id AND restaurant_id = _rid;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF _ki.status = 'void' THEN RAISE EXCEPTION 'ALREADY_VOID'; END IF;

  SELECT id, name, stock_mode INTO _mi FROM public.menu_items WHERE id = _ki.menu_item_id;

  UPDATE public.kot_items
     SET status = 'void',
         note = CONCAT_WS(' | ', NULLIF(note,''), 'VOID: ' || _reason || COALESCE(' — ' || NULLIF(_note,''), ''))
   WHERE id = _kot_item_id;

  -- Return stock for counted items
  IF _mi.stock_mode = 'counted' THEN
    INSERT INTO public.stock_ledger(restaurant_id, pool_id, qty_delta, reason, ref_id, note, created_by)
    SELECT _rid, r.stock_pool_id, _ki.qty * r.consume_ratio,
           'void'::ledger_reason, _kot_item_id,
           'Void: ' || _reason, _uid
      FROM public.recipes r
     WHERE r.menu_item_id = _ki.menu_item_id;
  END IF;

  INSERT INTO public.audit_log(restaurant_id, actor, action, entity, entity_id, after)
  VALUES (_rid, _uid, 'void_kot_item', 'kot_item', _kot_item_id,
          jsonb_build_object(
            'reason', _reason,
            'note', _note,
            'menu_item', _mi.name,
            'qty', _ki.qty,
            'approved_by', _mgr
          ));

  RETURN jsonb_build_object('ok', true);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.send_kot(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_kot_item(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_staff_pin(text) TO authenticated;
