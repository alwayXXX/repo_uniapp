CREATE OR REPLACE FUNCTION public.gf_save_device_with_warranty(
  p_device_id text,
  p_category_id text,
  p_name text,
  p_status text,
  p_brand text,
  p_model text,
  p_serial_number text,
  p_purchase_date date,
  p_purchase_channel text,
  p_purchase_price_cents integer,
  p_notes text,
  p_warranty_mode text,
  p_warranty_start_date date,
  p_warranty_end_date date,
  p_warranty_provider text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid text := auth.uid();
  v_device_id uuid;
  v_category_id uuid;
  v_is_create boolean := NULLIF(btrim(coalesce(p_device_id, '')), '') IS NULL;
  v_purchase_date date;
BEGIN
  IF v_uid IS NULL OR btrim(v_uid) = '' THEN
    RETURN json_build_object('ok', false, 'errorCode', 'UNAUTHORIZED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE identity_id = v_uid AND status = 'ACTIVE') THEN
    RETURN json_build_object('ok', false, 'errorCode', 'UNAUTHORIZED');
  END IF;
  IF p_category_id IS NULL OR btrim(p_category_id) = '' OR p_category_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN json_build_object('ok', false, 'errorCode', 'CATEGORY_NOT_FOUND');
  END IF;
  v_category_id := p_category_id::uuid;
  IF NOT EXISTS (SELECT 1 FROM device_categories WHERE id = v_category_id AND scope = 'SYSTEM' AND is_active = true) THEN
    RETURN json_build_object('ok', false, 'errorCode', 'CATEGORY_NOT_FOUND');
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' OR char_length(btrim(p_name)) > 64 THEN
    RETURN json_build_object('ok', false, 'errorCode', 'VALIDATION_ERROR');
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('IN_USE', 'IDLE', 'SOLD', 'DISCARDED') THEN
    RETURN json_build_object('ok', false, 'errorCode', 'VALIDATION_ERROR');
  END IF;
  IF p_brand IS NOT NULL AND char_length(btrim(p_brand)) > 64 THEN
    RETURN json_build_object('ok', false, 'errorCode', 'VALIDATION_ERROR');
  END IF;
  IF p_model IS NOT NULL AND char_length(btrim(p_model)) > 128 THEN
    RETURN json_build_object('ok', false, 'errorCode', 'VALIDATION_ERROR');
  END IF;
  IF p_serial_number IS NOT NULL AND char_length(btrim(p_serial_number)) > 128 THEN
    RETURN json_build_object('ok', false, 'errorCode', 'VALIDATION_ERROR');
  END IF;
  IF p_purchase_channel IS NOT NULL AND char_length(btrim(p_purchase_channel)) > 128 THEN
    RETURN json_build_object('ok', false, 'errorCode', 'VALIDATION_ERROR');
  END IF;
  IF p_notes IS NOT NULL AND char_length(btrim(p_notes)) > 1000 THEN
    RETURN json_build_object('ok', false, 'errorCode', 'VALIDATION_ERROR');
  END IF;
  IF p_purchase_price_cents IS NOT NULL AND p_purchase_price_cents < 0 THEN
    RETURN json_build_object('ok', false, 'errorCode', 'VALIDATION_ERROR');
  END IF;
  IF p_purchase_date IS NOT NULL AND p_purchase_date > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date THEN
    RETURN json_build_object('ok', false, 'errorCode', 'VALIDATION_ERROR');
  END IF;
  IF p_warranty_mode IS NULL OR p_warranty_mode NOT IN ('KEEP', 'SET', 'CLEAR') THEN
    RETURN json_build_object('ok', false, 'errorCode', 'VALIDATION_ERROR');
  END IF;
  IF p_warranty_mode = 'SET' AND (p_warranty_start_date IS NULL OR p_warranty_end_date IS NULL OR p_warranty_end_date < p_warranty_start_date) THEN
    RETURN json_build_object('ok', false, 'errorCode', 'VALIDATION_ERROR');
  END IF;
  IF p_warranty_provider IS NOT NULL AND char_length(btrim(p_warranty_provider)) > 128 THEN
    RETURN json_build_object('ok', false, 'errorCode', 'VALIDATION_ERROR');
  END IF;

  IF v_is_create THEN
    INSERT INTO devices (
      user_id, category_id, name, status, brand, model, serial_number,
      purchase_date, purchase_channel, purchase_price_cents, notes
    ) VALUES (
      v_uid, v_category_id, btrim(p_name), p_status, NULLIF(btrim(p_brand), ''),
      NULLIF(btrim(p_model), ''), NULLIF(btrim(p_serial_number), ''), p_purchase_date,
      NULLIF(btrim(p_purchase_channel), ''), p_purchase_price_cents, NULLIF(btrim(p_notes), '')
    ) RETURNING id INTO v_device_id;
  ELSE
    IF p_device_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RETURN json_build_object('ok', false, 'errorCode', 'DEVICE_NOT_FOUND');
    END IF;
    v_device_id := p_device_id::uuid;
    PERFORM 1 FROM devices WHERE id = v_device_id AND user_id = v_uid AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN
      RETURN json_build_object('ok', false, 'errorCode', 'DEVICE_NOT_FOUND');
    END IF;
    UPDATE devices
       SET category_id = v_category_id,
           name = btrim(p_name),
           status = p_status,
           brand = NULLIF(btrim(p_brand), ''),
           model = NULLIF(btrim(p_model), ''),
           serial_number = NULLIF(btrim(p_serial_number), ''),
           purchase_date = p_purchase_date,
           purchase_channel = NULLIF(btrim(p_purchase_channel), ''),
           purchase_price_cents = p_purchase_price_cents,
           notes = NULLIF(btrim(p_notes), ''),
           updated_at = now()
     WHERE id = v_device_id AND user_id = v_uid AND deleted_at IS NULL;
  END IF;

  IF p_warranty_mode = 'CLEAR' OR (v_is_create AND p_warranty_mode = 'KEEP') THEN
    DELETE FROM warranties WHERE device_id = v_device_id AND user_id = v_uid;
  ELSIF p_warranty_mode = 'SET' THEN
    IF EXISTS (SELECT 1 FROM warranties WHERE device_id = v_device_id AND user_id <> v_uid) THEN
      RAISE EXCEPTION 'warranty ownership mismatch' USING ERRCODE = '42501';
    END IF;
    INSERT INTO warranties (
      device_id, user_id, start_date, end_date, provider
    ) VALUES (
      v_device_id, v_uid, p_warranty_start_date, p_warranty_end_date,
      NULLIF(btrim(p_warranty_provider), '')
    )
    ON CONFLICT (device_id) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           start_date = EXCLUDED.start_date,
           end_date = EXCLUDED.end_date,
           provider = EXCLUDED.provider,
           updated_at = now();
  END IF;

  RETURN json_build_object('ok', true, 'id', v_device_id, 'created', v_is_create);
END
$function$;
