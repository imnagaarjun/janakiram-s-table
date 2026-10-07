-- Daily purchase sheet sign-off in two stages: CHECKED, then APPROVED.
--
-- Who may do what (admin = the owner; "check" and "approve" are assigned per person):
--   * Open sheet ........ anyone who can record purchases may edit it.
--   * Checked sheet ..... only people allowed to approve, and admin, may correct it.
--   * Approved sheet .... only admin may change it.
-- Safe to run whether or not the earlier one-stage version was applied.

CREATE TABLE IF NOT EXISTS public.purchase_day_approvals (
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  checked_by uuid,
  checked_by_name text,
  checked_at timestamptz,
  approved_by uuid,
  approved_by_name text,
  approved_at timestamptz,
  corrected_by uuid,
  corrected_by_name text,
  corrected_at timestamptz,
  revised_by uuid,
  revised_by_name text,
  revised_at timestamptz,
  PRIMARY KEY (restaurant_id, business_date)
);

-- Upgrade from the one-stage version (approval only).
ALTER TABLE public.purchase_day_approvals
  ADD COLUMN IF NOT EXISTS checked_by uuid,
  ADD COLUMN IF NOT EXISTS checked_by_name text,
  ADD COLUMN IF NOT EXISTS checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS corrected_by uuid,
  ADD COLUMN IF NOT EXISTS corrected_by_name text,
  ADD COLUMN IF NOT EXISTS corrected_at timestamptz,
  ALTER COLUMN approved_by DROP NOT NULL,
  ALTER COLUMN approved_by_name DROP NOT NULL,
  ALTER COLUMN approved_at DROP NOT NULL,
  ALTER COLUMN approved_at DROP DEFAULT;

-- Days already approved count as checked by the same person.
UPDATE public.purchase_day_approvals
   SET checked_by = approved_by, checked_by_name = approved_by_name, checked_at = approved_at
 WHERE checked_by IS NULL AND approved_by IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.purchase_day_approval_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  action text NOT NULL,
  by_user uuid,
  by_name text,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_purchase_day_approval_log_day
  ON public.purchase_day_approval_log (restaurant_id, business_date);

ALTER TABLE public.purchase_day_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_day_approval_log ENABLE ROW LEVEL SECURITY;

-- Everyone in the restaurant can read; nobody writes directly (the functions do).
DROP POLICY IF EXISTS "tenant read purchase_day_approvals" ON public.purchase_day_approvals;
CREATE POLICY "tenant read purchase_day_approvals" ON public.purchase_day_approvals
  FOR SELECT TO authenticated USING (restaurant_id = public.current_restaurant_id());

DROP POLICY IF EXISTS "tenant read purchase_day_approval_log" ON public.purchase_day_approval_log;
CREATE POLICY "tenant read purchase_day_approval_log" ON public.purchase_day_approval_log
  FOR SELECT TO authenticated USING (restaurant_id = public.current_restaurant_id());

GRANT SELECT ON public.purchase_day_approvals, public.purchase_day_approval_log TO authenticated;
GRANT ALL ON public.purchase_day_approvals, public.purchase_day_approval_log TO service_role;

-- purchase_perm(user, 'check' | 'approve'): admin always; otherwise the per-person setting made
-- in Users; if none was set, managers are allowed by default (same as the app's role defaults).
CREATE OR REPLACE FUNCTION public.purchase_perm(_uid uuid, _perm text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _stored jsonb;
  _key text := 'purchases:' || _perm;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF public.has_role(_uid, 'admin') THEN RETURN true; END IF;
  SELECT permissions INTO _stored FROM public.profiles WHERE id = _uid;
  IF _stored IS NOT NULL AND _stored ? _key THEN
    RETURN COALESCE((_stored ->> _key)::boolean, false);
  END IF;
  RETURN public.has_role(_uid, 'manager');
END $function$;

REVOKE EXECUTE ON FUNCTION public.purchase_perm(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_perm(uuid, text) TO authenticated, service_role;
