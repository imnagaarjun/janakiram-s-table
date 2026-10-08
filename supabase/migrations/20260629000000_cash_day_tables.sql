-- One-day extra lines, and the check / approve record for a cash day.

CREATE TABLE IF NOT EXISTS public.cash_recon_extra_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  reconciliation_id uuid NOT NULL REFERENCES public.cash_reconciliations(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (btrim(label) <> '' AND char_length(label) <= 40),
  sign text NOT NULL CHECK (sign IN ('add', 'subtract')),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  display_order int NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cash_recon_extra_lines_recon ON public.cash_recon_extra_lines (reconciliation_id);
ALTER TABLE public.cash_recon_extra_lines ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.cash_recon_extra_lines TO authenticated;
GRANT ALL ON public.cash_recon_extra_lines TO service_role;
DROP POLICY IF EXISTS "tenant read cash_recon_extra_lines" ON public.cash_recon_extra_lines;
CREATE POLICY "tenant read cash_recon_extra_lines" ON public.cash_recon_extra_lines
  FOR SELECT TO authenticated USING (restaurant_id = public.current_restaurant_id());

CREATE TABLE IF NOT EXISTS public.cash_day_signoffs (
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  checked_by uuid,
  checked_by_name text,
  checked_at timestamptz,
  approved_by uuid,
  approved_by_name text,
  approved_at timestamptz,
  PRIMARY KEY (restaurant_id, business_date)
);
CREATE TABLE IF NOT EXISTS public.cash_day_signoff_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  action text NOT NULL,
  by_user uuid,
  by_name text,
  at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cash_day_signoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_day_signoff_log ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.cash_day_signoffs, public.cash_day_signoff_log TO authenticated;
GRANT ALL ON public.cash_day_signoffs, public.cash_day_signoff_log TO service_role;
DROP POLICY IF EXISTS "tenant read cash_day_signoffs" ON public.cash_day_signoffs;
CREATE POLICY "tenant read cash_day_signoffs" ON public.cash_day_signoffs
  FOR SELECT TO authenticated USING (restaurant_id = public.current_restaurant_id());
DROP POLICY IF EXISTS "tenant read cash_day_signoff_log" ON public.cash_day_signoff_log;
CREATE POLICY "tenant read cash_day_signoff_log" ON public.cash_day_signoff_log
  FOR SELECT TO authenticated USING (restaurant_id = public.current_restaurant_id());

-- Who may check / approve a cash day: admin always; others by their switch; managers by default.
CREATE OR REPLACE FUNCTION public.cash_recon_perm(_uid uuid, _perm text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _stored jsonb;
  _key text := 'cash-recon:' || _perm;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF public.has_role(_uid, 'admin') THEN RETURN true; END IF;
  SELECT permissions INTO _stored FROM public.profiles WHERE id = _uid;
  IF _stored IS NOT NULL AND _stored ? _key THEN
    RETURN COALESCE((_stored ->> _key)::boolean, false);
  END IF;
  RETURN public.has_role(_uid, 'manager');
END $function$;
REVOKE EXECUTE ON FUNCTION public.cash_recon_perm(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cash_recon_perm(uuid, text) TO authenticated, service_role;
