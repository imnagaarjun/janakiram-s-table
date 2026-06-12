-- Admin security, user management, and module settings

-- 1. profiles: add security columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS admin_otp_hash text,
  ADD COLUMN IF NOT EXISTS admin_otp_expires_at timestamptz;

-- 2. Update set_staff_pin to enforce 8-digit minimum for admin role
CREATE OR REPLACE FUNCTION public.set_staff_pin(_user_id uuid, _pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _is_admin boolean;
BEGIN
  IF _pin !~ '^\d+$' THEN
    RAISE EXCEPTION 'PIN must be numeric';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM user_roles WHERE user_id = _user_id AND role = 'admin'
  ) INTO _is_admin;

  IF _is_admin AND length(_pin) < 8 THEN
    RAISE EXCEPTION 'Admin PIN must be at least 8 digits';
  END IF;

  IF length(_pin) < 4 THEN
    RAISE EXCEPTION 'PIN must be at least 4 digits';
  END IF;

  UPDATE profiles
  SET pin_hash = extensions.crypt(_pin, extensions.gen_salt('bf'))
  WHERE id = _user_id;
END;
$$;

-- 3. Update pin_login_lookup to check is_active
CREATE OR REPLACE FUNCTION public.pin_login_lookup(_pin text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _email text;
  _recent_failures int;
BEGIN
  DELETE FROM public.pin_login_failures WHERE attempted_at < now() - interval '5 minutes';

  SELECT COUNT(*) INTO _recent_failures
    FROM public.pin_login_failures
   WHERE attempted_at >= now() - interval '5 minutes';

  IF _recent_failures >= 5 THEN
    RAISE EXCEPTION 'PIN_LOCKED';
  END IF;

  SELECT auth_email INTO _email
    FROM public.profiles
   WHERE pin_hash = extensions.crypt(_pin, pin_hash)
     AND is_active = true
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

-- 4. RPC to generate and store admin OTP (returns plaintext code for server fn to email)
CREATE OR REPLACE FUNCTION public.request_admin_otp(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _code text;
BEGIN
  _code := LPAD(FLOOR(RANDOM() * 1000000)::int::text, 6, '0');

  UPDATE profiles
  SET admin_otp_hash = extensions.crypt(_code, extensions.gen_salt('bf')),
      admin_otp_expires_at = now() + interval '10 minutes'
  WHERE id = _user_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  RETURN _code;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_admin_otp(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_admin_otp(uuid) TO service_role;

-- 5. RPC to verify admin OTP
CREATE OR REPLACE FUNCTION public.verify_admin_otp(_user_id uuid, _otp text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _valid boolean;
BEGIN
  SELECT admin_otp_hash IS NOT NULL
    AND admin_otp_expires_at > now()
    AND extensions.crypt(_otp, admin_otp_hash) = admin_otp_hash
  INTO _valid
  FROM profiles
  WHERE id = _user_id;

  IF _valid THEN
    UPDATE profiles
    SET admin_otp_hash = NULL,
        admin_otp_expires_at = NULL,
        last_active_at = now()
    WHERE id = _user_id;
  END IF;

  RETURN COALESCE(_valid, false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_admin_otp(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_admin_otp(uuid, text) TO service_role;

-- 6. RPC to touch last_active_at (called periodically by frontend)
CREATE OR REPLACE FUNCTION public.touch_active()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE profiles SET last_active_at = now() WHERE id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.touch_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_active() TO authenticated;

-- 7. Module settings table
CREATE TABLE IF NOT EXISTS public.module_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  module text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  UNIQUE (restaurant_id, module)
);

ALTER TABLE public.module_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "module_settings_read" ON public.module_settings
  FOR SELECT TO authenticated
  USING (
    restaurant_id = (SELECT restaurant_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "module_settings_write" ON public.module_settings
  FOR ALL TO authenticated
  USING (
    restaurant_id = (SELECT restaurant_id FROM profiles WHERE id = auth.uid())
    AND (SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  );

-- Seed default module rows for all existing restaurants
INSERT INTO public.module_settings (restaurant_id, module, enabled)
SELECT r.id, m.module, true
FROM restaurants r,
  (VALUES
    ('tables'), ('menu'), ('kds'), ('reports'),
    ('stock'), ('waiters'), ('vendors'), ('purchases'),
    ('cash_recon'), ('users')
  ) AS m(module)
ON CONFLICT (restaurant_id, module) DO NOTHING;
