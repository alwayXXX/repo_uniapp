CREATE OR REPLACE FUNCTION public.gf_delete_maintenance(p_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid text := auth.uid();
  v_id uuid;
  v_deleted integer := 0;
  v_deleted_costs integer := 0;
BEGIN
  IF v_uid IS NULL OR btrim(v_uid) = '' OR p_id IS NULL OR p_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN json_build_object('ok', false, 'errorCode', 'RESOURCE_NOT_FOUND', 'deletedCosts', 0);
  END IF;
  v_id := p_id::uuid;
  PERFORM 1
    FROM maintenance_records m
    INNER JOIN devices d ON d.id = m.device_id AND d.user_id = m.user_id
   WHERE m.id = v_id
     AND m.user_id = v_uid
     AND d.user_id = v_uid
     AND d.deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'errorCode', 'RESOURCE_NOT_FOUND', 'deletedCosts', 0);
  END IF;

  DELETE FROM device_costs WHERE maintenance_id = v_id AND user_id = v_uid;
  GET DIAGNOSTICS v_deleted_costs = ROW_COUNT;
  DELETE FROM maintenance_records WHERE id = v_id AND user_id = v_uid;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN json_build_object('ok', v_deleted > 0, 'deletedCosts', v_deleted_costs);
END
$function$;
