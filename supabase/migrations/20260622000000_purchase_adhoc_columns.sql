-- One-off purchase entries made on the Daily Purchases screen.
--
-- Owner/admin controls the vendor and product catalogue. Employees only record purchases, so:
--   * a vendor an employee adds on the day is stored as a one-time vendor (is_adhoc, inactive):
--     it never appears in the daily vendor list or the catalogue unless the owner activates it;
--   * an item an employee adds under an existing vendor is stored only on the purchase line
--     (is_adhoc) and never creates a catalogue product;
--   * every line keeps its own unit, amount, paid and due, so reports, vendor dues and the
--     accounts stay correct for these entries.

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS is_adhoc boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by uuid;

ALTER TABLE public.purchase_lines
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS is_adhoc boolean NOT NULL DEFAULT false;

-- Backfill the unit for catalogue lines already recorded.
UPDATE public.purchase_lines pl
   SET unit = vp.unit
  FROM public.vendor_products vp
 WHERE pl.vendor_product_id = vp.id AND pl.unit IS NULL;

-- Early builds tagged one-off lines with note = 'adhoc|<unit>'. Move that into proper columns.
UPDATE public.purchase_lines
   SET is_adhoc = true,
       unit = NULLIF(substr(note, 7), ''),
       note = NULL
 WHERE note LIKE 'adhoc|%';
