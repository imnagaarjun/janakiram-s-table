-- Sign-off actions, part 2 of 2: send_back_purchase_day and reopen_purchase_day.
--   send_back_purchase_day  checked -> open again; needs "approve" (or admin)
--   reopen_purchase_day ... approved -> checked again; admin only

CREATE OR REPLACE FUNCTION public.send_back_purchase_day(_business_date date)
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
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_CHECKED'; END IF;
  IF _row.approved_by IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_APPROVED'; END IF;

  DELETE FROM public.purchase_day_approvals
   WHERE restaurant_id = _rid AND business_date = _business_date;

  SELECT COALESCE(NULLIF(btrim(name), ''), 'Unknown') INTO _name FROM public.profiles WHERE id = _uid;
  INSERT INTO public.purchase_day_approval_log(restaurant_id, business_date, action, by_user, by_name)
  VALUES (_rid, _business_date, 'sent_back', _uid, COALESCE(_name, 'Unknown'));

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
  _row public.purchase_day_approvals;
BEGIN
  IF _rid IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF NOT public.has_role(_uid, 'admin') THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;

  SELECT * INTO _row FROM public.purchase_day_approvals
   WHERE restaurant_id = _rid AND business_date = _business_date;
  IF NOT FOUND OR _row.approved_by IS NULL THEN RAISE EXCEPTION 'NOT_APPROVED'; END IF;

  UPDATE public.purchase_day_approvals
     SET approved_by = NULL, approved_by_name = NULL, approved_at = NULL,
         revised_by = NULL, revised_by_name = NULL, revised_at = NULL
   WHERE restaurant_id = _rid AND business_date = _business_date;

  SELECT COALESCE(NULLIF(btrim(name), ''), 'Unknown') INTO _name FROM public.profiles WHERE id = _uid;
  INSERT INTO public.purchase_day_approval_log(restaurant_id, business_date, action, by_user, by_name)
  VALUES (_rid, _business_date, 'reopened', _uid, COALESCE(_name, 'Unknown'));

  RETURN jsonb_build_object('ok', true);
END $function$;

REVOKE EXECUTE ON FUNCTION public.send_back_purchase_day(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_back_purchase_day(date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.reopen_purchase_day(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_purchase_day(date) TO authenticated;
