CREATE OR REPLACE FUNCTION public.settle_takeaway(
  _session_id uuid,
  _items jsonb,
  _kot_note text,
  _params jsonb,
  _payments jsonb
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
BEGIN
  IF _rid IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  SELECT * INTO _s FROM public.order_sessions
   WHERE id = _session_id AND restaurant_id = _rid;
  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
  IF _s.channel <> 'takeaway' THEN RAISE EXCEPTION 'NOT_TAKEAWAY'; END IF;
  IF _s.status NOT IN ('open','bill_requested') THEN RAISE EXCEPTION 'SESSION_CLOSED'; END IF;

  -- 1) Send KOT (validates stock, creates kot + kot_items, debits ledger)
  _kot := public.send_kot(_session_id, _items, _kot_note);

  -- 2) Settle bill (creates invoice, payments, closes session)
  _settle := public.settle_bill(_session_id, _params, _payments);

  RETURN jsonb_build_object(
    'kot_no', (_kot->>'kot_no')::int,
    'invoice_no', _settle->>'invoice_no',
    'total', (_settle->>'total')::numeric,
    'tendered', (_settle->>'tendered')::numeric,
    'change', (_settle->>'change')::numeric,
    'base', (_settle->>'base')::numeric,
    'cgst', (_settle->>'cgst')::numeric,
    'sgst', (_settle->>'sgst')::numeric,
    'service_charge', (_settle->>'service_charge')::numeric,
    'discount', (_settle->>'discount')::numeric,
    'round_off', (_settle->>'round_off')::numeric
  );
END $$;

GRANT EXECUTE ON FUNCTION public.settle_takeaway(uuid, jsonb, text, jsonb, jsonb) TO authenticated;