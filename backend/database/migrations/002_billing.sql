CREATE TABLE IF NOT EXISTS billing_documents (
  id CHAR(36) NOT NULL PRIMARY KEY,
  order_id CHAR(36) NOT NULL,
  customer_id INT UNSIGNED NULL,
  document_kind VARCHAR(36) NOT NULL,
  fiscal_status VARCHAR(32) NOT NULL DEFAULT 'not_applicable',
  document_status VARCHAR(32) NOT NULL DEFAULT 'draft',
  document_number VARCHAR(80) NULL,
  fiscal_key VARCHAR(50) NULL,
  currency CHAR(3) NOT NULL DEFAULT 'CRC',
  subtotal_crc BIGINT UNSIGNED NOT NULL DEFAULT 0,
  discount_crc BIGINT UNSIGNED NOT NULL DEFAULT 0,
  tax_crc BIGINT UNSIGNED NOT NULL DEFAULT 0,
  total_crc BIGINT UNSIGNED NOT NULL DEFAULT 0,
  emitter_snapshot JSON NOT NULL,
  customer_snapshot JSON NOT NULL,
  items_snapshot JSON NOT NULL,
  order_snapshot JSON NOT NULL,
  idempotency_key VARCHAR(180) NOT NULL,
  corrected_document_id CHAR(36) NULL,
  issued_at DATETIME(3) NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_billing_idempotency (idempotency_key),
  KEY idx_billing_order (order_id),
  KEY idx_billing_status (document_kind, fiscal_status, created_at),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (corrected_document_id) REFERENCES billing_documents(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS billing_document_files (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  document_id CHAR(36) NOT NULL,
  file_kind VARCHAR(30) NOT NULL,
  content_type VARCHAR(120) NOT NULL,
  storage_key VARCHAR(600) NOT NULL,
  sha256 CHAR(64) NOT NULL,
  byte_size BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_document_file_kind (document_id, file_kind),
  FOREIGN KEY (document_id) REFERENCES billing_documents(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS billing_delivery_attempts (
  id CHAR(36) NOT NULL PRIMARY KEY,
  document_id CHAR(36) NOT NULL,
  channel VARCHAR(30) NOT NULL,
  recipient_redacted VARCHAR(240) NULL,
  delivery_status VARCHAR(32) NOT NULL DEFAULT 'queued',
  provider_message_id VARCHAR(180) NULL,
  idempotency_key VARCHAR(180) NOT NULL,
  requested_by INT UNSIGNED NULL,
  last_error_summary VARCHAR(500) NULL,
  requested_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  sent_at DATETIME(3) NULL,
  delivered_at DATETIME(3) NULL,
  UNIQUE KEY uq_delivery_idempotency (idempotency_key),
  KEY idx_deliveries_document (document_id),
  FOREIGN KEY (document_id) REFERENCES billing_documents(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS billing_document_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  document_id CHAR(36) NOT NULL,
  actor_id INT UNSIGNED NULL,
  event_type VARCHAR(90) NOT NULL,
  event_details JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_events_document (document_id, created_at),
  FOREIGN KEY (document_id) REFERENCES billing_documents(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS billing_access_tokens (
  id CHAR(36) NOT NULL PRIMARY KEY,
  document_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  max_downloads SMALLINT UNSIGNED NOT NULL DEFAULT 3,
  download_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_access_hash (token_hash),
  KEY idx_access_document (document_id, expires_at),
  FOREIGN KEY (document_id) REFERENCES billing_documents(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
