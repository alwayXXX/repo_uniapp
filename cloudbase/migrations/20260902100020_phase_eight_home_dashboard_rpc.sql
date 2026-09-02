CREATE OR REPLACE FUNCTION public.gf_get_home_dashboard() RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_today date := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date;
  v_result json;
BEGIN
  WITH live AS (
    SELECT d.id, d.name, d.currency, d.status
    FROM devices d
    WHERE d.user_id = auth.uid() AND d.deleted_at IS NULL
  ),
  summary AS (
    SELECT
      count(*)::int AS device_count,
      count(*) FILTER (WHERE status IN ('IN_USE', 'IDLE'))::int AS active_device_count
    FROM live
  ),
  warranty_summary AS (
    SELECT
      count(*) FILTER (WHERE w.id IS NOT NULL AND w.end_date >= v_today + 31)::int AS in_warranty,
      count(*) FILTER (WHERE w.id IS NOT NULL AND w.end_date BETWEEN v_today AND v_today + 30)::int AS expiring_in_30_days,
      count(*) FILTER (WHERE w.id IS NOT NULL AND w.end_date < v_today)::int AS expired,
      count(*) FILTER (WHERE w.id IS NULL)::int AS unknown
    FROM live l
    LEFT JOIN warranties w ON w.device_id = l.id AND w.user_id = auth.uid()
  ),
  expiring_rows AS (
    SELECT
      l.id AS device_id,
      l.name AS device_name,
      w.end_date,
      (w.end_date - v_today)::int AS remaining_days
    FROM live l
    INNER JOIN warranties w ON w.device_id = l.id AND w.user_id = auth.uid()
    WHERE w.end_date BETWEEN v_today AND v_today + 30
    ORDER BY w.end_date ASC, w.created_at DESC
    LIMIT 30
  ),
  expired_rows AS (
    SELECT
      l.id AS device_id,
      l.name AS device_name,
      w.end_date,
      (w.end_date - v_today)::int AS remaining_days
    FROM live l
    INNER JOIN warranties w ON w.device_id = l.id AND w.user_id = auth.uid()
    WHERE w.end_date < v_today AND w.end_date >= v_today - 90
    ORDER BY w.end_date DESC, w.created_at DESC
    LIMIT 30
  ),
  recent_rows AS (
    SELECT
      m.id,
      m.device_id,
      l.name AS device_name,
      m.title,
      m.occurred_at,
      m.cost_cents,
      l.currency,
      m.created_at
    FROM maintenance_records m
    INNER JOIN live l ON l.id = m.device_id
    WHERE m.user_id = auth.uid()
    ORDER BY m.occurred_at DESC, m.created_at DESC
    LIMIT 5
  ),
  totals AS (
    SELECT
      (SELECT count(*)::int FROM warranties w INNER JOIN live l ON l.id = w.device_id AND w.user_id = auth.uid() WHERE w.end_date BETWEEN v_today AND v_today + 30) AS expiring_total,
      (SELECT count(*)::int FROM warranties w INNER JOIN live l ON l.id = w.device_id AND w.user_id = auth.uid() WHERE w.end_date < v_today AND w.end_date >= v_today - 90) AS expired_total
  )
  SELECT json_build_object(
    'deviceCount', s.device_count,
    'activeDeviceCount', s.active_device_count,
    'warrantySummary', json_build_object(
      'inWarranty', w.in_warranty,
      'expiringIn30Days', w.expiring_in_30_days,
      'expired', w.expired,
      'unknown', w.unknown
    ),
    'expiringTotal', t.expiring_total,
    'expiredTotal', t.expired_total,
    'expiring', COALESCE((
      SELECT json_agg(json_build_object(
        'deviceId', device_id,
        'deviceName', device_name,
        'endDate', end_date,
        'remainingDays', remaining_days
      ) ORDER BY end_date ASC)
      FROM expiring_rows
    ), '[]'::json),
    'expired', COALESCE((
      SELECT json_agg(json_build_object(
        'deviceId', device_id,
        'deviceName', device_name,
        'endDate', end_date,
        'remainingDays', remaining_days
      ) ORDER BY end_date DESC)
      FROM expired_rows
    ), '[]'::json),
    'recentMaintenances', COALESCE((
      SELECT json_agg(json_build_object(
        'id', id,
        'deviceId', device_id,
        'deviceName', device_name,
        'title', title,
        'occurredAt', occurred_at,
        'costCents', cost_cents,
        'currency', currency
      ) ORDER BY occurred_at DESC, created_at DESC)
      FROM recent_rows
    ), '[]'::json)
  ) INTO v_result
  FROM summary s
  CROSS JOIN warranty_summary w
  CROSS JOIN totals t;

  RETURN v_result;
END
$function$;
