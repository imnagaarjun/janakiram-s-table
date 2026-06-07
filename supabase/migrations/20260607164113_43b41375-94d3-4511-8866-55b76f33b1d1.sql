
REVOKE EXECUTE ON FUNCTION public.pool_qty(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.available_qty(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pool_qty(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.available_qty(uuid) TO authenticated, service_role;
