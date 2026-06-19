-- Add a JSONB column to profiles to store per-user permission overrides.
-- NULL means "inherit defaults from role". A JSON object maps permission keys → boolean.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS permissions jsonb;
