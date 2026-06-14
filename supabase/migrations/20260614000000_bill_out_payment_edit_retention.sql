-- Bill-out flag, post-settlement payment-mode editing, and bill retention
-- ============================================================================

-- 1. invoices: bill_out flag + payment edit counter
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS bill_out boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bill_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_edits integer NOT NULL DEFAULT 0;

-- 2. profiles: per-user opt-in to edit payment mode (admin grants this; cashiers
--    are allowed implicitly via role)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_edit_payment boolean NOT NULL DEFAULT false;

-- 3. restaurants: retention cutoff for bill records. NULL = keep everything.
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS bill_retention_until date;

-- ============================================================================
-- 4. set_bill_out: record whether the customer took the physical bill out.
--    Allowed for admin / manager / cashier.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_bill_out(_invoice_id uuid, _bill_out boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _rid uuid := public.current_restaurant_id();
  _uid uuid := auth.uid();
  _inv record;
BEGIN
  IF _rid IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF NOT (public.has_role(_uid,'admin') OR public.has_role(_uid,'manager') OR public.has_role(_uid,'cashier')) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;

  SELECT * INTO _inv FROM public.invoices WHERE id=_invoice_id AND restaurant_id=_rid;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF _inv.status <> 'settled' THEN RAISE EXCEPTION 'NOT_SETTLED'; END IF;

  UPDATE public.invoices
     SET bill_out = _bill_out,
         bill_out_at = CASE WHEN _bill_out THEN now() ELSE NULL END
   WHERE id = _invoice_id;

  INSERT INTO public.audit_log(restaurant_id, actor, action, entity, entity_id, after)
  VALUES (_rid, _uid, 'set_bill_out', 'invoice', _invoice_id,
    jsonb_build_object('bill_out', _bill_out));

  RETURN jsonb_build_object('ok', true, 'bill_out', _bill_out);
END $$;

GRANT EXECUTE ON FUNCTION public.set_bill_out(uuid, boolean) TO authenticated;

-- ============================================================================
-- 5. change_payment_modes: replace the payment rows on a settled invoice.
--    - admin: unlimited edits
--    - cashier OR profiles.can_edit_payment: exactly ONE edit per bill, ever
--    The provided _payments must sum to the invoice total (unless total = 0).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.change_payment_modes(_invoice_id uuid, _payments jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _rid uuid := public.current_restaurant_id();
  _uid uuid := auth.uid();
  _inv record;
  _is_admin boolean;
  _may_edit boolean;
  _pay_total numeric(12,2);
BEGIN
  IF _rid IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  SELECT * INTO _inv FROM public.invoices WHERE id=_invoice_id AND restaurant_id=_rid;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF _inv.status <> 'settled' THEN RAISE EXCEPTION 'NOT_SETTLED'; END IF;

  _is_admin := public.has_role(_uid,'admin');

  IF NOT _is_admin THEN
    -- cashiers are allowed implicitly; others need the per-user opt-in
    _may_edit := public.has_role(_uid,'cashier')
      OR COALESCE((SELECT can_edit_payment FROM public.profiles WHERE id=_uid), false);
    IF NOT _may_edit THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
    IF _inv.payment_edits >= 1 THEN RAISE EXCEPTION 'ALREADY_EDITED'; END IF;
  END IF;

  -- Validate the payment total matches the invoice total
  SELECT COALESCE(SUM((p->>'amount')::numeric), 0) INTO _pay_total
    FROM jsonb_array_elements(_payments) p;

  IF _inv.total > 0 AND abs(_pay_total - _inv.total) > 0.01 THEN
    RAISE EXCEPTION 'AMOUNT_MISMATCH';
  END IF;

  DELETE FROM public.payments WHERE invoice_id=_invoice_id;
  IF jsonb_array_length(_payments) > 0 THEN
    INSERT INTO public.payments(restaurant_id, invoice_id, mode, amount, ref_no, created_by)
    SELECT _rid, _invoice_id, (p->>'mode')::payment_mode, (p->>'amount')::numeric,
           NULLIF(p->>'ref_no',''), _uid
      FROM jsonb_array_elements(_payments) p;
  END IF;

  UPDATE public.invoices SET payment_edits = payment_edits + 1 WHERE id=_invoice_id;

  INSERT INTO public.audit_log(restaurant_id, actor, action, entity, entity_id, after)
  VALUES (_rid, _uid, 'change_payment_modes', 'invoice', _invoice_id,
    jsonb_build_object('payments', _payments, 'by_admin', _is_admin));

  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.change_payment_modes(uuid, jsonb) TO authenticated;

-- ============================================================================
-- 6. find_invoice_by_no: look up a settled invoice by its number (for the
--    "view bill" feature on the Tables tab). Returns the invoice id.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.find_invoice_by_no(_invoice_no text)
RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.invoices
   WHERE restaurant_id = public.current_restaurant_id()
     AND invoice_no = _invoice_no
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.find_invoice_by_no(text) TO authenticated;
