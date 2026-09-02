CREATE OR REPLACE FUNCTION public.gf_get_statistics_overview(p_start_date date, p_end_date date, p_category_id text DEFAULT NULL) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_category_id uuid;
  v_result json;
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RAISE EXCEPTION '统计日期范围无效' USING ERRCODE = '22007';
  END IF;

  IF NULLIF(btrim(p_category_id), '') IS NOT NULL THEN
    BEGIN
      v_category_id := p_category_id::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION '统计分类无效' USING ERRCODE = '22P02';
    END;
  END IF;

  WITH live AS (
    SELECT d.id, d.category_id, d.status, d.purchase_price_cents, d.purchase_date, d.currency
    FROM devices d
    WHERE d.user_id = auth.uid()
      AND d.deleted_at IS NULL
      AND (v_category_id IS NULL OR d.category_id = v_category_id)
  ),
  summary AS (
    SELECT
      count(*)::int AS device_count,
      count(*) FILTER (WHERE status IN ('IN_USE', 'IDLE'))::int AS active_device_count,
      COALESCE(sum(purchase_price_cents), 0)::bigint AS total_asset_cents,
      COALESCE(sum(purchase_price_cents) FILTER (WHERE purchase_date BETWEEN p_start_date AND p_end_date), 0)::bigint AS purchase_spend_cents,
      COALESCE((
        SELECT sum(dc.amount_cents)::bigint
        FROM device_costs dc
        INNER JOIN live l ON l.id = dc.device_id
        WHERE dc.user_id = auth.uid()
          AND dc.cost_type = 'MAINTENANCE'
          AND dc.occurred_at BETWEEN p_start_date AND p_end_date
      ), 0)::bigint AS maintenance_spend_cents,
      CASE
        WHEN count(DISTINCT currency) > 1 THEN 'MIXED'
        ELSE COALESCE(NULLIF(upper(min(currency)), ''), 'CNY')
      END AS currency
    FROM live
  ),
  warranty_summary AS (
    SELECT
      count(*) FILTER (WHERE w.id IS NOT NULL AND w.end_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date + 31)::int AS in_warranty,
      count(*) FILTER (WHERE w.id IS NOT NULL AND w.end_date BETWEEN (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date + 30)::int AS expiring_in_30_days,
      count(*) FILTER (WHERE w.id IS NOT NULL AND w.end_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date)::int AS expired,
      count(*) FILTER (WHERE w.id IS NULL)::int AS unknown
    FROM live l
    LEFT JOIN warranties w ON w.device_id = l.id AND w.user_id = auth.uid()
  ),
  category_rows AS (
    SELECT
      l.category_id,
      COALESCE(c.name, '未分类') AS category_name,
      count(*)::int AS device_count,
      COALESCE(sum(l.purchase_price_cents), 0)::bigint AS asset_cents
    FROM live l
    LEFT JOIN device_categories c ON c.id = l.category_id
    GROUP BY l.category_id, c.name
  ),
  lifecycle_rows AS (
    SELECT
      states.status,
      states.label,
      states.sort_order,
      count(l.id)::int AS device_count,
      COALESCE(sum(l.purchase_price_cents), 0)::bigint AS asset_cents
    FROM (VALUES
      ('IN_USE'::text, '使用中'::text, 1),
      ('IDLE'::text, '闲置'::text, 2),
      ('SOLD'::text, '已出售'::text, 3),
      ('DISCARDED'::text, '已报废'::text, 4)
    ) AS states(status, label, sort_order)
    LEFT JOIN live l ON l.status = states.status
    GROUP BY states.status, states.label, states.sort_order
  )
  SELECT json_build_object(
    'deviceCount', s.device_count,
    'activeDeviceCount', s.active_device_count,
    'totalAssetCents', s.total_asset_cents,
    'purchaseSpendCents', s.purchase_spend_cents,
    'maintenanceSpendCents', s.maintenance_spend_cents,
    'currency', s.currency,
    'warrantySummary', json_build_object(
      'inWarranty', w.in_warranty,
      'expiringIn30Days', w.expiring_in_30_days,
      'expired', w.expired,
      'unknown', w.unknown
    ),
    'categoryDistribution', COALESCE((
      SELECT json_agg(json_build_object(
        'categoryId', category_id,
        'categoryName', category_name,
        'deviceCount', device_count,
        'assetCents', asset_cents
      ) ORDER BY asset_cents DESC, category_name ASC)
      FROM category_rows
    ), '[]'::json),
    'lifecycleDistribution', COALESCE((
      SELECT json_agg(json_build_object(
        'status', status,
        'label', label,
        'deviceCount', device_count,
        'assetCents', asset_cents
      ) ORDER BY sort_order)
      FROM lifecycle_rows
    ), '[]'::json)
  ) INTO v_result
  FROM summary s
  CROSS JOIN warranty_summary w;

  RETURN v_result;
END
$function$;
