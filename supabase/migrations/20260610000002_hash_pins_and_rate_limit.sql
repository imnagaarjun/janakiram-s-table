-- P0-001 + P1-008: Hash staff PINs with bcrypt (pgcrypto) and add lockout.
--
-- IRREVERSIBLE: the plaintext `pin` column is dropped after hashing.
--
-- Lockout design (failures must be attributable to be counted):
--  * verify_staff_pin(): the CALLER is authenticated, so failed attempts are
--    counted on the caller's profile (failed_pin_attempts / pin_locked_until).
--    5 failures -> caller locked out of PIN verification for 5 minutes.
--  * pin_login_lookup(): unauthenticated login — a wrong PIN matches no profile,
--    so failures are tracked in a windowed table (pin_login_failures).
--    5 failures within 5 minutes -> login locked for 5 minutes.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Migrate plaintext pins to bcrypt hashes
-- pin_hash stays nullable: profiles are created first, then the PIN is set via
-- set_staff_pin(). A NULL hash never matches (crypt(x, NULL) IS NULL).
ALTER TABLE public.profiles ADD COLUMN pin_hash text;
UPDATE public.profiles SET pin_hash = crypt(pin, gen_salt('bf', 10));

-- Hashes cannot be uniqueness-indexed; per-restaurant PIN uniqueness is
-- re-enforced inside set_staff_pin() below.
DROP INDEX IF EXISTS public.profiles_pin_unique;
ALTER TABLE public.profiles DROP COLUMN pin;

-- 2) Lockout state
ALTER TABLE public.profiles
  ADD COLUMN failed_pin_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN pin_locked_until timestamptz;

CREATE TABLE public.pin_login_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pin_login_failures ENABLE ROW LEVEL SECURITY;
-- No policies: not readable/writable by clients. Only SECURITY DEFINER
-- functions and service_role touch this table.
GRANT ALL ON public.pin_login_failures TO service_role;
CREATE INDEX idx_pin_login_failures_at ON public.pin_login_failures(attempted_at);

-- 3) verify_staff_pin: same signature and return type as before so all
--    existing callers (void_kot_item, settle_bill, settle_takeaway) keep
--    working. Now compares bcrypt hashes and enforces caller lockout.
CREATE OR REPLACE FUNCTION public.verify_staff_pin(_pin text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _rid uuid := public.current_restaurant_id();
  _locked_until timestamptz;
  _attempts int;
  _match uuid;
BEGIN
  IF _caller IS NULL OR _rid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT pin_locked_until, failed_pin_attempts
    INTO _locked_until, _attempts
    FROM public.profiles
   WHERE id = _caller
   FOR UPDATE;

  IF _locked_until IS NOT NULL AND _locked_until > now() THEN
    RAISE EXCEPTION 'PIN_LOCKED:%', CEIL(EXTRACT(EPOCH FROM (_locked_until - now())) / 60)::int;
  END IF;

  SELECT id INTO _match
    FROM public.profiles
   WHERE restaurant_id = _rid
     AND pin_hash = crypt(_pin, pin_hash)
   LIMIT 1;

  IF _match IS NOT NULL THEN
    UPDATE public.profiles
       SET failed_pin_attempts = 0, pin_locked_until = NULL
     WHERE id = _caller;
    RETURN _match;
  END IF;

  _attempts := COALESCE(_attempts, 0) + 1;
  IF _attempts >= 5 THEN
    UPDATE public.profiles
       SET failed_pin_attempts = 0,
           pin_locked_until = now() + interval '5 minutes'
     WHERE id = _caller;
  ELSE
    UPDATE public.profiles
       SET failed_pin_attempts = _attempts
     WHERE id = _caller;
  END IF;

  RETURN NULL;
END;
$$;

-- 4) Login lookup: returns auth_email for a matching PIN, or NULL.
--    Callable ONLY by service_role (the pinLogin server function).
CREATE OR REPLACE FUNCTION public.pin_login_lookup(_pin text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text;
  _recent_failures int;
BEGIN
  -- Opportunistic cleanup of expired failure records
  DELETE FROM public.pin_login_failures WHERE attempted_at < now() - interval '5 minutes';

  SELECT COUNT(*) INTO _recent_failures
    FROM public.pin_login_failures
   WHERE attempted_at >= now() - interval '5 minutes';

  IF _recent_failures >= 5 THEN
    RAISE EXCEPTION 'PIN_LOCKED';
  END IF;

  SELECT auth_email INTO _email
    FROM public.profiles
   WHERE pin_hash = crypt(_pin, pin_hash)
   LIMIT 1;

  IF _email IS NULL THEN
    INSERT INTO public.pin_login_failures DEFAULT VALUES;
    RETURN NULL;
  END IF;

  RETURN _email;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pin_login_lookup(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pin_login_lookup(text) TO service_role;

-- 5) Setting/resetting a PIN (admin only, or service_role e.g. during seeding).
--    Enforces 4-digit format and per-restaurant uniqueness against the hashes.
CREATE OR REPLACE FUNCTION public.set_staff_pin(_user_id uuid, _pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _target_rid uuid;
BEGIN
  -- service_role calls have no auth.uid(); authenticated callers must be admin
  IF _caller IS NOT NULL AND NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;

  IF _pin !~ '^\d{4}$' THEN
    RAISE EXCEPTION 'PIN_FORMAT';
  END IF;

  SELECT restaurant_id INTO _target_rid FROM public.profiles WHERE id = _user_id;
  IF _target_rid IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
     WHERE restaurant_id = _target_rid
       AND id <> _user_id
       AND pin_hash = crypt(_pin, pin_hash)
  ) THEN
    RAISE EXCEPTION 'PIN_TAKEN';
  END IF;

  UPDATE public.profiles
     SET pin_hash = crypt(_pin, gen_salt('bf', 10)),
         failed_pin_attempts = 0,
         pin_locked_until = NULL
   WHERE id = _user_id;

  INSERT INTO public.audit_log(restaurant_id, actor, action, entity, entity_id, after)
  VALUES (_target_rid, _caller, 'pin_reset', 'profile', _user_id, '{}'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_staff_pin(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_staff_pin(uuid, text) TO authenticated, service_role;
