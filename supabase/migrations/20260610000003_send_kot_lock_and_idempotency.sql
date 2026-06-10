-- P0-002 + P0-003: serialise concurrent sends per stock pool with advisory
-- locks, and make send_kot idempotent via a client-supplied idempotency key.
--
-- Transaction sequence inside send_kot:
--   1. idempotency pre-check (replay returns the original KOT, no side effects)
--   2. validate items, build lines
--   3. pg_advisory_xact_lock per affected pool (ordered by pool_id — deadlock-safe)
--   4. availability check (now race-free: held lock serialises step 4..6)
--   5. INSERT kots ... ON CONFLICT DO NOTHING (second replay barrier)
--   6. ledger debits, table status, return

ALTER TABLE public.kots ADD COLUMN idempotency_key text;
CREATE UNIQUE INDEX idx_kots_idempotency
  ON public.kots(restaurant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- New parameter changes the signature; drop the old one so 3-arg calls
-- (e.g. from settle_takeaway) resolve unambiguously to this function's default.
DROP FUNCTION public.send_kot(uuid, jsonb, text);

CREATE FUNCTION public.send_kot(
  _session_id uuid,
  _items jsonb,
  _note text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
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
  _existing record;
  _it jsonb;
  _mi record;
  _qty numeric;
  _req record;
  _avail numeric;
  _pool uuid;
  _day_start timestamptz;
BEGIN
  IF _rid IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  -- Idempotency pre-check: a replayed request returns the original result
  -- without re-debiting stock or printing a second ticket.
  IF _idempotency_key IS NOT NULL THEN
    SELECT id, kot_no INTO _existing
      FROM public.kots
     WHERE restaurant_id = _rid AND idempotency_key = _idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('kot_id', _existing.id, 'kot_no', _existing.kot_no, 'duplicate', true);
    END IF;
  END IF;

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

  -- Serialise concurrent sends that touch the same pools. Locks are taken in
  -- pool_id order so two KOTs sharing pools never deadlock. Released on
  -- commit/rollback automatically (xact-scoped).
  FOR _pool IN
    SELECT DISTINCT r.stock_pool_id
      FROM _kot_lines l
      JOIN public.menu_items mi ON mi.id = l.menu_item_id
      JOIN public.recipes r ON r.menu_item_id = l.menu_item_id
     WHERE mi.stock_mode = 'counted'
     ORDER BY 1
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(_pool::text, 0));
  END LOOP;

  -- Per-pool required = sum(qty * ratio) across all counted items.
  -- Validate availability against pool_qty(). Race-free under the locks above.
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

  INSERT INTO public.kots(restaurant_id, session_id, kot_no, note, created_by, idempotency_key)
  VALUES (_rid, _session_id, _next_no, NULLIF(_note,''), _uid, _idempotency_key)
  ON CONFLICT (restaurant_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING id INTO _kot_id;

  -- Conflict means a concurrent replay won the race after our pre-check:
  -- return its result and perform no side effects.
  IF _kot_id IS NULL THEN
    SELECT id, kot_no INTO _existing
      FROM public.kots
     WHERE restaurant_id = _rid AND idempotency_key = _idempotency_key;
    RETURN jsonb_build_object('kot_id', _existing.id, 'kot_no', _existing.kot_no, 'duplicate', true);
  END IF;

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

GRANT EXECUTE ON FUNCTION public.send_kot(uuid, jsonb, text, text) TO authenticated;
