-- Section-aware print routing + first-class hubs & sections

-- 1. Managed registry of hub PCs (each runs the print agent with HUB_ID = hub_key)
CREATE TABLE IF NOT EXISTS public.printer_hubs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  hub_key       text NOT NULL,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (restaurant_id, hub_key)
);
ALTER TABLE public.printer_hubs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "restaurant members" ON public.printer_hubs;
CREATE POLICY "restaurant members" ON public.printer_hubs
  USING (restaurant_id = (SELECT restaurant_id FROM profiles WHERE id = auth.uid()));

-- 2. Named print sections (e.g. "AC Floor", "Non-AC Ground")
CREATE TABLE IF NOT EXISTS public.print_sections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE public.print_sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "restaurant members" ON public.print_sections;
CREATE POLICY "restaurant members" ON public.print_sections
  USING (restaurant_id = (SELECT restaurant_id FROM profiles WHERE id = auth.uid()));

-- 3. Assign each user to a section
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES print_sections(id) ON DELETE SET NULL;

-- 4. Section-aware printer assignments
ALTER TABLE public.printer_assignments
  ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES print_sections(id) ON DELETE CASCADE;

-- Replace the old (restaurant_id, job_type) primary key with a surrogate id,
-- and enforce uniqueness via partial indexes so a NULL section means the global default.
ALTER TABLE public.printer_assignments ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.printer_assignments DROP CONSTRAINT IF EXISTS printer_assignments_pkey;
UPDATE public.printer_assignments SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE public.printer_assignments ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.printer_assignments ADD PRIMARY KEY (id);

DROP INDEX IF EXISTS printer_assignments_default_uniq;
DROP INDEX IF EXISTS printer_assignments_section_uniq;
CREATE UNIQUE INDEX printer_assignments_default_uniq ON public.printer_assignments
  (restaurant_id, job_type) WHERE section_id IS NULL;
CREATE UNIQUE INDEX printer_assignments_section_uniq ON public.printer_assignments
  (restaurant_id, section_id, job_type) WHERE section_id IS NOT NULL;
