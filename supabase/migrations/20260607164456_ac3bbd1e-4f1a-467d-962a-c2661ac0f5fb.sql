
-- Read: any authenticated staff can read menu images (they're scoped by restaurant via folder, but listing across is fine)
CREATE POLICY "menu read for authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'menu');

-- Write/update/delete: only Admin/Manager, only within their own restaurant folder
CREATE POLICY "menu write for managers"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'menu'
  AND (storage.foldername(name))[1] = public.current_restaurant_id()::text
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
);

CREATE POLICY "menu update for managers"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'menu'
  AND (storage.foldername(name))[1] = public.current_restaurant_id()::text
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
)
WITH CHECK (
  bucket_id = 'menu'
  AND (storage.foldername(name))[1] = public.current_restaurant_id()::text
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
);

CREATE POLICY "menu delete for managers"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'menu'
  AND (storage.foldername(name))[1] = public.current_restaurant_id()::text
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
);
