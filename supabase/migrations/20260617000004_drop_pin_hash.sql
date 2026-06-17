-- Remove pin_hash column now that auth is email + password via Supabase Auth.
-- Run this AFTER confirming all staff have been given passwords via the Users tab.
ALTER TABLE public.profiles DROP COLUMN IF EXISTS pin_hash;
