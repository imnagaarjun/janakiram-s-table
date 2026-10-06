-- Lock approved days at the table level, so no route (screen, API, another function) can edit
-- them except an admin/manager, whose change is stamped as a revision after approval.
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
  _hit boolean := false;
BEGIN
  IF _uid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP <> 'INSERT' THEN
    _hit := EXISTS (SELECT 1 FROM public.purchase_day_approvals
                     WHERE restaurant_id = _rid AND business_date = OLD.business_date);
  END IF;
  IF NOT _hit AND TG_OP <> 'DELETE' THEN
    _hit := EXISTS (SELECT 1 FROM public.purchase_day_approvals
                     WHERE restaurant_id = _rid AND business_date = NEW.business_date);
  END IF;

  IF _hit THEN
    IF NOT public.can_override_purchases(_uid) THEN
      RAISE EXCEPTION 'DAY_APPROVED';
    END IF;
    UPDATE public.purchase_day_approvals
       SET revised_by = _uid,
           revised_by_name = COALESCE((SELECT name FROM public.profiles WHERE id = _uid), 'Unknown'),
           revised_at = now()
     WHERE restaurant_id = _rid
       AND business_date IN (
         CASE WHEN TG_OP <> 'INSERT' THEN OLD.business_date END,
         CASE WHEN TG_OP <> 'DELETE' THEN NEW.business_date END
       );
  END IF;

  RETURN COALESCE(NEW, OLD);
END $function$;

DROP TRIGGER IF EXISTS trg_purchase_lines_approval_guard ON public.purchase_lines;
CREATE TRIGGER trg_purchase_lines_approval_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_approved_purchase_day();

-- A fixed-price change must not silently rewrite a day that has been approved.
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
