UPDATE device_timelines SET payload = jsonb_build_object('changedFields', ARRAY['maintenance']::text[]) WHERE event_type = 'MAINTENANCE';
