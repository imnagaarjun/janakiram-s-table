-- Sign-off actions, part 1 of 2: check_purchase_day and approve_purchase_day.
--   check_purchase_day .... needs the "check" permission
--   approve_purchase_day .. needs the "approve" permission, and the day must be checked first

CREATE OR REPLACE FUNCTION public.check_purchase_day(_business_date date)
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
  IF NOT public.purchase_perm(_uid, 'check') THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF _business_date > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RAISE EXCEPTION 'FUTURE_DATE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.purchase_day_approvals
     WHERE restaurant_id = _rid AND business_date = _business_date
  ) THEN
    RAISE EXCEPTION 'ALREADY_CHECKED';
  END IF;

  SELECT COALESCE(NULLIF(btrim(name), ''), 'Unknown') INTO _name FROM public.profiles WHERE id = _uid;

  INSERT INTO public.purchase_day_approvals(restaurant_id, business_date, checked_by, checked_by_name, checked_at)
  VALUES (_rid, _business_date, _uid, COALESCE(_name, 'Unknown'), now());
  INSERT INTO public.purchase_day_approval_log(restaurant_id, business_date, action, by_user, by_name)
  VALUES (_rid, _business_date, 'checked', _uid, COALESCE(_name, 'Unknown'));

  RETURN jsonb_build_object('ok', true);
END $function$;

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
  _row public.purchase_day_approvals;
BEGIN
  IF _rid IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF NOT public.purchase_perm(_uid, 'approve') THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;

  SELECT * INTO _row FROM public.purchase_day_approvals
   WHERE restaurant_id = _rid AND business_date = _business_date;
  IF NOT FOUND OR _row.checked_by IS NULL THEN RAISE EXCEPTION 'NOT_CHECKED'; END IF;
  IF _row.approved_by IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_APPROVED'; END IF;

  SELECT COALESCE(NULLIF(btrim(name), ''), 'Unknown') INTO _name FROM public.profiles WHERE id = _uid;

  UPDATE public.purchase_day_approvals
     SET approved_by = _uid, approved_by_name = COALESCE(_name, 'Unknown'), approved_at = now()
   WHERE restaurant_id = _rid AND business_date = _business_date;
  INSERT INTO public.purchase_day_approval_log(restaurant_id, business_date, action, by_user, by_name)
  VALUES (_rid, _business_date, 'approved', _uid, COALESCE(_name, 'Unknown'));

  RETURN jsonb_build_object('ok', true);
END $function$;

REVOKE EXECUTE ON FUNCTION public.check_purchase_day(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_purchase_day(date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.approve_purchase_day(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_purchase_day(date) TO authenticated;
