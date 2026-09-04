ALTER TABLE warranties ADD CONSTRAINT warranty_device_user_fk FOREIGN KEY (device_id, user_id) REFERENCES devices(id, user_id) ON DELETE CASCADE;
