
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS service_charge_pct numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoice_prefix text NOT NULL DEFAULT 'HSJ';

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS complimentary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS discount_reason text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS print_payload jsonb,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'settled',
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS void_reason text,
  ADD COLUMN IF NOT EXISTS reopened_at timestamptz;

-- ============================================================
-- request_bill: waiter taps "request bill" on their table
-- ============================================================
CREATE OR REPLACE FUNCTION public.request_bill(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _rid uuid := public.current_restaurant_id();
  _s record;
BEGIN
  IF _rid IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  SELECT * INTO _s FROM public.order_sessions WHERE id = _session_id AND restaurant_id = _rid;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF _s.status <> 'open' THEN RAISE EXCEPTION 'NOT_OPEN'; END IF;

  UPDATE public.order_sessions SET status = 'bill_requested' WHERE id = _session_id;
  IF _s.table_code IS NOT NULL THEN
    UPDATE public.tables SET status = 'bill_requested'
      WHERE restaurant_id = _rid AND code = _s.table_code;
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.request_bill(uuid) TO authenticated;

-- ============================================================
-- settle_bill: cashier finalises payment
--   _params: { discount_amt?, discount_pct?, discount_reason?, complimentary?, service_charge_pct?, manager_pin?, notes? }
--   _payments: [{ mode: 'cash'|'upi'|'card'|'other', amount: num, ref_no?: text }]
-- ============================================================
CREATE OR REPLACE FUNCTION public.settle_bill(_session_id uuid, _params jsonb, _payments jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  -- Aggregate active (non-void) lines by item using the session channel
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

  -- Service charge applied on pre-tax base
  IF _svc_pct < 0 OR _svc_pct > 100 THEN RAISE EXCEPTION 'BAD_SVC'; END IF;
  _svc_amt := ROUND(_base * _svc_pct / 100, 2);

  -- Discount value (use absolute amount if both provided)
  IF _disc_pct < 0 OR _disc_pct > 100 THEN RAISE EXCEPTION 'BAD_DISC'; END IF;
  IF _disc_amt < 0 THEN RAISE EXCEPTION 'BAD_DISC'; END IF;
  IF _disc_amt = 0 AND _disc_pct > 0 THEN
    _disc_amt := ROUND((_gross + _svc_amt) * _disc_pct / 100, 2);
  END IF;

  IF _comp THEN
    _disc_amt := ROUND(_gross + _svc_amt, 2);
  END IF;

  -- Manager pin required for discount / comp / service charge override (>0)
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

  -- Apply discount proportionally across base + cgst + sgst (treat as reduction of gross)
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
  -- Round to nearest rupee
  _round_off := ROUND(_total)::numeric - _total;
  _total := _total + _round_off;

  -- Validate payments
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
    -- Allow over-tender (change due). Reject under-payment.
    IF ROUND(_pay_total, 2) < ROUND(_total, 2) THEN
      RAISE EXCEPTION 'UNDERPAID:%', _total;
    END IF;
  END IF;

  -- Generate invoice number HSJ-YYYY-####
  SELECT COALESCE(invoice_prefix, 'HSJ') INTO _prefix FROM public.restaurants WHERE id = _rid;
  SELECT COUNT(*) + 1 INTO _seq
    FROM public.invoices
    WHERE restaurant_id = _rid
      AND invoice_no LIKE _prefix || '-' || _year || '-%'
      AND status = 'settled';
  _invoice_no := _prefix || '-' || _year || '-' || LPAD(_seq::text, 4, '0');

  INSERT INTO public.invoices(
    restaurant_id, session_id, invoice_no, base, cgst, sgst, round_off,
    service_charge, discount, total, complimentary, discount_reason, notes, status, issued_by
  ) VALUES (
    _rid, _session_id, _invoice_no, _base, _cgst, _sgst, _round_off,
    _svc_amt, _disc_amt, _total, _comp, _disc_reason, _notes, 'settled', _uid
  ) RETURNING id INTO _inv_id;

  IF NOT _comp THEN
    INSERT INTO public.payments(restaurant_id, invoice_id, mode, amount, ref_no, created_by)
    SELECT _rid, _inv_id, (p->>'mode')::payment_mode, (p->>'amount')::numeric, NULLIF(p->>'ref_no',''), _uid
      FROM jsonb_array_elements(_payments) p;
  END IF;

  -- Close session + free table
  UPDATE public.order_sessions SET status='settled', closed_at=now() WHERE id = _session_id;
  IF _s.table_code IS NOT NULL THEN
    UPDATE public.tables SET status='free' WHERE restaurant_id=_rid AND code=_s.table_code;
  END IF;

  -- Audit
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

-- ============================================================
-- reopen_invoice: manager re-opens a settled invoice (same business day)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reopen_invoice(_invoice_id uuid, _manager_pin text, _reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _rid uuid := public.current_restaurant_id();
  _uid uuid := auth.uid();
  _mgr uuid;
  _inv record;
  _day_start timestamptz;
BEGIN
  IF _rid IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF COALESCE(_reason,'') = '' THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  _mgr := public.verify_staff_pin(_manager_pin);
  IF _mgr IS NULL THEN RAISE EXCEPTION 'BAD_PIN'; END IF;
  IF NOT (public.has_role(_mgr,'admin') OR public.has_role(_mgr,'manager')) THEN
    RAISE EXCEPTION 'NOT_MANAGER';
  END IF;

  SELECT * INTO _inv FROM public.invoices WHERE id=_invoice_id AND restaurant_id=_rid;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF _inv.status <> 'settled' THEN RAISE EXCEPTION 'NOT_SETTLED'; END IF;

  _day_start := public.business_day_start(_rid);
  IF _inv.issued_at < _day_start THEN RAISE EXCEPTION 'OLD_INVOICE'; END IF;

  UPDATE public.invoices SET status='voided', voided_at=now(), voided_by=_uid,
    void_reason=_reason, reopened_at=now()
    WHERE id=_invoice_id;
  DELETE FROM public.payments WHERE invoice_id=_invoice_id;

  UPDATE public.order_sessions SET status='open', closed_at=NULL WHERE id=_inv.session_id;
  UPDATE public.tables t SET status='occupied'
    FROM public.order_sessions s
   WHERE s.id=_inv.session_id AND t.code=s.table_code AND t.restaurant_id=_rid;

  INSERT INTO public.audit_log(restaurant_id, actor, action, entity, entity_id, after)
  VALUES (_rid, _uid, 'reopen_invoice', 'invoice', _invoice_id,
    jsonb_build_object('approved_by', _mgr, 'reason', _reason));

  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.reopen_invoice(uuid, text, text) TO authenticated;
