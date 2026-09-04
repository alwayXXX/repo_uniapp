CREATE OR REPLACE FUNCTION public.gf_soft_delete_device(p_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid text := auth.uid();
  v_id uuid;
  v_deleted_at timestamptz;
BEGIN
  IF v_uid IS NULL OR btrim(v_uid) = '' OR p_id IS NULL OR p_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN json_build_object('ok', false, 'errorCode', 'DEVICE_NOT_FOUND');
  END IF;
  v_id := p_id::uuid;
  UPDATE devices
     SET deleted_at = now(),
         updated_at = now()
   WHERE id = v_id
     AND user_id = v_uid
     AND deleted_at IS NULL
   RETURNING deleted_at INTO v_deleted_at;
  IF v_deleted_at IS NULL THEN
    RETURN json_build_object('ok', false, 'errorCode', 'DEVICE_NOT_FOUND');
  END IF;
  RETURN json_build_object('ok', true, 'deletedAt', v_deleted_at);
END
$function$;
