CREATE INDEX idx_devices_user ON devices (user_id);
CREATE INDEX idx_devices_user_deleted ON devices (user_id, deleted_at);
GRANT SELECT, UPDATE ON users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON devices TO authenticated;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;