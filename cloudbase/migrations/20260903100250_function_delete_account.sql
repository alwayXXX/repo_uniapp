CREATE OR REPLACE FUNCTION public.gf_delete_account()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid text := auth.uid();
  v_deleted_at timestamptz;
  v_warranties integer := 0;
  v_costs integer := 0;
  v_maintenances integer := 0;
  v_timelines integer := 0;
  v_devices integer := 0;
  v_consents integer := 0;
BEGIN
  IF v_uid IS NULL OR btrim(v_uid) = '' THEN
    RETURN json_build_object('status', 'UNAUTHORIZED');
  END IF;

  DELETE FROM warranties
   WHERE user_id = v_uid
      OR device_id IN (SELECT id FROM devices WHERE user_id = v_uid);
  GET DIAGNOSTICS v_warranties = ROW_COUNT;

  DELETE FROM device_costs
   WHERE user_id = v_uid
      OR device_id IN (SELECT id FROM devices WHERE user_id = v_uid);
  GET DIAGNOSTICS v_costs = ROW_COUNT;

  DELETE FROM maintenance_records
   WHERE user_id = v_uid
      OR device_id IN (SELECT id FROM devices WHERE user_id = v_uid);
  GET DIAGNOSTICS v_maintenances = ROW_COUNT;

  DELETE FROM device_timelines
   WHERE user_id = v_uid
      OR device_id IN (SELECT id FROM devices WHERE user_id = v_uid);
  GET DIAGNOSTICS v_timelines = ROW_COUNT;

  DELETE FROM devices WHERE user_id = v_uid;
  GET DIAGNOSTICS v_devices = ROW_COUNT;

  DELETE FROM consent_records WHERE user_id = v_uid;
  GET DIAGNOSTICS v_consents = ROW_COUNT;

  UPDATE users
     SET identity_id = 'deleted:' || gen_random_uuid()::text,
         nickname = NULL,
         avatar_url = NULL,
         status = 'DELETED',
         updated_at = now()
   WHERE identity_id = v_uid
     AND status <> 'DELETED'
   RETURNING updated_at INTO v_deleted_at;

  RETURN json_build_object(
    'status', CASE WHEN v_deleted_at IS NULL THEN 'NOT_FOUND' ELSE 'DELETED' END,
    'deletedWarranties', v_warranties,
    'deletedCosts', v_costs,
    'deletedMaintenances', v_maintenances,
    'deletedTimelines', v_timelines,
    'deletedDevices', v_devices,
    'deletedConsents', v_consents,
    'deletedAt', v_deleted_at
  );
END
$function$;
