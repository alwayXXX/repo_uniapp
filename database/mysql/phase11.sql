-- Non-destructive additions for Phase 11. Run each CREATE separately.
-- Check information_schema.columns before the ALTER; do not repeat an applied ALTER.
ALTER TABLE devices ADD COLUMN disposal_notes varchar(1000) DEFAULT NULL;

CREATE TABLE IF NOT EXISTS device_attachments (
  id varchar(36) NOT NULL,
  device_id varchar(36) NOT NULL,
  slot tinyint NOT NULL,
  openid varchar(128) NOT NULL,
  name varchar(128) NOT NULL,
  mime_type varchar(64) NOT NULL,
  size_bytes int NOT NULL,
  cloud_path varchar(512) NOT NULL,
  file_id varchar(1024) DEFAULT NULL,
  status varchar(16) NOT NULL DEFAULT 'UPLOADING',
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_attachment_path (cloud_path),
  UNIQUE KEY uk_attachment_slot (device_id, slot),
  KEY idx_attachment_owner_device (openid, device_id),
  CONSTRAINT fk_attachment_device FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS device_reminders (
  id varchar(36) NOT NULL,
  device_id varchar(36) NOT NULL,
  openid varchar(128) NOT NULL,
  remind_on date NOT NULL,
  warranty_end date NOT NULL,
  template_id varchar(128) NOT NULL,
  device_field varchar(32) NOT NULL,
  date_field varchar(32) NOT NULL,
  extra_fields json DEFAULT NULL,
  status varchar(16) NOT NULL DEFAULT 'PENDING',
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_reminder_due (status, remind_on),
  UNIQUE KEY uk_reminder_owner_date (openid, device_id, remind_on),
  KEY idx_reminder_owner_device (openid, device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
