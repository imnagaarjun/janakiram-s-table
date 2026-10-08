-- Check / approve / send back / reopen a cash day.
--   check ... needs the "check" switch; every active cash point must be closed and tallied
--   approve . needs the "approve" switch; the day must be checked and still tallied
--   send back (checked -> open) needs "approve";  reopen (approved -> checked) is admin only
CREATE OR REPLACE FUNCTION public.cash_day_untallied(_business_date date)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT string_agg(label, ', ' ORDER BY label) FROM public.cash_day_status(_business_date) WHERE NOT tallied;
$$;
REVOKE EXECUTE ON FUNCTION public.cash_day_untallied(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cash_day_untallied(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.check_cash_day(_business_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _rid uuid := public.current_restaurant_id();
  _uid uuid := auth.uid();
  _name text;
  _bad text;
BEGIN
  IF _rid IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF NOT public.cash_recon_perm(_uid, 'check') THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF _business_date > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN RAISE EXCEPTION 'FUTURE_DATE'; END IF;
  IF EXISTS (SELECT 1 FROM public.cash_day_signoffs WHERE restaurant_id = _rid AND business_date = _business_date) THEN
    RAISE EXCEPTION 'ALREADY_CHECKED';
  END IF;
  _bad := public.cash_day_untallied(_business_date);
  IF _bad IS NOT NULL THEN RAISE EXCEPTION 'NOT_TALLIED: %', _bad; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cash_day_status(_business_date)) THEN RAISE EXCEPTION 'NO_SECTIONS'; END IF;

  SELECT COALESCE(NULLIF(btrim(name), ''), 'Unknown') INTO _name FROM public.profiles WHERE id = _uid;
  INSERT INTO public.cash_day_signoffs(restaurant_id, business_date, checked_by, checked_by_name, checked_at)
  VALUES (_rid, _business_date, _uid, COALESCE(_name, 'Unknown'), now());
  INSERT INTO public.cash_day_signoff_log(restaurant_id, business_date, action, by_user, by_name)
  VALUES (_rid, _business_date, 'checked', _uid, COALESCE(_name, 'Unknown'));
  RETURN jsonb_build_object('ok', true);
END $function$;

CREATE OR REPLACE FUNCTION public.approve_cash_day(_business_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _rid uuid := public.current_restaurant_id();
  _uid uuid := auth.uid();
  _name text;
  _row public.cash_day_signoffs;
  _bad text;
BEGIN
  IF _rid IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF NOT public.cash_recon_perm(_uid, 'approve') THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO _row FROM public.cash_day_signoffs WHERE restaurant_id = _rid AND business_date = _business_date;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_CHECKED'; END IF;
  IF _row.approved_by IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_APPROVED'; END IF;
  _bad := public.cash_day_untallied(_business_date);
  IF _bad IS NOT NULL THEN RAISE EXCEPTION 'NOT_TALLIED: %', _bad; END IF;

  SELECT COALESCE(NULLIF(btrim(name), ''), 'Unknown') INTO _name FROM public.profiles WHERE id = _uid;
  UPDATE public.cash_day_signoffs
     SET approved_by = _uid, approved_by_name = COALESCE(_name, 'Unknown'), approved_at = now()
   WHERE restaurant_id = _rid AND business_date = _business_date;
  INSERT INTO public.cash_day_signoff_log(restaurant_id, business_date, action, by_user, by_name)
  VALUES (_rid, _business_date, 'approved', _uid, COALESCE(_name, 'Unknown'));
  RETURN jsonb_build_object('ok', true);
END $function$;

CREATE OR REPLACE FUNCTION public.send_back_cash_day(_business_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _rid uuid := public.current_restaurant_id();
  _uid uuid := auth.uid();
  _name text;
  _row public.cash_day_signoffs;
BEGIN
  IF _rid IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF NOT public.cash_recon_perm(_uid, 'approve') THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO _row FROM public.cash_day_signoffs WHERE restaurant_id = _rid AND business_date = _business_date;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_CHECKED'; END IF;
  IF _row.approved_by IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_APPROVED'; END IF;
  DELETE FROM public.cash_day_signoffs WHERE restaurant_id = _rid AND business_date = _business_date;
  SELECT COALESCE(NULLIF(btrim(name), ''), 'Unknown') INTO _name FROM public.profiles WHERE id = _uid;
  INSERT INTO public.cash_day_signoff_log(restaurant_id, business_date, action, by_user, by_name)
  VALUES (_rid, _business_date, 'sent_back', _uid, COALESCE(_name, 'Unknown'));
  RETURN jsonb_build_object('ok', true);
END $function$;

CREATE OR REPLACE FUNCTION public.reopen_cash_day(_business_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _rid uuid := public.current_restaurant_id();
  _uid uuid := auth.uid();
  _name text;
  _row public.cash_day_signoffs;
BEGIN
  IF _rid IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;
  IF NOT public.has_role(_uid, 'admin') THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO _row FROM public.cash_day_signoffs WHERE restaurant_id = _rid AND business_date = _business_date;
  IF NOT FOUND OR _row.approved_by IS NULL THEN RAISE EXCEPTION 'NOT_APPROVED'; END IF;
  UPDATE public.cash_day_signoffs SET approved_by = NULL, approved_by_name = NULL, approved_at = NULL
   WHERE restaurant_id = _rid AND business_date = _business_date;
  SELECT COALESCE(NULLIF(btrim(name), ''), 'Unknown') INTO _name FROM public.profiles WHERE id = _uid;
  INSERT INTO public.cash_day_signoff_log(restaurant_id, business_date, action, by_user, by_name)
  VALUES (_rid, _business_date, 'reopened', _uid, COALESCE(_name, 'Unknown'));
  RETURN jsonb_build_object('ok', true);
END $function$;

REVOKE EXECUTE ON FUNCTION public.check_cash_day(date), public.approve_cash_day(date),
  public.send_back_cash_day(date), public.reopen_cash_day(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_cash_day(date), public.approve_cash_day(date),
  public.send_back_cash_day(date), public.reopen_cash_day(date) TO authenticated;
