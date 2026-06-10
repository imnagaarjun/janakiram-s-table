-- P1-001: Add business_date to kots, invoices, stock_ledger.
--
-- Design:
--   restaurants.business_day_close_time is a TIME value (e.g. '04:00').
--   A transaction timestamped at e.g. 02:30 IST on 2026-06-11 but belonging
--   to a restaurant whose day closes at 04:00 should carry business_date
--   2026-06-10, not 2026-06-11.
--
--   current_business_date(_rid) encapsulates this: if IST hour-of-day is
--   before the close hour, subtract one calendar day.
--
--   All three write RPCs (send_kot, settle_bill, settle_takeaway) are
--   recreated here to store business_date at insert time.
--   section_finance() is updated to filter on invoices.business_date
--   instead of casting issued_at to IST date.

-- ─── 1. Helper: compute current business date for a restaurant ───────────────

CREATE OR REPLACE FUNCTION public.current_business_date(_rid uuid)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXTRACT(HOUR FROM (now() AT TIME ZONE 'Asia/Kolkata'))::int
         < EXTRACT(HOUR FROM r.business_day_close_time)::int
    THEN (now() AT TIME ZONE 'Asia/Kolkata')::date - 1
    ELSE (now() AT TIME ZONE 'Asia/Kolkata')::date
  END
  FROM public.restaurants r
  WHERE r.id = _rid;
$$;

REVOKE ALL ON FUNCTION public.current_business_date(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_business_date(uuid) TO authenticated, service_role;

-- ─── 2. Add columns ──────────────────────────────────────────────────────────

ALTER TABLE public.kots         ADD COLUMN IF NOT EXISTS business_date date;
ALTER TABLE public.invoices     ADD COLUMN IF NOT EXISTS business_date date;
ALTER TABLE public.stock_ledger ADD COLUMN IF NOT EXISTS business_date date;

-- ─── 3. Backfill existing rows ───────────────────────────────────────────────
-- Uses IST date of the source timestamp as a safe approximation.
-- Rows written before this migration have no restaurant context here, so we
-- use the simplest correct backfill: IST calendar date of the timestamp.
-- Midnight-crossing rows from the old schema are a known acceptable loss.

UPDATE public.kots
   SET business_date = (sent_at AT TIME ZONE 'Asia/Kolkata')::date
 WHERE business_date IS NULL;

UPDATE public.invoices
   SET business_date = (issued_at AT TIME ZONE 'Asia/Kolkata')::date
 WHERE business_date IS NULL;

UPDATE public.stock_ledger
   SET business_date = (created_at AT TIME ZONE 'Asia/Kolkata')::date
 WHERE business_date IS NULL;

-- Make NOT NULL now that every row is populated.
ALTER TABLE public.kots         ALTER COLUMN business_date SET NOT NULL;
ALTER TABLE public.invoices     ALTER COLUMN business_date SET NOT NULL;
ALTER TABLE public.stock_ledger ALTER COLUMN business_date SET NOT NULL;

-- ─── 4. Indexes ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_kots_rid_bdate
  ON public.kots(restaurant_id, business_date);

CREATE INDEX IF NOT EXISTS idx_invoices_rid_bdate
  ON public.invoices(restaurant_id, business_date);

CREATE INDEX IF NOT EXISTS idx_stock_ledger_rid_bdate
  ON public.stock_ledger(restaurant_id, business_date);

-- ─── 5. section_finance: filter on business_date instead of AT TIME ZONE cast ─

CREATE OR REPLACE FUNCTION public.section_finance(_business_date date, _section_key text)
RETURNS TABLE (
  sales_total numeric,
  gpay_total numeric,
  card_total numeric,
  swiggy_total numeric,
  cash_sales_total numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH rid AS (SELECT public.current_restaurant_id() AS r),
  scoped_invoices AS (
    SELECT i.id, i.total
    FROM public.invoices i
    JOIN public.order_sessions s ON s.id = i.session_id
    LEFT JOIN public.tables t
      ON t.code = s.table_code AND t.restaurant_id = i.restaurant_id
    WHERE i.restaurant_id = (SELECT r FROM rid)
      AND i.status = 'settled'
      AND i.business_date = _business_date          -- was: (issued_at AT TIME ZONE 'Asia/Kolkata')::date
      AND CASE
            WHEN s.channel = 'takeaway' THEN 'Takeaway'
            ELSE COALESCE(t.section, 'NON-AC')
          END = _section_key
  ),
  pay AS (
    SELECT p.mode, p.amount
    FROM public.payments p
    JOIN scoped_invoices si ON si.id = p.invoice_id
  )
  SELECT
    COALESCE((SELECT SUM(total) FROM scoped_invoices), 0)::numeric           AS sales_total,
    COALESCE((SELECT SUM(amount) FROM pay WHERE mode = 'upi'), 0)::numeric   AS gpay_total,
    COALESCE((SELECT SUM(amount) FROM pay WHERE mode = 'card'), 0)::numeric  AS card_total,
    0::numeric                                                                AS swiggy_total,
    COALESCE((SELECT SUM(amount) FROM pay WHERE mode = 'cash'), 0)::numeric  AS cash_sales_total;
$$;

-- ─── 6. send_kot: set business_date on kots and stock_ledger ─────────────────
-- Drops and replaces the 4-arg function introduced in migration 000003.

DROP FUNCTION IF EXISTS public.send_kot(uuid, jsonb, text, text);

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
  _bdate date;
BEGIN
  IF _rid IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  -- Idempotency pre-check
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

  -- Compute business date once for this transaction
  _bdate := public.current_business_date(_rid);

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

  -- Serialise concurrent sends per pool (deadlock-safe: ordered by pool_id)
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

  -- Availability check (race-free under locks)
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

  IF EXISTS (
    SELECT 1 FROM _kot_lines l
    JOIN public.menu_items mi ON mi.id = l.menu_item_id
    WHERE mi.stock_mode = 'counted'
      AND NOT EXISTS (SELECT 1 FROM public.recipes r WHERE r.menu_item_id = l.menu_item_id)
  ) THEN
    RAISE EXCEPTION 'NO_STOCK_DEFINED';
  END IF;

  -- Daily KOT number (per restaurant, per business date)
  SELECT COALESCE(MAX(kot_no), 0) + 1 INTO _next_no
    FROM public.kots
   WHERE restaurant_id = _rid AND business_date = _bdate;

  INSERT INTO public.kots(restaurant_id, session_id, kot_no, note, created_by, idempotency_key, business_date)
  VALUES (_rid, _session_id, _next_no, NULLIF(_note,''), _uid, _idempotency_key, _bdate)
  ON CONFLICT (restaurant_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING id INTO _kot_id;

  IF _kot_id IS NULL THEN
    SELECT id, kot_no INTO _existing
      FROM public.kots
     WHERE restaurant_id = _rid AND idempotency_key = _idempotency_key;
    RETURN jsonb_build_object('kot_id', _existing.id, 'kot_no', _existing.kot_no, 'duplicate', true);
  END IF;

  INSERT INTO public.kot_items(restaurant_id, kot_id, menu_item_id, qty, note)
  SELECT _rid, _kot_id, menu_item_id, qty, note FROM _kot_lines;

  -- Debit stock ledger — include business_date
  INSERT INTO public.stock_ledger(restaurant_id, pool_id, qty_delta, reason, ref_id, note, created_by, business_date)
  SELECT _rid, r.stock_pool_id, -SUM(l.qty * r.consume_ratio),
         'sale'::ledger_reason, _kot_id,
         'KOT #' || _next_no, _uid, _bdate
    FROM _kot_lines l
    JOIN public.menu_items mi ON mi.id = l.menu_item_id
    JOIN public.recipes r ON r.menu_item_id = l.menu_item_id
   WHERE mi.stock_mode = 'counted'
   GROUP BY r.stock_pool_id;

  IF _session.table_code IS NOT NULL THEN
    UPDATE public.tables
       SET status = 'occupied'
     WHERE restaurant_id = _rid AND code = _session.table_code;
  END IF;

  RETURN jsonb_build_object('kot_id', _kot_id, 'kot_no', _next_no);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.send_kot(uuid, jsonb, text, text) TO authenticated;

-- ─── 7. settle_bill: set business_date on invoices ───────────────────────────
-- Full function replacement; only the INSERT into invoices and the invoice
-- number derivation change (use business_date instead of issued_at cast).

DROP FUNCTION IF EXISTS public.settle_bill(uuid, jsonb, jsonb);

CREATE FUNCTION public.settle_bill(_session_id uuid, _params jsonb, _payments jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _rid uuid := public.current_restaurant_id();
  _uid uuid := auth.uid();
  _s record;
  _prefix text;
  _year text;
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
  _bdate date;
BEGIN
  IF _rid IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF NOT (public.has_role(_uid,'admin') OR public.has_role(_uid,'manager') OR public.has_role(_uid,'cashier')) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;

  SELECT * INTO _s FROM public.order_sessions WHERE id = _session_id AND restaurant_id = _rid;
  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
  IF _s.status NOT IN ('open','bill_requested') THEN RAISE EXCEPTION 'SESSION_CLOSED'; END IF;

  -- Compute business date once; use it for invoice numbering and storage
  _bdate := public.current_business_date(_rid);
  _year  := to_char(_bdate, 'YYYY');

  -- Aggregate active (non-void) lines
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
    ON mp.menu_item_id = l.menu_item_id AND mp.channel_key = _s.channel;

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

  -- Invoice number uses business_date year and counts settled invoices for that business date
  SELECT COALESCE(invoice_prefix, 'HSJ') INTO _prefix FROM public.restaurants WHERE id = _rid;
  SELECT COUNT(*) + 1 INTO _seq
    FROM public.invoices
    WHERE restaurant_id = _rid
      AND invoice_no LIKE _prefix || '-' || _year || '-%'
      AND status = 'settled';
  _invoice_no := _prefix || '-' || _year || '-' || LPAD(_seq::text, 4, '0');

  INSERT INTO public.invoices(
    restaurant_id, session_id, invoice_no, base, cgst, sgst, round_off,
    service_charge, discount, total, complimentary, discount_reason, notes,
    status, issued_by, business_date
  ) VALUES (
    _rid, _session_id, _invoice_no, _base, _cgst, _sgst, _round_off,
    _svc_amt, _disc_amt, _total, _comp, _disc_reason, _notes,
    'settled', _uid, _bdate
  ) RETURNING id INTO _inv_id;

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
END $$;

GRANT EXECUTE ON FUNCTION public.settle_bill(uuid, jsonb, jsonb) TO authenticated;

-- ─── 8. settle_takeaway: propagate business_date ─────────────────────────────
-- settle_takeaway calls send_kot and settle_bill which now both set business_date
-- internally, so no data change needed here — only the pre-check query must
-- reference business_date for consistency and the function is refreshed to
-- match the updated settle_bill signature.

DROP FUNCTION IF EXISTS public.settle_takeaway(uuid, jsonb, text, jsonb, jsonb, text);

CREATE FUNCTION public.settle_takeaway(
  _session_id uuid,
  _items jsonb,
  _kot_note text,
  _params jsonb,
  _payments jsonb,
  _idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rid uuid := public.current_restaurant_id();
  _s record;
  _kot jsonb;
  _settle jsonb;
  _existing record;
BEGIN
  IF _rid IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  SELECT * INTO _s FROM public.order_sessions
   WHERE id = _session_id AND restaurant_id = _rid;
  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
  IF _s.channel <> 'takeaway' THEN RAISE EXCEPTION 'NOT_TAKEAWAY'; END IF;
  IF _s.status NOT IN ('open','bill_requested') THEN RAISE EXCEPTION 'SESSION_CLOSED'; END IF;

  -- Pre-check: return existing settled result without re-executing
  SELECT i.id, i.invoice_no, i.total,
         i.base, i.cgst, i.sgst, i.service_charge, i.discount, i.round_off,
         k.kot_no
    INTO _existing
    FROM public.invoices i
    JOIN public.kots k ON k.session_id = _session_id
   WHERE i.restaurant_id = _rid
     AND i.session_id = _session_id
     AND i.status = 'settled'
   ORDER BY i.created_at DESC
   LIMIT 1;

  IF _existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'kot_no',         _existing.kot_no,
      'invoice_no',     _existing.invoice_no,
      'total',          _existing.total,
      'tendered',       _existing.total,
      'change',         0,
      'base',           _existing.base,
      'cgst',           _existing.cgst,
      'sgst',           _existing.sgst,
      'service_charge', _existing.service_charge,
      'discount',       _existing.discount,
      'round_off',      _existing.round_off,
      'duplicate',      true
    );
  END IF;

  _kot    := public.send_kot(_session_id, _items, _kot_note, _idempotency_key);
  _settle := public.settle_bill(_session_id, _params, _payments);

  RETURN jsonb_build_object(
    'kot_no',         (_kot->>'kot_no')::int,
    'invoice_no',     _settle->>'invoice_no',
    'total',          (_settle->>'total')::numeric,
    'tendered',       (_settle->>'tendered')::numeric,
    'change',         (_settle->>'change')::numeric,
    'base',           (_settle->>'base')::numeric,
    'cgst',           (_settle->>'cgst')::numeric,
    'sgst',           (_settle->>'sgst')::numeric,
    'service_charge', (_settle->>'service_charge')::numeric,
    'discount',       (_settle->>'discount')::numeric,
    'round_off',      (_settle->>'round_off')::numeric
  );
END $$;

GRANT EXECUTE ON FUNCTION public.settle_takeaway(uuid, jsonb, text, jsonb, jsonb, text) TO authenticated;

-- ─── 9. close_business_day: set business_date on carry-forward ledger entries ─
-- The wastage/adjustment entries are for the closing day; the carry-forward
-- entry is for the NEXT business day. We re-create the function here to pass
-- _bdate explicitly instead of deriving from created_at.

DROP FUNCTION IF EXISTS public.close_business_day(jsonb);

CREATE FUNCTION public.close_business_day(_decisions jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _rid uuid := current_restaurant_id();
  _uid uuid := auth.uid();
  _next_start timestamptz;
  _bdate date;
  _next_bdate date;
  _rec jsonb;
  _pool uuid;
  _action text;
  _qty numeric;
BEGIN
  IF _rid IS NULL THEN RAISE EXCEPTION 'no restaurant context'; END IF;
  IF NOT (public.has_role(_uid,'admin') OR public.has_role(_uid,'manager')) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  _bdate      := public.current_business_date(_rid);
  _next_bdate := _bdate + 1;
  _next_start := public.business_day_start(_rid) + interval '1 day';

  FOR _rec IN SELECT * FROM jsonb_array_elements(_decisions) LOOP
    _pool   := (_rec->>'pool_id')::uuid;
    _action := _rec->>'action';
    _qty    := COALESCE((_rec->>'qty')::numeric, 0);
    IF _qty <= 0 THEN CONTINUE; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.stock_pools WHERE id = _pool AND restaurant_id = _rid) THEN
      CONTINUE;
    END IF;

    IF _action = 'wastage' THEN
      INSERT INTO public.stock_ledger(restaurant_id, pool_id, qty_delta, reason, note, created_by, business_date)
      VALUES (_rid, _pool, -_qty, 'wastage', 'End-of-day wastage', _uid, _bdate);

      INSERT INTO public.audit_log(restaurant_id, actor, action, entity, entity_id, after)
      VALUES (_rid, _uid, 'close_day_wastage', 'stock_pool', _pool, jsonb_build_object('qty', _qty));

    ELSIF _action = 'carry_forward' THEN
      INSERT INTO public.stock_ledger(restaurant_id, pool_id, qty_delta, reason, note, created_by, business_date)
      VALUES (_rid, _pool, -_qty, 'adjustment', 'End-of-day clear before carry-forward', _uid, _bdate);

      INSERT INTO public.stock_ledger(restaurant_id, pool_id, qty_delta, reason, note, created_by, created_at, business_date)
      VALUES (_rid, _pool, _qty, 'opening', 'Carry-forward from previous day', _uid, _next_start, _next_bdate);

      INSERT INTO public.audit_log(restaurant_id, actor, action, entity, entity_id, after)
      VALUES (_rid, _uid, 'close_day_carry_forward', 'stock_pool', _pool, jsonb_build_object('qty', _qty));
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.close_business_day(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_business_day(jsonb) TO authenticated, service_role;
