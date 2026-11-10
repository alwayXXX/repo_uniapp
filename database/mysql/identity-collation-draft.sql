-- DRAFT ONLY. Never execute against CloudBase until separately authorized and tested.
-- Each ALTER commits independently; confirm schema and stop writes during migration.
ALTER TABLE users MODIFY COLUMN openid varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL;
ALTER TABLE devices MODIFY COLUMN openid varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL;
ALTER TABLE warranties MODIFY COLUMN openid varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL;
ALTER TABLE maintenance_records MODIFY COLUMN openid varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL;
ALTER TABLE device_costs MODIFY COLUMN openid varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL;
ALTER TABLE device_timelines MODIFY COLUMN openid varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL;
ALTER TABLE consent_records MODIFY COLUMN openid varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL;
ALTER TABLE device_attachments MODIFY COLUMN openid varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL;
ALTER TABLE device_reminders MODIFY COLUMN openid varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL;
