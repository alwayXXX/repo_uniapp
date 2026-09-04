ALTER POLICY warranty_select_own ON warranties USING (user_id = auth.uid() AND EXISTS (SELECT 1 FROM devices d WHERE d.id = warranties.device_id AND d.user_id = auth.uid() AND d.deleted_at IS NULL));
