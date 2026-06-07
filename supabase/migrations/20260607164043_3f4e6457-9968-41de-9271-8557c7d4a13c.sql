
-- ============ ENUMS ============
CREATE TYPE public.stock_pool_type AS ENUM ('prepared_base','raw_ingredient');
CREATE TYPE public.stock_mode AS ENUM ('counted','unlimited');
CREATE TYPE public.table_status AS ENUM ('free','seated_no_kot','occupied','bill_requested','inactive');
CREATE TYPE public.session_status AS ENUM ('open','bill_requested','settled','voided');
CREATE TYPE public.kot_status AS ENUM ('pending','preparing','ready','served','void');
CREATE TYPE public.kot_item_status AS ENUM ('pending','preparing','ready','served','void');
CREATE TYPE public.payment_mode AS ENUM ('cash','upi','card','other');
CREATE TYPE public.ledger_reason AS ENUM ('opening','sale','void','wastage','restock','adjustment');
CREATE TYPE public.order_channel AS ENUM ('dinein','takeaway');
CREATE TYPE public.waiter_shift AS ENUM ('morning','evening','full');

-- ============ updated_at trigger reuse ============
-- public.touch_updated_at() already exists.

-- ============ CATEGORIES ============
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  image_url text,
  display_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read" ON public.categories FOR SELECT TO authenticated USING (restaurant_id = current_restaurant_id());
CREATE POLICY "tenant write" ON public.categories FOR ALL TO authenticated
  USING (restaurant_id = current_restaurant_id() AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')))
  WITH CHECK (restaurant_id = current_restaurant_id() AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')));
CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_categories_restaurant ON public.categories(restaurant_id);

-- ============ STOCK POOLS ============
CREATE TABLE public.stock_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  type public.stock_pool_type NOT NULL,
  unit text NOT NULL DEFAULT 'unit',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_pools TO authenticated;
GRANT ALL ON public.stock_pools TO service_role;
ALTER TABLE public.stock_pools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read" ON public.stock_pools FOR SELECT TO authenticated USING (restaurant_id = current_restaurant_id());
CREATE POLICY "tenant write" ON public.stock_pools FOR ALL TO authenticated
  USING (restaurant_id = current_restaurant_id() AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')))
  WITH CHECK (restaurant_id = current_restaurant_id() AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')));
CREATE TRIGGER trg_stock_pools_updated BEFORE UPDATE ON public.stock_pools FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_stock_pools_restaurant ON public.stock_pools(restaurant_id);

-- ============ MENU ITEMS ============
CREATE TABLE public.menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  item_code text NOT NULL,
  name text NOT NULL,
  kot_short_name text NOT NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  image_url text,
  is_favorite boolean NOT NULL DEFAULT false,
  display_order int NOT NULL DEFAULT 0,
  stock_mode public.stock_mode NOT NULL DEFAULT 'unlimited',
  gst_rate numeric(5,2) NOT NULL DEFAULT 5.00,
  is_active boolean NOT NULL DEFAULT true,
  is_86 boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, item_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_items TO authenticated;
GRANT ALL ON public.menu_items TO service_role;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read" ON public.menu_items FOR SELECT TO authenticated USING (restaurant_id = current_restaurant_id());
CREATE POLICY "tenant write" ON public.menu_items FOR ALL TO authenticated
  USING (restaurant_id = current_restaurant_id() AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')))
  WITH CHECK (restaurant_id = current_restaurant_id() AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')));
CREATE TRIGGER trg_menu_items_updated BEFORE UPDATE ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_menu_items_restaurant ON public.menu_items(restaurant_id);
CREATE INDEX idx_menu_items_category ON public.menu_items(category_id);

-- ============ PRICE CHANNELS ============
CREATE TABLE public.price_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_channels TO authenticated;
GRANT ALL ON public.price_channels TO service_role;
ALTER TABLE public.price_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read" ON public.price_channels FOR SELECT TO authenticated USING (restaurant_id = current_restaurant_id());
CREATE POLICY "tenant write" ON public.price_channels FOR ALL TO authenticated
  USING (restaurant_id = current_restaurant_id() AND has_role(auth.uid(),'admin'))
  WITH CHECK (restaurant_id = current_restaurant_id() AND has_role(auth.uid(),'admin'));

-- ============ MENU PRICES ============
CREATE TABLE public.menu_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  channel_key text NOT NULL,
  inclusive_price numeric(10,2) NOT NULL,
  base_price numeric(10,2) NOT NULL,
  gst_rate numeric(5,2) NOT NULL DEFAULT 5.00,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (menu_item_id, channel_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_prices TO authenticated;
GRANT ALL ON public.menu_prices TO service_role;
ALTER TABLE public.menu_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read" ON public.menu_prices FOR SELECT TO authenticated USING (restaurant_id = current_restaurant_id());
CREATE POLICY "tenant write" ON public.menu_prices FOR ALL TO authenticated
  USING (restaurant_id = current_restaurant_id() AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')))
  WITH CHECK (restaurant_id = current_restaurant_id() AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')));
CREATE TRIGGER trg_menu_prices_updated BEFORE UPDATE ON public.menu_prices FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_menu_prices_item ON public.menu_prices(menu_item_id);

-- ============ RECIPES (BOM) ============
CREATE TABLE public.recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  stock_pool_id uuid NOT NULL REFERENCES public.stock_pools(id) ON DELETE RESTRICT,
  consume_ratio numeric(12,4) NOT NULL CHECK (consume_ratio > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (menu_item_id, stock_pool_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipes TO authenticated;
GRANT ALL ON public.recipes TO service_role;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read" ON public.recipes FOR SELECT TO authenticated USING (restaurant_id = current_restaurant_id());
CREATE POLICY "tenant write" ON public.recipes FOR ALL TO authenticated
  USING (restaurant_id = current_restaurant_id() AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')))
  WITH CHECK (restaurant_id = current_restaurant_id() AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')));
CREATE INDEX idx_recipes_item ON public.recipes(menu_item_id);
CREATE INDEX idx_recipes_pool ON public.recipes(stock_pool_id);

-- ============ STOCK LEDGER (append-only) ============
CREATE TABLE public.stock_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  pool_id uuid NOT NULL REFERENCES public.stock_pools(id) ON DELETE RESTRICT,
  qty_delta numeric(12,4) NOT NULL,
  reason public.ledger_reason NOT NULL,
  ref_id uuid,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.stock_ledger TO authenticated;
GRANT ALL ON public.stock_ledger TO service_role;
ALTER TABLE public.stock_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read" ON public.stock_ledger FOR SELECT TO authenticated USING (restaurant_id = current_restaurant_id());
CREATE POLICY "tenant insert" ON public.stock_ledger FOR INSERT TO authenticated
  WITH CHECK (restaurant_id = current_restaurant_id());
CREATE INDEX idx_stock_ledger_pool ON public.stock_ledger(pool_id);
CREATE INDEX idx_stock_ledger_restaurant ON public.stock_ledger(restaurant_id);

-- ============ TABLES ============
CREATE TABLE public.tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  section text,
  seats int NOT NULL DEFAULT 4,
  status public.table_status NOT NULL DEFAULT 'free',
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tables TO authenticated;
GRANT ALL ON public.tables TO service_role;
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read" ON public.tables FOR SELECT TO authenticated USING (restaurant_id = current_restaurant_id());
CREATE POLICY "tenant write" ON public.tables FOR ALL TO authenticated
  USING (restaurant_id = current_restaurant_id())
  WITH CHECK (restaurant_id = current_restaurant_id());
CREATE TRIGGER trg_tables_updated BEFORE UPDATE ON public.tables FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_tables_restaurant ON public.tables(restaurant_id);

-- ============ WAITERS ============
CREATE TABLE public.waiters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  role text NOT NULL DEFAULT 'waiter',
  join_date date,
  is_active boolean NOT NULL DEFAULT true,
  payroll_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.waiters TO authenticated;
GRANT ALL ON public.waiters TO service_role;
ALTER TABLE public.waiters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read" ON public.waiters FOR SELECT TO authenticated USING (restaurant_id = current_restaurant_id());
CREATE POLICY "tenant write" ON public.waiters FOR ALL TO authenticated
  USING (restaurant_id = current_restaurant_id() AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')))
  WITH CHECK (restaurant_id = current_restaurant_id() AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')));
CREATE TRIGGER trg_waiters_updated BEFORE UPDATE ON public.waiters FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_waiters_restaurant ON public.waiters(restaurant_id);

-- ============ WAITER ALLOCATIONS ============
CREATE TABLE public.waiter_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  date date NOT NULL,
  waiter_id uuid NOT NULL REFERENCES public.waiters(id) ON DELETE CASCADE,
  table_code text NOT NULL,
  shift public.waiter_shift NOT NULL DEFAULT 'full',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, date, table_code, shift)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.waiter_allocations TO authenticated;
GRANT ALL ON public.waiter_allocations TO service_role;
ALTER TABLE public.waiter_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read" ON public.waiter_allocations FOR SELECT TO authenticated USING (restaurant_id = current_restaurant_id());
CREATE POLICY "tenant write" ON public.waiter_allocations FOR ALL TO authenticated
  USING (restaurant_id = current_restaurant_id() AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')))
  WITH CHECK (restaurant_id = current_restaurant_id() AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')));
CREATE INDEX idx_alloc_date ON public.waiter_allocations(restaurant_id, date);

-- ============ ORDER SESSIONS ============
CREATE TABLE public.order_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  table_code text,
  channel public.order_channel NOT NULL DEFAULT 'dinein',
  pax int NOT NULL DEFAULT 1,
  opened_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.session_status NOT NULL DEFAULT 'open',
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_sessions TO authenticated;
GRANT ALL ON public.order_sessions TO service_role;
ALTER TABLE public.order_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read" ON public.order_sessions FOR SELECT TO authenticated USING (restaurant_id = current_restaurant_id());
CREATE POLICY "tenant write" ON public.order_sessions FOR ALL TO authenticated
  USING (restaurant_id = current_restaurant_id())
  WITH CHECK (restaurant_id = current_restaurant_id());
CREATE TRIGGER trg_sessions_updated BEFORE UPDATE ON public.order_sessions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_sessions_table ON public.order_sessions(restaurant_id, table_code, status);

-- ============ KOTS ============
CREATE TABLE public.kots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.order_sessions(id) ON DELETE CASCADE,
  kot_no int NOT NULL,
  kitchen_id text NOT NULL DEFAULT 'main',
  status public.kot_status NOT NULL DEFAULT 'pending',
  note text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kots TO authenticated;
GRANT ALL ON public.kots TO service_role;
ALTER TABLE public.kots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read" ON public.kots FOR SELECT TO authenticated USING (restaurant_id = current_restaurant_id());
CREATE POLICY "tenant write" ON public.kots FOR ALL TO authenticated
  USING (restaurant_id = current_restaurant_id())
  WITH CHECK (restaurant_id = current_restaurant_id());
CREATE TRIGGER trg_kots_updated BEFORE UPDATE ON public.kots FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_kots_session ON public.kots(session_id);
CREATE INDEX idx_kots_restaurant_status ON public.kots(restaurant_id, status);

-- ============ KOT ITEMS ============
CREATE TABLE public.kot_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  kot_id uuid NOT NULL REFERENCES public.kots(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE RESTRICT,
  qty numeric(8,2) NOT NULL CHECK (qty > 0),
  note text,
  status public.kot_item_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kot_items TO authenticated;
GRANT ALL ON public.kot_items TO service_role;
ALTER TABLE public.kot_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read" ON public.kot_items FOR SELECT TO authenticated USING (restaurant_id = current_restaurant_id());
CREATE POLICY "tenant write" ON public.kot_items FOR ALL TO authenticated
  USING (restaurant_id = current_restaurant_id())
  WITH CHECK (restaurant_id = current_restaurant_id());
CREATE TRIGGER trg_kot_items_updated BEFORE UPDATE ON public.kot_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_kot_items_kot ON public.kot_items(kot_id);

-- ============ INVOICES ============
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.order_sessions(id) ON DELETE RESTRICT,
  invoice_no text NOT NULL,
  base numeric(10,2) NOT NULL DEFAULT 0,
  cgst numeric(10,2) NOT NULL DEFAULT 0,
  sgst numeric(10,2) NOT NULL DEFAULT 0,
  round_off numeric(10,2) NOT NULL DEFAULT 0,
  service_charge numeric(10,2) NOT NULL DEFAULT 0,
  discount numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(10,2) NOT NULL DEFAULT 0,
  issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, invoice_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read" ON public.invoices FOR SELECT TO authenticated USING (restaurant_id = current_restaurant_id());
CREATE POLICY "tenant write" ON public.invoices FOR ALL TO authenticated
  USING (restaurant_id = current_restaurant_id() AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'cashier')))
  WITH CHECK (restaurant_id = current_restaurant_id() AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'cashier')));
CREATE INDEX idx_invoices_session ON public.invoices(session_id);

-- ============ PAYMENTS ============
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  mode public.payment_mode NOT NULL,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  ref_no text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read" ON public.payments FOR SELECT TO authenticated USING (restaurant_id = current_restaurant_id());
CREATE POLICY "tenant write" ON public.payments FOR ALL TO authenticated
  USING (restaurant_id = current_restaurant_id() AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'cashier')))
  WITH CHECK (restaurant_id = current_restaurant_id() AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'cashier')));
CREATE INDEX idx_payments_invoice ON public.payments(invoice_id);

-- ============ AUDIT LOG ============
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  before jsonb,
  after jsonb,
  ts timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read" ON public.audit_log FOR SELECT TO authenticated
  USING (restaurant_id = current_restaurant_id() AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')));
CREATE POLICY "tenant insert" ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (restaurant_id = current_restaurant_id());
CREATE INDEX idx_audit_restaurant_ts ON public.audit_log(restaurant_id, ts DESC);

-- ============ pool_qty + available_qty ============
CREATE OR REPLACE FUNCTION public.pool_qty(_pool_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(qty_delta), 0)::numeric FROM public.stock_ledger WHERE pool_id = _pool_id;
$$;

-- available_qty: for unlimited items returns a large sentinel; for counted items returns
-- MIN over recipes of floor(pool_qty / consume_ratio). If a counted item has no recipes, returns 0.
CREATE OR REPLACE FUNCTION public.available_qty(_menu_item_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _mode public.stock_mode;
  _is_86 boolean;
  _result numeric;
  _has_recipe boolean;
BEGIN
  SELECT stock_mode, is_86 INTO _mode, _is_86 FROM public.menu_items WHERE id = _menu_item_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF _is_86 THEN RETURN 0; END IF;
  IF _mode = 'unlimited' THEN RETURN 999999; END IF;

  SELECT EXISTS(SELECT 1 FROM public.recipes WHERE menu_item_id = _menu_item_id) INTO _has_recipe;
  IF NOT _has_recipe THEN RETURN 0; END IF;

  SELECT MIN(FLOOR(public.pool_qty(r.stock_pool_id) / r.consume_ratio))
    INTO _result
    FROM public.recipes r
    WHERE r.menu_item_id = _menu_item_id;

  RETURN GREATEST(COALESCE(_result, 0), 0);
END;
$$;

-- ============ SEED price channels for existing restaurants ============
INSERT INTO public.price_channels (restaurant_id, key, label, display_order)
SELECT r.id, 'dinein', 'Dine-in', 1 FROM public.restaurants r
ON CONFLICT (restaurant_id, key) DO NOTHING;

INSERT INTO public.price_channels (restaurant_id, key, label, display_order)
SELECT r.id, 'takeaway', 'Takeaway', 2 FROM public.restaurants r
ON CONFLICT (restaurant_id, key) DO NOTHING;
