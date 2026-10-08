-- save_cash_reconciliation now also stores the day's one-off lines, and refuses changes
-- once the day has been checked (send it back first).
DROP FUNCTION IF EXISTS public.save_cash_reconciliation(date, text, jsonb, jsonb, boolean);

CREATE OR REPLACE FUNCTION public.save_cash_reconciliation(
  _business_date date,
  _section_key text,
  _values jsonb,
  _counts jsonb,
  _finalise boolean,
  _extras jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _rid uuid := public.current_restaurant_id();
  _uid uuid := auth.uid();
  _recon_id uuid;
  _status text;
  _v jsonb;
  _c jsonb;
  _x jsonb;
  _n int := 0;
  _line public.cashflow_lines%ROWTYPE;
BEGIN
  IF _rid IS NULL THEN RAISE EXCEPTION 'No restaurant context'; END IF;

  IF EXISTS (SELECT 1 FROM public.cash_day_signoffs WHERE restaurant_id = _rid AND business_date = _business_date) THEN
    RAISE EXCEPTION 'DAY_CHECKED: This day is checked. Ask an approver to send it back before changing it.';
  END IF;

  SELECT id, status INTO _recon_id, _status
  FROM public.cash_reconciliations
  WHERE restaurant_id = _rid AND business_date = _business_date AND section_key = _section_key
  FOR UPDATE;

  IF _recon_id IS NULL THEN
    INSERT INTO public.cash_reconciliations(restaurant_id, business_date, section_key, status, created_by)
    VALUES (_rid, _business_date, _section_key, 'draft', _uid)
    RETURNING id INTO _recon_id;
    _status := 'draft';
  END IF;

  IF _status = 'finalised' THEN
    RAISE EXCEPTION 'Reconciliation is finalised. Reopen before editing.';
  END IF;

  DELETE FROM public.cash_recon_values WHERE reconciliation_id = _recon_id;

  IF _values IS NOT NULL AND jsonb_typeof(_values) = 'array' THEN
    FOR _v IN SELECT * FROM jsonb_array_elements(_values) LOOP
      SELECT * INTO _line FROM public.cashflow_lines
      WHERE id = (_v->>'cashflow_line_id')::uuid AND restaurant_id = _rid AND section_key = _section_key;
      IF _line.id IS NOT NULL AND _line.source = 'manual' THEN
        INSERT INTO public.cash_recon_values(restaurant_id, reconciliation_id, cashflow_line_id, manual_value, note)
        VALUES (_rid, _recon_id, _line.id, COALESCE((_v->>'manual_value')::numeric, 0), NULLIF(_v->>'note', ''));
      END IF;
    END LOOP;
  END IF;

  FOR _line IN
    SELECT * FROM public.cashflow_lines
    WHERE restaurant_id = _rid AND section_key = _section_key AND is_active AND source = 'auto_cash_expense'
  LOOP
    INSERT INTO public.cash_recon_values(restaurant_id, reconciliation_id, cashflow_line_id, manual_value)
    VALUES (_rid, _recon_id, _line.id, public.cash_expense_total(_business_date, _section_key));
  END LOOP;

  -- One-off lines for this day only (typed by hand, never automatic).
  IF _extras IS NOT NULL AND jsonb_typeof(_extras) = 'array' THEN
    DELETE FROM public.cash_recon_extra_lines WHERE reconciliation_id = _recon_id;
    FOR _x IN SELECT * FROM jsonb_array_elements(_extras) LOOP
      _n := _n + 1;
      IF _n > 30 THEN RAISE EXCEPTION 'Too many extra lines (max 30)'; END IF;
      IF btrim(COALESCE(_x->>'label', '')) = '' THEN RAISE EXCEPTION 'Every extra line needs a name'; END IF;
      IF (_x->>'sign') NOT IN ('add', 'subtract') THEN RAISE EXCEPTION 'Extra line sign must be + or -'; END IF;
      IF COALESCE((_x->>'amount')::numeric, 0) < 0 THEN RAISE EXCEPTION 'Extra line amount cannot be negative'; END IF;
      INSERT INTO public.cash_recon_extra_lines(restaurant_id, reconciliation_id, label, sign, amount, display_order, created_by)
      VALUES (_rid, _recon_id, left(btrim(_x->>'label'), 40), _x->>'sign',
              COALESCE((_x->>'amount')::numeric, 0), _n, _uid);
    END LOOP;
  END IF;

  DELETE FROM public.denomination_counts WHERE reconciliation_id = _recon_id;

  IF _counts IS NOT NULL AND jsonb_typeof(_counts) = 'array' THEN
    FOR _c IN SELECT * FROM jsonb_array_elements(_counts) LOOP
      INSERT INTO public.denomination_counts(restaurant_id, reconciliation_id, denomination_id, count)
      SELECT _rid, _recon_id, dc.id, COALESCE((_c->>'count')::numeric, 0)
      FROM public.denomination_config dc
      WHERE dc.id = (_c->>'denomination_id')::uuid AND dc.restaurant_id = _rid;
    END LOOP;
  END IF;

  IF _finalise THEN
    UPDATE public.cash_reconciliations
       SET status = 'finalised', finalised_by = _uid, finalised_at = now()
     WHERE id = _recon_id;
    INSERT INTO public.audit_log(restaurant_id, actor, action, entity, entity_id, after)
    VALUES (_rid, _uid, 'finalise', 'cash_reconciliation', _recon_id,
            jsonb_build_object('business_date', _business_date, 'section_key', _section_key));
  END IF;

  RETURN _recon_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.save_cash_reconciliation(date, text, jsonb, jsonb, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_cash_reconciliation(date, text, jsonb, jsonb, boolean, jsonb) TO authenticated;

-- A checked day cannot have a cash point reopened underneath it.
CREATE OR REPLACE FUNCTION public.reopen_cash_reconciliation(_recon_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _rid uuid := public.current_restaurant_id();
  _uid uuid := auth.uid();
  _date date;
BEGIN
  SELECT business_date INTO _date FROM public.cash_reconciliations WHERE id = _recon_id AND restaurant_id = _rid;
  IF _date IS NULL THEN RAISE EXCEPTION 'Reconciliation not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.cash_day_signoffs WHERE restaurant_id = _rid AND business_date = _date) THEN
    RAISE EXCEPTION 'DAY_CHECKED: This day is checked. Ask an approver to send it back first.';
  END IF;
  UPDATE public.cash_reconciliations
     SET status = 'draft', finalised_by = NULL, finalised_at = NULL
   WHERE id = _recon_id AND restaurant_id = _rid;
  INSERT INTO public.audit_log(restaurant_id, actor, action, entity, entity_id, after)
  VALUES (_rid, _uid, 'reopen', 'cash_reconciliation', _recon_id, '{}'::jsonb);
END;
$$;
GRANT EXECUTE ON FUNCTION public.reopen_cash_reconciliation(uuid) TO authenticated;
