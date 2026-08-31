CREATE INDEX idx_device_timelines_device_date ON device_timelines (device_id, event_date DESC, created_at DESC);
