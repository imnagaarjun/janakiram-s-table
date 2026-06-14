-- Create the "menu" storage bucket (used for menu images + staff photos).
-- Buckets are usually created via the dashboard, but this ensures it exists.
INSERT INTO storage.buckets (id, name, public)
VALUES ('menu', 'menu', false)
ON CONFLICT (id) DO NOTHING;

-- Allow the app_role column to store any text value by switching from
-- an enum to text. This lets admins create custom roles from the UI.
ALTER TABLE public.user_roles ALTER COLUMN role TYPE text USING role::text;
DROP TYPE IF EXISTS public.app_role CASCADE;

-- Recreate the has_role helper to work with text instead of enum.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;
