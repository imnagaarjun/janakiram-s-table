-- Add a DB-level default to business_date so any direct insert that omits it
-- gets the current IST business date automatically. Belt-and-suspenders alongside
-- the frontend fix.
ALTER TABLE public.stock_ledger
  ALTER COLUMN business_date SET DEFAULT (NOW() AT TIME ZONE 'Asia/Kolkata')::date;
