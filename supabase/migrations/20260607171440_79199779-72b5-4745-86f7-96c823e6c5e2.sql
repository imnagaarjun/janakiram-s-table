
CREATE OR REPLACE FUNCTION public.bump_kot(_kot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rid uuid := public.current_restaurant_id();
  _uid uuid := auth.uid();
  _k record;
BEGIN
  IF _rid IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  SELECT * INTO _k FROM public.kots WHERE id = _kot_id AND restaurant_id = _rid;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF _k.status = 'ready' OR _k.status = 'served' THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  UPDATE public.kots SET status = 'ready', updated_at = now() WHERE id = _kot_id;
  UPDATE public.kot_items SET status = 'ready', updated_at = now()
    WHERE kot_id = _kot_id AND status NOT IN ('void','served');

  INSERT INTO public.audit_log(restaurant_id, actor, action, entity, entity_id, after)
  VALUES (_rid, _uid, 'bump_kot', 'kot', _kot_id, jsonb_build_object('kot_no', _k.kot_no));

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.bump_kot(uuid) TO authenticated;
