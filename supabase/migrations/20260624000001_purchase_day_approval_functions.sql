-- approve_purchase_day / reopen_purchase_day: admin or manager only, with an audit log.

CREATE OR REPLACE FUNCTION public.approve_purchase_day(_business_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _rid uuid := public.current_restaurant_id();
  _uid uuid := auth.uid();
  _name text;
BEGIN
  IF _rid IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF NOT public.can_override_purchases(_uid) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF _business_date > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RAISE EXCEPTION 'FUTURE_DATE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.purchase_day_approvals
     WHERE restaurant_id = _rid AND business_date = _business_date
  ) THEN
    RAISE EXCEPTION 'ALREADY_APPROVED';
  END IF;

  SELECT name INTO _name FROM public.profiles WHERE id = _uid;

  INSERT INTO public.purchase_day_approvals(restaurant_id, business_date, approved_by, approved_by_name)
  VALUES (_rid, _business_date, _uid, COALESCE(NULLIF(btrim(_name), ''), 'Unknown'));

  INSERT INTO public.purchase_day_approval_log(restaurant_id, business_date, action, by_user, by_name)
  VALUES (_rid, _business_date, 'approved', _uid, COALESCE(NULLIF(btrim(_name), ''), 'Unknown'));

  RETURN jsonb_build_object('ok', true);
END $function$;

CREATE OR REPLACE FUNCTION public.reopen_purchase_day(_business_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _rid uuid := public.current_restaurant_id();
  _uid uuid := auth.uid();
  _name text;
BEGIN
  IF _rid IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF NOT public.can_override_purchases(_uid) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;

  DELETE FROM public.purchase_day_approvals
   WHERE restaurant_id = _rid AND business_date = _business_date;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_APPROVED'; END IF;

  SELECT name INTO _name FROM public.profiles WHERE id = _uid;
  INSERT INTO public.purchase_day_approval_log(restaurant_id, business_date, action, by_user, by_name)
  VALUES (_rid, _business_date, 'reopened', _uid, COALESCE(NULLIF(btrim(_name), ''), 'Unknown'));

  RETURN jsonb_build_object('ok', true);
END $function$;

REVOKE EXECUTE ON FUNCTION public.approve_purchase_day(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_purchase_day(date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.reopen_purchase_day(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_purchase_day(date) TO authenticated;
