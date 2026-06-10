-- Fix A (P0-005): Correct wrong column names in audit_log INSERTs inside
-- save_cash_reconciliation() and reopen_cash_reconciliation().
-- The audit_log table defines: actor, entity, after — not actor_id, entity_type, details.
-- No other logic is changed.

CREATE OR REPLACE FUNCTION public.save_cash_reconciliation(
  _business_date date,
  _section_key text,
  _values jsonb,        -- [{cashflow_line_id, manual_value, note}]
  _counts jsonb,        -- [{denomination_id, count}]
  _finalise boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Get or create the reconciliation row
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

  -- Replace manual values (only for cashflow lines with source='manual')
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

  -- Replace denomination counts
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

    -- FIX A: was (actor_id, entity_type, details) — corrected to (actor, entity, after)
    INSERT INTO public.audit_log(restaurant_id, actor, action, entity, entity_id, after)
    VALUES (_rid, _uid, 'finalise', 'cash_reconciliation', _recon_id,
            jsonb_build_object('business_date', _business_date, 'section_key', _section_key));
  END IF;

  RETURN _recon_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.reopen_cash_reconciliation(_recon_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rid uuid := public.current_restaurant_id();
  _uid uuid := auth.uid();
BEGIN
  UPDATE public.cash_reconciliations
     SET status = 'draft', finalised_by = NULL, finalised_at = NULL
   WHERE id = _recon_id AND restaurant_id = _rid;

  -- FIX A: was (actor_id, entity_type, details) — corrected to (actor, entity, after)
  INSERT INTO public.audit_log(restaurant_id, actor, action, entity, entity_id, after)
  VALUES (_rid, _uid, 'reopen', 'cash_reconciliation', _recon_id, '{}'::jsonb);
END;
$$;


-- Fix B (P0-004): Tighten the audit_log INSERT policy so users can only
-- log actions attributed to themselves (actor = auth.uid()).
-- Confirms append-only: no UPDATE or DELETE policies exist on this table,
-- and none are added here.

DROP POLICY IF EXISTS "tenant insert" ON public.audit_log;

CREATE POLICY "tenant insert" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    restaurant_id = public.current_restaurant_id()
    AND actor = auth.uid()
  );
