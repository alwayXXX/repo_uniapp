-- GearFlow MySQL schema (CloudBase MySQL 8.0).
-- Apply statements one at a time through `tcb db execute`.

CREATE TABLE IF NOT EXISTS users (
  id varchar(36) NOT NULL,
  openid varchar(128) NOT NULL,
  nickname varchar(64) DEFAULT NULL,
  avatar_url varchar(512) DEFAULT NULL,
  status varchar(16) NOT NULL DEFAULT 'ACTIVE',
  last_login_at timestamp(3) NULL DEFAULT NULL,
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_openid (openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS device_categories (
  id varchar(36) NOT NULL,
  scope varchar(16) NOT NULL DEFAULT 'SYSTEM',
  owner_key varchar(64) NOT NULL DEFAULT 'system',
  code varchar(32) NOT NULL,
  name varchar(32) NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active tinyint(1) NOT NULL DEFAULT 1,
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_device_categories_scope_code (scope, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS devices (
  id varchar(36) NOT NULL,
  openid varchar(128) NOT NULL,
  category_id varchar(36) DEFAULT NULL,
  name varchar(64) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'IN_USE',
  brand varchar(64) DEFAULT NULL,
  model varchar(128) DEFAULT NULL,
  serial_number varchar(128) DEFAULT NULL,
  purchase_date date DEFAULT NULL,
  purchase_channel varchar(128) DEFAULT NULL,
  purchase_price_cents int DEFAULT NULL,
  currency char(3) NOT NULL DEFAULT 'CNY',
  notes varchar(1000) DEFAULT NULL,
  disposal_date date DEFAULT NULL,
  disposal_price_cents int DEFAULT NULL,
  disposal_notes varchar(1000) DEFAULT NULL,
  deleted_at timestamp(3) NULL DEFAULT NULL,
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_devices_openid_deleted (openid, deleted_at),
  KEY idx_devices_openid_status (openid, status),
  KEY idx_devices_openid_category (openid, category_id),
  KEY idx_devices_openid_purchase (openid, purchase_date),
  CONSTRAINT fk_devices_category FOREIGN KEY (category_id) REFERENCES device_categories (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS warranties (
  id varchar(36) NOT NULL,
  device_id varchar(36) NOT NULL,
  openid varchar(128) NOT NULL,
  start_date date DEFAULT NULL,
  end_date date NOT NULL,
  provider varchar(128) DEFAULT NULL,
  scope varchar(128) DEFAULT NULL,
  notes varchar(1000) DEFAULT NULL,
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_warranties_device (device_id),
  KEY idx_warranties_openid_end (openid, end_date),
  CONSTRAINT fk_warranties_device FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS maintenance_records (
  id varchar(36) NOT NULL,
  device_id varchar(36) NOT NULL,
  openid varchar(128) NOT NULL,
  title varchar(64) NOT NULL,
  type varchar(16) NOT NULL,
  occurred_at date NOT NULL,
  cost_cents int DEFAULT NULL,
  vendor varchar(128) DEFAULT NULL,
  notes varchar(1000) DEFAULT NULL,
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_maintenance_device_date (device_id, occurred_at, created_at),
  KEY idx_maintenance_openid_date (openid, occurred_at),
  CONSTRAINT fk_maintenance_device FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS device_costs (
  id varchar(36) NOT NULL,
  device_id varchar(36) NOT NULL,
  openid varchar(128) NOT NULL,
  cost_type varchar(16) NOT NULL,
  amount_cents int NOT NULL,
  occurred_at date NOT NULL,
  maintenance_id varchar(36) DEFAULT NULL,
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_device_costs_maintenance (maintenance_id),
  KEY idx_device_costs_device_date (device_id, occurred_at),
  CONSTRAINT fk_costs_device FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS device_timelines (
  id varchar(36) NOT NULL,
  device_id varchar(36) NOT NULL,
  openid varchar(128) NOT NULL,
  event_type varchar(24) NOT NULL,
  event_date date NOT NULL,
  title varchar(128) NOT NULL,
  description varchar(255) DEFAULT NULL,
  payload json DEFAULT NULL,
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_timeline_device_date (device_id, event_date, created_at),
  KEY idx_timeline_openid (openid, created_at),
  CONSTRAINT fk_timeline_device FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS consent_records (
  id varchar(36) NOT NULL,
  openid varchar(128) NOT NULL,
  policy_type varchar(16) NOT NULL,
  policy_version varchar(32) NOT NULL,
  consented_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_consent_version (openid, policy_type, policy_version),
  KEY idx_consent_openid (openid, consented_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
