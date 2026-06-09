
REVOKE EXECUTE ON FUNCTION public.section_finance(date, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.vendor_due_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.section_finance(date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_due_balance(uuid) TO authenticated, service_role;
