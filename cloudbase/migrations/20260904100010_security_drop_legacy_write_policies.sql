DO $$
BEGIN
  DROP POLICY IF EXISTS users_update_own ON public.users;
  DROP POLICY IF EXISTS consent_insert_own ON public.consent_records;
  DROP POLICY IF EXISTS devices_insert_own ON public.devices;
  DROP POLICY IF EXISTS devices_update_own ON public.devices;
  DROP POLICY IF EXISTS devices_delete_own ON public.devices;
  DROP POLICY IF EXISTS maint_insert_own ON public.maintenance_records;
  DROP POLICY IF EXISTS maint_update_own ON public.maintenance_records;
  DROP POLICY IF EXISTS maint_delete_own ON public.maintenance_records;
  DROP POLICY IF EXISTS warranty_insert_own ON public.warranties;
  DROP POLICY IF EXISTS warranty_update_own ON public.warranties;
  DROP POLICY IF EXISTS warranty_delete_own ON public.warranties;
END
$$;
