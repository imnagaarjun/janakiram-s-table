
-- =========================================================
-- PROCUREMENT & CASH SCHEMA (additive only)
-- =========================================================

-- Enums
DO $$ BEGIN
  CREATE TYPE public.price_mode AS ENUM ('fixed','variable');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.purchase_pay_mode AS ENUM ('cash','online');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cashflow_sign AS ENUM ('add','subtract');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cashflow_source AS ENUM (
    'manual','auto_sales','auto_gpay','auto_card','auto_swiggy','auto_cash_expense'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.recon_status AS ENUM ('draft','finalised');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Helper trigger fn already exists: public.touch_updated_at()

-- ---------------------------------------------------------
-- expense_categories
-- ---------------------------------------------------------
CREATE TABLE public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  name text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read expense_categories" ON public.expense_categories
  FOR SELECT TO authenticated USING (restaurant_id = public.current_restaurant_id());
CREATE POLICY "tenant write expense_categories" ON public.expense_categories
  FOR ALL TO authenticated
  USING (restaurant_id = public.current_restaurant_id()
         AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')))
  WITH CHECK (restaurant_id = public.current_restaurant_id()
         AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
CREATE TRIGGER trg_expense_categories_touch BEFORE UPDATE ON public.expense_categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------
-- vendors
-- ---------------------------------------------------------
CREATE TABLE public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  name text NOT NULL,
  name_tamil text,
  is_multi_product boolean NOT NULL DEFAULT false,
  default_category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO authenticated;
GRANT ALL ON public.vendors TO service_role;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read vendors" ON public.vendors
  FOR SELECT TO authenticated USING (restaurant_id = public.current_restaurant_id());
CREATE POLICY "tenant write vendors" ON public.vendors
  FOR ALL TO authenticated
  USING (restaurant_id = public.current_restaurant_id()
         AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')))
  WITH CHECK (restaurant_id = public.current_restaurant_id()
         AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
CREATE TRIGGER trg_vendors_touch BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------
-- vendor_products
-- ---------------------------------------------------------
CREATE TABLE public.vendor_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  name text NOT NULL,
  name_tamil text,
  unit text NOT NULL DEFAULT 'kg',
  price_mode public.price_mode NOT NULL DEFAULT 'variable',
  fixed_price numeric(12,2),
  gst_applicable boolean NOT NULL DEFAULT false,
  category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  display_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_products TO authenticated;
GRANT ALL ON public.vendor_products TO service_role;
ALTER TABLE public.vendor_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read vendor_products" ON public.vendor_products
  FOR SELECT TO authenticated USING (restaurant_id = public.current_restaurant_id());
CREATE POLICY "tenant write vendor_products" ON public.vendor_products
  FOR ALL TO authenticated
  USING (restaurant_id = public.current_restaurant_id()
         AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')))
  WITH CHECK (restaurant_id = public.current_restaurant_id()
         AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
CREATE TRIGGER trg_vendor_products_touch BEFORE UPDATE ON public.vendor_products
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------
-- purchase_lines
-- ---------------------------------------------------------
CREATE TABLE public.purchase_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  business_date date NOT NULL,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  vendor_product_id uuid REFERENCES public.vendor_products(id) ON DELETE SET NULL,
  description text,
  qty numeric(12,3) NOT NULL DEFAULT 0,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  pay_mode public.purchase_pay_mode NOT NULL DEFAULT 'cash',
  paid_amount numeric(12,2) NOT NULL DEFAULT 0,
  due_amount numeric(12,2) NOT NULL DEFAULT 0,
  category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_purchase_lines_rid_date ON public.purchase_lines(restaurant_id, business_date);
CREATE INDEX idx_purchase_lines_vendor ON public.purchase_lines(vendor_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_lines TO authenticated;
GRANT ALL ON public.purchase_lines TO service_role;
ALTER TABLE public.purchase_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read purchase_lines" ON public.purchase_lines
  FOR SELECT TO authenticated USING (restaurant_id = public.current_restaurant_id());
CREATE POLICY "tenant write purchase_lines" ON public.purchase_lines
  FOR ALL TO authenticated
  USING (restaurant_id = public.current_restaurant_id()
         AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'cashier')))
  WITH CHECK (restaurant_id = public.current_restaurant_id()
         AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'cashier')));
CREATE TRIGGER trg_purchase_lines_touch BEFORE UPDATE ON public.purchase_lines
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------
-- vendor_payments
-- ---------------------------------------------------------
CREATE TABLE public.vendor_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  business_date date NOT NULL,
  amount numeric(12,2) NOT NULL,
  mode public.purchase_pay_mode NOT NULL DEFAULT 'cash',
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vendor_payments_vendor ON public.vendor_payments(vendor_id);
CREATE INDEX idx_vendor_payments_rid_date ON public.vendor_payments(restaurant_id, business_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_payments TO authenticated;
GRANT ALL ON public.vendor_payments TO service_role;
ALTER TABLE public.vendor_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read vendor_payments" ON public.vendor_payments
  FOR SELECT TO authenticated USING (restaurant_id = public.current_restaurant_id());
CREATE POLICY "tenant write vendor_payments" ON public.vendor_payments
  FOR ALL TO authenticated
  USING (restaurant_id = public.current_restaurant_id()
         AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'cashier')))
  WITH CHECK (restaurant_id = public.current_restaurant_id()
         AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'cashier')));
CREATE TRIGGER trg_vendor_payments_touch BEFORE UPDATE ON public.vendor_payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------
-- cash_sections
-- ---------------------------------------------------------
CREATE TABLE public.cash_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  key text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_sections TO authenticated;
GRANT ALL ON public.cash_sections TO service_role;
ALTER TABLE public.cash_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read cash_sections" ON public.cash_sections
  FOR SELECT TO authenticated USING (restaurant_id = public.current_restaurant_id());
CREATE POLICY "tenant write cash_sections" ON public.cash_sections
  FOR ALL TO authenticated
  USING (restaurant_id = public.current_restaurant_id()
         AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')))
  WITH CHECK (restaurant_id = public.current_restaurant_id()
         AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
CREATE TRIGGER trg_cash_sections_touch BEFORE UPDATE ON public.cash_sections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------
-- cashflow_lines (reconciliation template)
-- ---------------------------------------------------------
CREATE TABLE public.cashflow_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  section_key text,  -- NULL = applies to all sections
  label text NOT NULL,
  sign public.cashflow_sign NOT NULL,
  source public.cashflow_source NOT NULL DEFAULT 'manual',
  display_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cashflow_lines_rid ON public.cashflow_lines(restaurant_id, section_key, display_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cashflow_lines TO authenticated;
GRANT ALL ON public.cashflow_lines TO service_role;
ALTER TABLE public.cashflow_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read cashflow_lines" ON public.cashflow_lines
  FOR SELECT TO authenticated USING (restaurant_id = public.current_restaurant_id());
CREATE POLICY "tenant write cashflow_lines" ON public.cashflow_lines
  FOR ALL TO authenticated
  USING (restaurant_id = public.current_restaurant_id()
         AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')))
  WITH CHECK (restaurant_id = public.current_restaurant_id()
         AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
CREATE TRIGGER trg_cashflow_lines_touch BEFORE UPDATE ON public.cashflow_lines
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------
-- denomination_config
-- ---------------------------------------------------------
CREATE TABLE public.denomination_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  value numeric(12,2),
  label text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.denomination_config TO authenticated;
GRANT ALL ON public.denomination_config TO service_role;
ALTER TABLE public.denomination_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read denomination_config" ON public.denomination_config
  FOR SELECT TO authenticated USING (restaurant_id = public.current_restaurant_id());
CREATE POLICY "tenant write denomination_config" ON public.denomination_config
  FOR ALL TO authenticated
  USING (restaurant_id = public.current_restaurant_id()
         AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')))
  WITH CHECK (restaurant_id = public.current_restaurant_id()
         AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
CREATE TRIGGER trg_denomination_config_touch BEFORE UPDATE ON public.denomination_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------
-- cash_reconciliations
-- ---------------------------------------------------------
CREATE TABLE public.cash_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  business_date date NOT NULL,
  section_key text NOT NULL,
  status public.recon_status NOT NULL DEFAULT 'draft',
  created_by uuid,
  finalised_by uuid,
  finalised_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, business_date, section_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_reconciliations TO authenticated;
GRANT ALL ON public.cash_reconciliations TO service_role;
ALTER TABLE public.cash_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read cash_reconciliations" ON public.cash_reconciliations
  FOR SELECT TO authenticated USING (restaurant_id = public.current_restaurant_id());
CREATE POLICY "tenant write cash_reconciliations" ON public.cash_reconciliations
  FOR ALL TO authenticated
  USING (restaurant_id = public.current_restaurant_id()
         AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'cashier')))
  WITH CHECK (restaurant_id = public.current_restaurant_id()
         AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'cashier')));
CREATE TRIGGER trg_cash_reconciliations_touch BEFORE UPDATE ON public.cash_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------
-- cash_recon_values
-- ---------------------------------------------------------
CREATE TABLE public.cash_recon_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  reconciliation_id uuid NOT NULL REFERENCES public.cash_reconciliations(id) ON DELETE CASCADE,
  cashflow_line_id uuid NOT NULL REFERENCES public.cashflow_lines(id) ON DELETE RESTRICT,
  manual_value numeric(12,2) NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reconciliation_id, cashflow_line_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_recon_values TO authenticated;
GRANT ALL ON public.cash_recon_values TO service_role;
ALTER TABLE public.cash_recon_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read cash_recon_values" ON public.cash_recon_values
  FOR SELECT TO authenticated USING (restaurant_id = public.current_restaurant_id());
CREATE POLICY "tenant write cash_recon_values" ON public.cash_recon_values
  FOR ALL TO authenticated
  USING (restaurant_id = public.current_restaurant_id()
         AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'cashier')))
  WITH CHECK (restaurant_id = public.current_restaurant_id()
         AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'cashier')));
CREATE TRIGGER trg_cash_recon_values_touch BEFORE UPDATE ON public.cash_recon_values
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------
-- denomination_counts
-- ---------------------------------------------------------
CREATE TABLE public.denomination_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  reconciliation_id uuid NOT NULL REFERENCES public.cash_reconciliations(id) ON DELETE CASCADE,
  denomination_id uuid NOT NULL REFERENCES public.denomination_config(id) ON DELETE RESTRICT,
  count numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reconciliation_id, denomination_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.denomination_counts TO authenticated;
GRANT ALL ON public.denomination_counts TO service_role;
ALTER TABLE public.denomination_counts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read denomination_counts" ON public.denomination_counts
  FOR SELECT TO authenticated USING (restaurant_id = public.current_restaurant_id());
CREATE POLICY "tenant write denomination_counts" ON public.denomination_counts
  FOR ALL TO authenticated
  USING (restaurant_id = public.current_restaurant_id()
         AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'cashier')))
  WITH CHECK (restaurant_id = public.current_restaurant_id()
         AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'cashier')));
CREATE TRIGGER trg_denomination_counts_touch BEFORE UPDATE ON public.denomination_counts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- SEED DATA (per restaurant)
-- =========================================================
INSERT INTO public.expense_categories (restaurant_id, name, display_order)
SELECT r.id, c.name, c.ord
FROM public.restaurants r
CROSS JOIN (VALUES
  ('Meat',1),('Poultry',2),('Fish',3),('Vegetables',4),('Dairy',5),
  ('Groceries/Oil',6),('Gas/Utilities',7),('Labour',8),('Overheads',9),
  ('Staff Advance',10),('Misc',11)
) AS c(name, ord)
ON CONFLICT (restaurant_id, name) DO NOTHING;

INSERT INTO public.cash_sections (restaurant_id, key, display_order)
SELECT r.id, s.key, s.ord
FROM public.restaurants r
CROSS JOIN (VALUES ('NON-AC',1),('AC',2),('Takeaway',3)) AS s(key, ord)
ON CONFLICT (restaurant_id, key) DO NOTHING;

INSERT INTO public.denomination_config (restaurant_id, value, label, display_order)
SELECT r.id, d.value, d.label, d.ord
FROM public.restaurants r
CROSS JOIN (VALUES
  (500::numeric,'500',1),(200,'200',2),(100,'100',3),(50,'50',4),
  (20,'20',5),(10,'10',6),(5,'5',7),(NULL,'Coins',8),(NULL,'Damage',9)
) AS d(value, label, ord);

-- =========================================================
-- READ-ONLY HELPERS
-- =========================================================

-- section_finance: live totals from settled invoices, grouped by tables.section.
-- Takeaway sessions have NULL table_code -> mapped to 'Takeaway'.
-- payment_mode enum currently has: cash, upi, card, other.
-- gpay_total maps to 'upi'; swiggy_total returns 0 until a dedicated mode/source exists.
CREATE OR REPLACE FUNCTION public.section_finance(_business_date date, _section_key text)
RETURNS TABLE (
  sales_total numeric,
  gpay_total numeric,
  card_total numeric,
  swiggy_total numeric,
  cash_sales_total numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH rid AS (SELECT public.current_restaurant_id() AS r),
  scoped_invoices AS (
    SELECT i.id, i.total
    FROM public.invoices i
    JOIN public.order_sessions s ON s.id = i.session_id
    LEFT JOIN public.tables t
      ON t.code = s.table_code AND t.restaurant_id = i.restaurant_id
    WHERE i.restaurant_id = (SELECT r FROM rid)
      AND i.status = 'settled'
      AND ((i.issued_at AT TIME ZONE 'Asia/Kolkata')::date) = _business_date
      AND CASE
            WHEN s.channel = 'takeaway' THEN 'Takeaway'
            ELSE COALESCE(t.section, 'NON-AC')
          END = _section_key
  ),
  pay AS (
    SELECT p.mode, p.amount
    FROM public.payments p
    JOIN scoped_invoices si ON si.id = p.invoice_id
  )
  SELECT
    COALESCE((SELECT SUM(total) FROM scoped_invoices), 0)::numeric                            AS sales_total,
    COALESCE((SELECT SUM(amount) FROM pay WHERE mode = 'upi'), 0)::numeric                    AS gpay_total,
    COALESCE((SELECT SUM(amount) FROM pay WHERE mode = 'card'), 0)::numeric                   AS card_total,
    0::numeric                                                                                AS swiggy_total,
    COALESCE((SELECT SUM(amount) FROM pay WHERE mode = 'cash'), 0)::numeric                   AS cash_sales_total;
$$;

-- vendor_due_balance: lifetime purchase amount − lifetime paid_amount − vendor_payments
CREATE OR REPLACE FUNCTION public.vendor_due_balance(_vendor_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    COALESCE((SELECT SUM(amount) FROM public.purchase_lines
              WHERE vendor_id = _vendor_id
                AND restaurant_id = public.current_restaurant_id()), 0)
    - COALESCE((SELECT SUM(paid_amount) FROM public.purchase_lines
                WHERE vendor_id = _vendor_id
                  AND restaurant_id = public.current_restaurant_id()), 0)
    - COALESCE((SELECT SUM(amount) FROM public.vendor_payments
                WHERE vendor_id = _vendor_id
                  AND restaurant_id = public.current_restaurant_id()), 0)
  )::numeric;
$$;
