ALTER TABLE device_costs ADD CONSTRAINT costs_maintenance_user_fk FOREIGN KEY (maintenance_id, user_id) REFERENCES maintenance_records(id, user_id) ON DELETE CASCADE;
