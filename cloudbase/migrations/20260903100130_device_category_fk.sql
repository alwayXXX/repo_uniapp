ALTER TABLE devices ADD CONSTRAINT devices_category_fk FOREIGN KEY (category_id) REFERENCES device_categories(id) ON DELETE RESTRICT;
