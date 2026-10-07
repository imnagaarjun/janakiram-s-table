-- Enforce the sign-off stages on the purchase lines themselves, so no route can bypass them.
--   checked sheet .... only "approve" holders and admin may change it (stamped "corrected")
--   approved sheet ... only admin may change it (stamped "revised")
-- Calls with no signed-in user (SQL editor, service role, migrations) are not blocked.

CREATE OR REPLACE FUNCTION public.guard_approved_purchase_day()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _rid uuid := COALESCE(NEW.restaurant_id, OLD.restaurant_id);
  _d date;
  _row public.purchase_day_approvals;
  _name text;
BEGIN
  IF _uid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  FOR _d IN
    SELECT DISTINCT d FROM (VALUES
      (CASE WHEN TG_OP <> 'INSERT' THEN OLD.business_date END),
      (CASE WHEN TG_OP <> 'DELETE' THEN NEW.business_date END)
    ) AS t(d) WHERE d IS NOT NULL
  LOOP
    SELECT * INTO _row FROM public.purchase_day_approvals
     WHERE restaurant_id = _rid AND business_date = _d;
    CONTINUE WHEN NOT FOUND;

    SELECT COALESCE(NULLIF(btrim(name), ''), 'Unknown') INTO _name FROM public.profiles WHERE id = _uid;

    IF _row.approved_by IS NOT NULL THEN
      IF NOT public.has_role(_uid, 'admin') THEN RAISE EXCEPTION 'DAY_APPROVED'; END IF;
      UPDATE public.purchase_day_approvals
         SET revised_by = _uid, revised_by_name = COALESCE(_name, 'Unknown'), revised_at = now()
       WHERE restaurant_id = _rid AND business_date = _d;
    ELSE
      IF NOT public.purchase_perm(_uid, 'approve') THEN RAISE EXCEPTION 'DAY_CHECKED'; END IF;
      UPDATE public.purchase_day_approvals
         SET corrected_by = _uid, corrected_by_name = COALESCE(_name, 'Unknown'), corrected_at = now()
       WHERE restaurant_id = _rid AND business_date = _d;
    END IF;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END $function$;

DROP TRIGGER IF EXISTS trg_purchase_lines_approval_guard ON public.purchase_lines;
CREATE TRIGGER trg_purchase_lines_approval_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_approved_purchase_day();

-- A fixed-price change must not silently rewrite a day that has been checked or approved.
CREATE OR REPLACE FUNCTION public.reprice_open_purchase_lines()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.purchase_lines pl
     SET unit_price  = NEW.fixed_price,
         amount      = ROUND(pl.qty * NEW.fixed_price, 2),
         paid_amount = CASE WHEN pl.paid_amount >= pl.amount
                            THEN ROUND(pl.qty * NEW.fixed_price, 2)
                            ELSE LEAST(pl.paid_amount, ROUND(pl.qty * NEW.fixed_price, 2)) END,
         due_amount  = ROUND(pl.qty * NEW.fixed_price, 2)
                       - CASE WHEN pl.paid_amount >= pl.amount
                              THEN ROUND(pl.qty * NEW.fixed_price, 2)
                              ELSE LEAST(pl.paid_amount, ROUND(pl.qty * NEW.fixed_price, 2)) END
   WHERE pl.vendor_product_id = NEW.id
     AND pl.restaurant_id = NEW.restaurant_id
     AND pl.business_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date
     AND pl.unit_price IS DISTINCT FROM NEW.fixed_price
     AND NOT EXISTS (
       SELECT 1 FROM public.purchase_day_approvals a
        WHERE a.restaurant_id = pl.restaurant_id AND a.business_date = pl.business_date
     );
  RETURN NEW;
END $function$;

-- Superseded by purchase_perm / has_role('admin').
DROP FUNCTION IF EXISTS public.can_override_purchases(uuid);
