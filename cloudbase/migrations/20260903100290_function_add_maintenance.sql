CREATE OR REPLACE FUNCTION public.gf_add_maintenance(
  p_device_id text,
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
  v_device_id uuid;
  v_purchase_date date;
  v_id uuid;
BEGIN
  IF v_uid IS NULL OR btrim(v_uid) = '' OR p_device_id IS NULL OR p_device_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN json_build_object('ok', false, 'errorCode', 'DEVICE_NOT_FOUND');
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

  v_device_id := p_device_id::uuid;
  SELECT purchase_date INTO v_purchase_date
    FROM devices
   WHERE id = v_device_id
     AND user_id = v_uid
     AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'errorCode', 'DEVICE_NOT_FOUND');
  END IF;
  IF p_occurred_at IS NULL OR p_occurred_at > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date OR (v_purchase_date IS NOT NULL AND p_occurred_at < v_purchase_date) THEN
    RETURN json_build_object('ok', false, 'errorCode', 'DATE_RANGE_INVALID');
  END IF;

  INSERT INTO maintenance_records (
    device_id, user_id, title, type, occurred_at, cost_cents, vendor, notes
  ) VALUES (
    v_device_id, v_uid, btrim(p_title), p_type, p_occurred_at, p_cost_cents,
    NULLIF(btrim(p_vendor), ''), NULLIF(btrim(p_notes), '')
  ) RETURNING id INTO v_id;

  IF p_cost_cents IS NOT NULL THEN
    INSERT INTO device_costs (
      device_id, user_id, cost_type, amount_cents, occurred_at, maintenance_id
    ) VALUES (v_device_id, v_uid, 'MAINTENANCE', p_cost_cents, p_occurred_at, v_id);
  END IF;

  INSERT INTO device_timelines (
    device_id, user_id, event_type, event_date, title, description, payload
  ) VALUES (
    v_device_id, v_uid, 'MAINTENANCE', p_occurred_at, btrim(p_title),
    'Maintenance record added',
    jsonb_build_object('changedFields', ARRAY['maintenance']::text[])
  );

  RETURN json_build_object('ok', true, 'id', v_id);
END
$function$;
