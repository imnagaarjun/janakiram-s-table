
CREATE TABLE public.table_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  split_count int NOT NULL DEFAULT 1 CHECK (split_count BETWEEN 1 AND 8),
  seats int NOT NULL DEFAULT 4,
  waiter_id uuid NULL REFERENCES public.waiters(id) ON DELETE SET NULL,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.table_groups TO authenticated;
GRANT ALL ON public.table_groups TO service_role;

ALTER TABLE public.table_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant read tg" ON public.table_groups FOR SELECT TO authenticated
  USING (restaurant_id = public.current_restaurant_id());
CREATE POLICY "tenant write tg" ON public.table_groups FOR ALL TO authenticated
  USING (restaurant_id = public.current_restaurant_id())
  WITH CHECK (restaurant_id = public.current_restaurant_id());

CREATE TRIGGER trg_table_groups_updated BEFORE UPDATE ON public.table_groups
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Sync function: regenerate child rows in public.tables to match a group's split_count.
CREATE OR REPLACE FUNCTION public.sync_table_group(_group_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _g record;
  _desired text[];
  _i int;
  _code text;
BEGIN
  SELECT * INTO _g FROM public.table_groups WHERE id = _group_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF _g.split_count <= 1 THEN
    _desired := ARRAY[_g.code];
  ELSE
    _desired := ARRAY[]::text[];
    FOR _i IN 1.._g.split_count LOOP
      _desired := _desired || (_g.code || substr('ABCDEFGH', _i, 1));
    END LOOP;
  END IF;

  -- Remove children no longer needed (only when free/inactive — never destroy active service)
  DELETE FROM public.tables
   WHERE restaurant_id = _g.restaurant_id
     AND (code = _g.code OR code ~ ('^' || _g.code || '[A-H]$'))
     AND code <> ALL(_desired)
     AND status IN ('free','inactive');

  -- Upsert desired children
  FOR _i IN 1..array_length(_desired, 1) LOOP
    _code := _desired[_i];
    INSERT INTO public.tables(restaurant_id, code, seats, status, display_order)
    VALUES (_g.restaurant_id, _code, _g.seats, 'free', _g.display_order * 100 + _i)
    ON CONFLICT (restaurant_id, code) DO UPDATE
      SET display_order = EXCLUDED.display_order,
          seats = EXCLUDED.seats;
  END LOOP;
END $$;

-- Backfill table_groups from existing tables (group by numeric prefix)
INSERT INTO public.table_groups (restaurant_id, code, split_count, seats, display_order)
SELECT t.restaurant_id,
       COALESCE((regexp_match(t.code, '^(\d+)'))[1], t.code) AS base_code,
       COUNT(*)::int,
       COALESCE(MAX(t.seats), 4),
       COALESCE(MIN(t.display_order), 0)
  FROM public.tables t
 GROUP BY t.restaurant_id, COALESCE((regexp_match(t.code, '^(\d+)'))[1], t.code)
ON CONFLICT (restaurant_id, code) DO NOTHING;
