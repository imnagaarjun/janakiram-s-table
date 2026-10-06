-- Daily purchase sheet approval: who approved a day, when, and any later revision.
-- Only admin/manager may approve, reopen or edit an approved day (enforced in the database).

CREATE OR REPLACE FUNCTION public.can_override_purchases(_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.has_role(_uid, 'admin') OR public.has_role(_uid, 'manager');
$function$;

REVOKE EXECUTE ON FUNCTION public.can_override_purchases(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_override_purchases(uuid) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.purchase_day_approvals (
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  approved_by uuid NOT NULL,
  approved_by_name text NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  revised_by uuid,
  revised_by_name text,
  revised_at timestamptz,
  PRIMARY KEY (restaurant_id, business_date)
);

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

-- Everyone in the restaurant can read approvals; nobody writes them directly (functions only).
DROP POLICY IF EXISTS "tenant read purchase_day_approvals" ON public.purchase_day_approvals;
CREATE POLICY "tenant read purchase_day_approvals" ON public.purchase_day_approvals
  FOR SELECT TO authenticated USING (restaurant_id = public.current_restaurant_id());

DROP POLICY IF EXISTS "tenant read purchase_day_approval_log" ON public.purchase_day_approval_log;
CREATE POLICY "tenant read purchase_day_approval_log" ON public.purchase_day_approval_log
  FOR SELECT TO authenticated USING (restaurant_id = public.current_restaurant_id());

GRANT SELECT ON public.purchase_day_approvals, public.purchase_day_approval_log TO authenticated;
GRANT ALL ON public.purchase_day_approvals, public.purchase_day_approval_log TO service_role;
