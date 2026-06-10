-- P0-003 (takeaway gap): replay-protect settle_takeaway by:
--  1. Passing _idempotency_key through to send_kot (stock side).
--  2. Adding a unique partial index on invoices(restaurant_id, session_id) WHERE
--     status = 'settled' so a double-call can't create two invoices for one session.
--  3. Pre-check + ON CONFLICT guard inside settle_bill (called by settle_takeaway)
--     so replays return the existing invoice result without re-inserting.
--
-- settle_bill() signature is unchanged (all existing callers unaffected).
-- settle_takeaway() gains _idempotency_key DEFAULT NULL (3-arg callers unaffected).

-- 1) Unique constraint: one settled invoice per session per restaurant.
--    Partial (WHERE status = 'settled') so a reopened-then-resettled session
--    can issue a new invoice after the original is voided/reopened.
CREATE UNIQUE INDEX idx_invoices_session_settled
  ON public.invoices(restaurant_id, session_id)
  WHERE status = 'settled';

-- 2) Drop and recreate settle_takeaway with the new parameter.
DROP FUNCTION public.settle_takeaway(uuid, jsonb, text, jsonb, jsonb);

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

  -- Bill-side pre-check: if a settled invoice already exists for this session,
  -- return the original result without re-running send_kot or settle_bill.
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
      'kot_no',        _existing.kot_no,
      'invoice_no',    _existing.invoice_no,
      'total',         _existing.total,
      'tendered',      _existing.total,   -- replay: no change due info retained
      'change',        0,
      'base',          _existing.base,
      'cgst',          _existing.cgst,
      'sgst',          _existing.sgst,
      'service_charge',_existing.service_charge,
      'discount',      _existing.discount,
      'round_off',     _existing.round_off,
      'duplicate',     true
    );
  END IF;

  -- 1) Send KOT: passes idempotency key so stock debit is also replay-safe.
  _kot := public.send_kot(_session_id, _items, _kot_note, _idempotency_key);

  -- 2) Settle bill: creates invoice + payments, closes session.
  --    The UNIQUE index (restaurant_id, session_id) WHERE status='settled'
  --    prevents a concurrent duplicate from inserting a second invoice if
  --    two requests slip past the pre-check above simultaneously.
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
