-- Phase 12 draft only: verify live state; apply only after the approved identity collation changes are verified.
-- Do not apply until deletion/retry, permissions and CloudBase SDK behavior are verified.
-- The index must first be checked in INFORMATION_SCHEMA; ADD INDEX is not idempotent.
ALTER TABLE users ADD UNIQUE KEY uk_users_openid_status (openid, status);

CREATE TABLE IF NOT EXISTS ai_daily_quota (
  id char(64) NOT NULL,
  openid varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  _openid varchar(64) NOT NULL DEFAULT '',
  account_status varchar(16) NOT NULL DEFAULT 'ACTIVE',
  quota_day date NOT NULL,
  used_count int NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_quota_owner_day (openid, quota_day),
  KEY idx_ai_quota_user_status (openid, account_status),
  CONSTRAINT fk_ai_quota_user_status FOREIGN KEY (openid, account_status)
    REFERENCES users (openid, status) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS ai_grants (
  id varchar(64) NOT NULL,
  openid varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  _openid varchar(64) NOT NULL DEFAULT '',
  account_status varchar(16) NOT NULL DEFAULT 'ACTIVE',
  kind varchar(16) NOT NULL,
  input_digest char(64) NOT NULL,
  expires_at_ms bigint NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'ISSUED',
  PRIMARY KEY (id),
  KEY idx_ai_grants_user_status (openid, account_status),
  CONSTRAINT fk_ai_grants_user_status FOREIGN KEY (openid, account_status)
    REFERENCES users (openid, status) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
