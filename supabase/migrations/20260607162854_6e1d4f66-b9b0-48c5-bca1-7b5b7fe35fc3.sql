
-- Lock down SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_restaurant_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_restaurant_id() TO authenticated;

-- Storage policies for logos bucket (private)
CREATE POLICY "authenticated can read own restaurant logos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'logos' AND (storage.foldername(name))[1] = public.current_restaurant_id()::text);

CREATE POLICY "admin can upload restaurant logos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'logos'
    AND (storage.foldername(name))[1] = public.current_restaurant_id()::text
    AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "admin can update restaurant logos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'logos'
    AND (storage.foldername(name))[1] = public.current_restaurant_id()::text
    AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "admin can delete restaurant logos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'logos'
    AND (storage.foldername(name))[1] = public.current_restaurant_id()::text
    AND public.has_role(auth.uid(),'admin'));
