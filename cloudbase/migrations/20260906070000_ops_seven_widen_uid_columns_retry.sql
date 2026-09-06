DO $$
DECLARE
  pol record;
BEGIN
  -- OPS-7：自定义登录 uid 可能超过 varchar(64)，放宽业务表 uid 列。
  -- 引用这些列的 RLS 策略会阻止 ALTER TYPE，故先摘除再按原定义重建。
  CREATE TEMP TABLE tmp_policies AS
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE tablename IN ('users','consent_records','device_costs','device_timelines','devices','maintenance_records','warranties');

  FOR pol IN SELECT * FROM tmp_policies LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;

  ALTER TABLE users ALTER COLUMN identity_id TYPE varchar(255);
  ALTER TABLE consent_records ALTER COLUMN user_id TYPE varchar(255);
  ALTER TABLE device_costs ALTER COLUMN user_id TYPE varchar(255);
  ALTER TABLE device_timelines ALTER COLUMN user_id TYPE varchar(255);
  ALTER TABLE devices ALTER COLUMN user_id TYPE varchar(255);
  ALTER TABLE maintenance_records ALTER COLUMN user_id TYPE varchar(255);
  ALTER TABLE warranties ALTER COLUMN user_id TYPE varchar(255);

  FOR pol IN SELECT * FROM tmp_policies LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s USING (%s)%s',
      pol.policyname,
      pol.schemaname,
      pol.tablename,
      pol.permissive,
      pol.cmd,
      CASE WHEN pol.roles IS NULL OR array_length(pol.roles, 1) IS NULL THEN 'PUBLIC' ELSE array_to_string(pol.roles, ', ') END,
      COALESCE(pol.qual, 'true'),
      CASE WHEN pol.with_check IS NULL THEN '' ELSE ' WITH CHECK (' || pol.with_check || ')' END
    );
  END LOOP;

  DROP TABLE tmp_policies;
END $$;
