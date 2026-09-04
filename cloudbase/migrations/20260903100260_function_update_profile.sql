CREATE OR REPLACE FUNCTION public.gf_update_profile(p_nickname text, p_avatar_url text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid text := auth.uid();
  v_nickname text := NULLIF(btrim(p_nickname), '');
  v_avatar_url text := NULLIF(btrim(p_avatar_url), '');
  v_updated integer := 0;
BEGIN
  IF v_uid IS NULL OR btrim(v_uid) = '' THEN
    RETURN json_build_object('ok', false, 'errorCode', 'UNAUTHORIZED');
  END IF;
  IF v_nickname IS NOT NULL AND char_length(v_nickname) > 64 THEN
    RETURN json_build_object('ok', false, 'errorCode', 'VALIDATION_ERROR');
  END IF;
  IF v_avatar_url IS NOT NULL AND char_length(v_avatar_url) > 2048 THEN
    RETURN json_build_object('ok', false, 'errorCode', 'VALIDATION_ERROR');
  END IF;

  UPDATE users
     SET nickname = v_nickname,
         avatar_url = v_avatar_url,
         updated_at = now()
   WHERE identity_id = v_uid
     AND status = 'ACTIVE';
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN json_build_object(
    'ok', v_updated > 0,
    'errorCode', CASE WHEN v_updated > 0 THEN NULL ELSE 'RESOURCE_NOT_FOUND' END
  );
END
$function$;
