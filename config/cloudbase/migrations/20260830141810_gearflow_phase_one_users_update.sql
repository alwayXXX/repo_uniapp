CREATE POLICY users_update_own ON users FOR UPDATE TO authenticated USING (identity_id = auth.uid()) WITH CHECK (identity_id = auth.uid());
