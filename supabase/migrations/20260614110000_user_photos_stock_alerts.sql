-- =====================================================================
-- User list fix + staff photos + per-item stock benchmarks + alerts
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Fix the "created user never appears in list" bug.
--    The only SELECT policies on profiles / user_roles were scoped to
--    `id = auth.uid()`, so the Users panel could only ever read the
--    logged-in admin's own row. Allow reading every profile/role within
--    the caller's own restaurant.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "view restaurant profiles" ON public.profiles;
CREATE POLICY "view restaurant profiles" ON public.profiles FOR SELECT TO authenticated
  USING (restaurant_id = public.current_restaurant_id());

DROP POLICY IF EXISTS "view restaurant roles" ON public.user_roles;
CREATE POLICY "view restaurant roles" ON public.user_roles FOR SELECT TO authenticated
  USING (restaurant_id = public.current_restaurant_id());

-- ---------------------------------------------------------------------
-- 2. Staff portrait photo + "receive stock alerts" assignment flag.
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS notify_stock boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------
-- 3. Per menu item low-stock benchmark (NULL = no benchmark set).
-- ---------------------------------------------------------------------
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS stock_benchmark integer;

-- ---------------------------------------------------------------------
-- 4. Notifications feed (stock low / out). Restaurant-scoped, readable
--    by admins and any staff flagged with notify_stock.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  type          text NOT NULL,                       -- 'stock_low' | 'stock_out'
  level         text,                                -- 'low' | 'out'
  title         text NOT NULL,
  body          text,
  menu_item_id  uuid REFERENCES public.menu_items(id) ON DELETE CASCADE,
  is_read       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz
);

CREATE INDEX IF NOT EXISTS notifications_restaurant_idx
  ON public.notifications(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_open_idx
  ON public.notifications(menu_item_id, level) WHERE resolved_at IS NULL;

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Who may see / dismiss alerts: admins always, plus opted-in staff.
DROP POLICY IF EXISTS "read notifications" ON public.notifications;
CREATE POLICY "read notifications" ON public.notifications FOR SELECT TO authenticated
  USING (
    restaurant_id = public.current_restaurant_id()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.notify_stock)
    )
  );

DROP POLICY IF EXISTS "update notifications" ON public.notifications;
CREATE POLICY "update notifications" ON public.notifications FOR UPDATE TO authenticated
  USING (
    restaurant_id = public.current_restaurant_id()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.notify_stock)
    )
  )
  WITH CHECK (restaurant_id = public.current_restaurant_id());

-- ---------------------------------------------------------------------
-- 5. Trigger: whenever the stock ledger changes, re-evaluate every
--    menu item that draws on the affected pool. Raise a low/out alert
--    when it crosses a threshold, and auto-resolve when it recovers.
--    De-duplicated so we never spam the same open alert twice.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_stock_alerts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r      record;
  _qty   numeric;
  _bench integer;
BEGIN
  FOR r IN
    SELECT DISTINCT mi.id, mi.name, mi.stock_benchmark
    FROM public.recipes rc
    JOIN public.menu_items mi ON mi.id = rc.menu_item_id
    WHERE rc.stock_pool_id = NEW.pool_id
      AND mi.stock_mode = 'counted'
      AND mi.is_active
  LOOP
    _qty   := public.available_qty(r.id);
    _bench := r.stock_benchmark;

    IF _qty <= 0 THEN
      -- Out of stock
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.menu_item_id = r.id AND n.level = 'out' AND n.resolved_at IS NULL
      ) THEN
        UPDATE public.notifications SET resolved_at = now()
          WHERE menu_item_id = r.id AND level = 'low' AND resolved_at IS NULL;
        INSERT INTO public.notifications (restaurant_id, type, level, title, body, menu_item_id)
          VALUES (NEW.restaurant_id, 'stock_out', 'out',
                  r.name || ' is OUT of stock',
                  r.name || ' has reached zero. Please restock.', r.id);
      END IF;

    ELSIF _bench IS NOT NULL AND _qty <= _bench THEN
      -- Running low (only when a benchmark is set)
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.menu_item_id = r.id AND n.level IN ('low', 'out') AND n.resolved_at IS NULL
      ) THEN
        INSERT INTO public.notifications (restaurant_id, type, level, title, body, menu_item_id)
          VALUES (NEW.restaurant_id, 'stock_low', 'low',
                  r.name || ' is running low',
                  r.name || ' is down to ' || _qty::text ||
                    ' (benchmark ' || _bench::text || '). Consider restocking.', r.id);
      END IF;

    ELSE
      -- Recovered above benchmark: clear any open alerts
      UPDATE public.notifications SET resolved_at = now()
        WHERE menu_item_id = r.id AND resolved_at IS NULL;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stock_ledger_alert ON public.stock_ledger;
CREATE TRIGGER stock_ledger_alert
  AFTER INSERT ON public.stock_ledger
  FOR EACH ROW EXECUTE FUNCTION public.check_stock_alerts();

-- Live updates for the in-app notifier.
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- ---------------------------------------------------------------------
-- 6. menu_availability(): one call returns live availability + benchmark
--    for every active item, grouped-friendly, for the "Available" popup.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.menu_availability()
RETURNS TABLE (
  item_id       uuid,
  name          text,
  category_id   uuid,
  category_name text,
  stock_mode    public.stock_mode,
  available     numeric,
  benchmark     integer,
  is_86         boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT mi.id, mi.name, mi.category_id, c.name, mi.stock_mode,
         public.available_qty(mi.id), mi.stock_benchmark, mi.is_86
  FROM public.menu_items mi
  LEFT JOIN public.categories c ON c.id = mi.category_id
  WHERE mi.restaurant_id = public.current_restaurant_id()
    AND mi.is_active
  ORDER BY c.display_order NULLS LAST, c.name NULLS LAST, mi.display_order, mi.name;
$$;

REVOKE EXECUTE ON FUNCTION public.menu_availability() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.menu_availability() TO authenticated, service_role;
