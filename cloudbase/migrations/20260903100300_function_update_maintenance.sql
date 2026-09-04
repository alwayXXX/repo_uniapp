CREATE OR REPLACE FUNCTION public.gf_update_maintenance(
  p_id text,
  p_title text,
  p_type text,
  p_occurred_at date,
  p_cost_cents integer,
  p_vendor text,
  p_notes text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid text := auth.uid();
  v_id uuid;
  v_device_id uuid;
  v_purchase_date date;
BEGIN
  IF v_uid IS NULL OR btrim(v_uid) = '' OR p_id IS NULL OR p_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN json_build_object('ok', false, 'errorCode', 'RESOURCE_NOT_FOUND');
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' OR char_length(btrim(p_title)) > 64 THEN
    RETURN json_build_object('ok', false, 'errorCode', 'VALIDATION_ERROR');
  END IF;
  IF p_type IS NULL OR p_type NOT IN ('REPAIR', 'UPGRADE', 'CLEAN', 'REPLACE', 'INSPECT', 'OTHER') THEN
    RETURN json_build_object('ok', false, 'errorCode', 'VALIDATION_ERROR');
  END IF;
  IF p_cost_cents IS NOT NULL AND p_cost_cents < 0 THEN
    RETURN json_build_object('ok', false, 'errorCode', 'VALIDATION_ERROR');
  END IF;
  IF p_vendor IS NOT NULL AND char_length(btrim(p_vendor)) > 128 THEN
    RETURN json_build_object('ok', false, 'errorCode', 'VALIDATION_ERROR');
  END IF;
  IF p_notes IS NOT NULL AND char_length(btrim(p_notes)) > 1000 THEN
    RETURN json_build_object('ok', false, 'errorCode', 'VALIDATION_ERROR');
  END IF;

  v_id := p_id::uuid;
  SELECT m.device_id, d.purchase_date INTO v_device_id, v_purchase_date
    FROM maintenance_records m
    INNER JOIN devices d ON d.id = m.device_id AND d.user_id = m.user_id
   WHERE m.id = v_id
     AND m.user_id = v_uid
     AND d.user_id = v_uid
     AND d.deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'errorCode', 'RESOURCE_NOT_FOUND');
  END IF;
  IF p_occurred_at IS NULL OR p_occurred_at > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date OR (v_purchase_date IS NOT NULL AND p_occurred_at < v_purchase_date) THEN
    RETURN json_build_object('ok', false, 'errorCode', 'DATE_RANGE_INVALID');
  END IF;

  UPDATE maintenance_records
     SET title = btrim(p_title),
         type = p_type,
         occurred_at = p_occurred_at,
         cost_cents = p_cost_cents,
         vendor = NULLIF(btrim(p_vendor), ''),
         notes = NULLIF(btrim(p_notes), ''),
         updated_at = now()
   WHERE id = v_id AND user_id = v_uid;

  DELETE FROM device_costs WHERE maintenance_id = v_id AND user_id = v_uid;
  IF p_cost_cents IS NOT NULL THEN
    INSERT INTO device_costs (
      device_id, user_id, cost_type, amount_cents, occurred_at, maintenance_id
    ) VALUES (v_device_id, v_uid, 'MAINTENANCE', p_cost_cents, p_occurred_at, v_id);
  END IF;

  RETURN json_build_object('ok', true);
END
$function$;
