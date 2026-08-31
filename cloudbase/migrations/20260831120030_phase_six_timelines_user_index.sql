CREATE INDEX idx_device_timelines_user_date ON device_timelines (user_id, event_date DESC, created_at DESC);
