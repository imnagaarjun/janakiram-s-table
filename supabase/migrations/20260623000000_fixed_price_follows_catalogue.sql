-- A fixed-price product's price now flows straight into the daily purchase entries.
--
--  * When the owner changes a fixed price in Vendors & products, entries for today and later
--    are repriced automatically (amount and due follow; a line that was fully paid stays fully
--    paid). Entries for past days are never touched.
--  * Entries that are out of date right now (price changed earlier) are repaired once, below.
--  * Saving a past day again keeps the price it was saved at; today and later use the catalogue.

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
     AND pl.unit_price IS DISTINCT FROM NEW.fixed_price;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_vendor_products_reprice ON public.vendor_products;
CREATE TRIGGER trg_vendor_products_reprice
  AFTER UPDATE OF fixed_price, price_mode ON public.vendor_products
  FOR EACH ROW
  WHEN (NEW.price_mode = 'fixed' AND NEW.fixed_price IS NOT NULL
        AND (OLD.fixed_price IS DISTINCT FROM NEW.fixed_price
             OR OLD.price_mode IS DISTINCT FROM NEW.price_mode))
  EXECUTE FUNCTION public.reprice_open_purchase_lines();

-- One-time repair of today's/future entries that already disagree with the catalogue price.
UPDATE public.purchase_lines pl
   SET unit_price  = vp.fixed_price,
       amount      = ROUND(pl.qty * vp.fixed_price, 2),
       paid_amount = CASE WHEN pl.paid_amount >= pl.amount
                          THEN ROUND(pl.qty * vp.fixed_price, 2)
                          ELSE LEAST(pl.paid_amount, ROUND(pl.qty * vp.fixed_price, 2)) END,
       due_amount  = ROUND(pl.qty * vp.fixed_price, 2)
                     - CASE WHEN pl.paid_amount >= pl.amount
                            THEN ROUND(pl.qty * vp.fixed_price, 2)
                            ELSE LEAST(pl.paid_amount, ROUND(pl.qty * vp.fixed_price, 2)) END
  FROM public.vendor_products vp
 WHERE vp.id = pl.vendor_product_id
   AND vp.price_mode = 'fixed'
   AND vp.fixed_price IS NOT NULL
   AND pl.business_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date
   AND pl.unit_price IS DISTINCT FROM vp.fixed_price;
