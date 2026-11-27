ALTER TABLE admin_sessions
  ADD COLUMN family_id CHAR(36) NULL AFTER admin_id,
  ADD COLUMN revoked_at DATETIME(3) NULL AFTER expires_at,
  ADD COLUMN replaced_by_hash BINARY(32) NULL AFTER revoked_at;

CREATE INDEX idx_admin_sessions_family ON admin_sessions (family_id, revoked_at);

CREATE TABLE IF NOT EXISTS admin_mfa_totp (
  admin_id INT UNSIGNED PRIMARY KEY,
  encrypted_secret TEXT NOT NULL,
  verified_at DATETIME(3) NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS admin_login_challenges (
  id CHAR(36) PRIMARY KEY,
  admin_id INT UNSIGNED NOT NULL,
  kind ENUM('mfa','passkey-login','passkey-register') NOT NULL,
  challenge VARCHAR(512) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  consumed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_login_challenges_expiry (expires_at),
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS admin_passkeys (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  admin_id INT UNSIGNED NOT NULL,
  credential_id VARCHAR(512) NOT NULL UNIQUE,
  public_key BLOB NOT NULL,
  counter BIGINT UNSIGNED NOT NULL DEFAULT 0,
  transports JSON NULL,
  device_type VARCHAR(40) NULL,
  backed_up BOOLEAN NOT NULL DEFAULT FALSE,
  label VARCHAR(120) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_used_at DATETIME(3) NULL,
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE,
  INDEX idx_passkeys_admin (admin_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash BINARY(32) PRIMARY KEY,
  admin_id INT UNSIGNED NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3) NULL,
  requested_ip VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_password_reset_expiry (expires_at),
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
