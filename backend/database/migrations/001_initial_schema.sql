CREATE TABLE IF NOT EXISTS admins (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(180) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash BINARY(32) PRIMARY KEY,
  admin_id INT UNSIGNED NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  INDEX (expires_at),
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(120) PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  category VARCHAR(80) NOT NULL,
  price_crc INT UNSIGNED NOT NULL,
  image VARCHAR(500) NOT NULL,
  description TEXT NOT NULL,
  availability VARCHAR(100) NOT NULL,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INT UNSIGNED NOT NULL DEFAULT 0,
  presentation JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS inventory_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id VARCHAR(120) NOT NULL,
  sku VARCHAR(155) NOT NULL UNIQUE,
  label VARCHAR(255) NOT NULL,
  quantity INT UNSIGNED NULL,
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS inventory_movements (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  item_id INT UNSIGNED NOT NULL,
  admin_id INT UNSIGNED NOT NULL,
  previous_quantity INT UNSIGNED NULL,
  new_quantity INT UNSIGNED NOT NULL,
  reason VARCHAR(250) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX (item_id, id),
  FOREIGN KEY (item_id) REFERENCES inventory_items(id),
  FOREIGN KEY (admin_id) REFERENCES admins(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(100) PRIMARY KEY
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS staff_access (
  account_id INT UNSIGNED PRIMARY KEY,
  role ENUM('admin','worker') NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  FOREIGN KEY (account_id) REFERENCES admins(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sales_inquiries (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_id INT UNSIGNED NOT NULL,
  product_id VARCHAR(120) NOT NULL,
  channel ENUM('WhatsApp','Instagram','Tienda') NOT NULL,
  stage ENUM('Consulta','Cotización','Venta confirmada','Perdida') NOT NULL DEFAULT 'Consulta',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  INDEX (created_at, channel),
  INDEX (owner_id, stage),
  FOREIGN KEY (owner_id) REFERENCES admins(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS access_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_id INT UNSIGNED NOT NULL,
  subject_id INT UNSIGNED NOT NULL,
  action ENUM('Alta','Activación','Desactivación') NOT NULL,
  occurred_at DATETIME NOT NULL,
  FOREIGN KEY (actor_id) REFERENCES admins(id),
  FOREIGN KEY (subject_id) REFERENCES admins(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS knowledge_articles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  body TEXT NOT NULL,
  audience ENUM('team','admin') NOT NULL,
  author_id INT UNSIGNED NOT NULL,
  published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL,
  FOREIGN KEY (author_id) REFERENCES admins(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS google_drive_connections (
  id TINYINT UNSIGNED PRIMARY KEY,
  folder_id VARCHAR(180) NOT NULL,
  encrypted_tokens TEXT NOT NULL,
  status ENUM('connected','revoked','error') NOT NULL DEFAULT 'connected',
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS drive_documents (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  file_id VARCHAR(180) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  source_url VARCHAR(1000) NOT NULL,
  audience ENUM('team','admin') NOT NULL DEFAULT 'team',
  modified_time DATETIME NULL,
  status ENUM('indexed','error','revoked') NOT NULL DEFAULT 'indexed',
  error VARCHAR(500) NULL,
  updated_at DATETIME NOT NULL,
  INDEX (status, audience),
  INDEX (modified_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS drive_chunks (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  document_id BIGINT UNSIGNED NOT NULL,
  chunk_no INT UNSIGNED NOT NULL,
  body TEXT NOT NULL,
  UNIQUE KEY document_chunk (document_id, chunk_no),
  FULLTEXT KEY body_search (body),
  FOREIGN KEY (document_id) REFERENCES drive_documents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS drive_sync_runs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_id INT UNSIGNED NOT NULL,
  files_synced INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  FOREIGN KEY (actor_id) REFERENCES admins(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_usage (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  admin_id INT UNSIGNED NOT NULL,
  model VARCHAR(120) NOT NULL,
  input_tokens INT UNSIGNED NULL,
  output_tokens INT UNSIGNED NULL,
  success BOOLEAN NOT NULL,
  created_at DATETIME NOT NULL,
  INDEX (admin_id, created_at),
  FOREIGN KEY (admin_id) REFERENCES admins(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS customers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  email VARCHAR(254) NULL,
  notes TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY customer_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS suppliers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  contact_name VARCHAR(180) NULL,
  phone VARCHAR(30) NULL,
  email VARCHAR(254) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY supplier_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS orders (
  id CHAR(36) PRIMARY KEY,
  customer_id INT UNSIGNED NULL,
  customer_name VARCHAR(180) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  channel ENUM('WhatsApp','Tienda','Telefono','Otro') NOT NULL DEFAULT 'Tienda',
  status ENUM('Pendiente','Pagado','Preparacion','Despachado','Entregado','Cancelado') NOT NULL DEFAULT 'Pendiente',
  subtotal_crc INT UNSIGNED NOT NULL DEFAULT 0,
  discount_crc INT UNSIGNED NOT NULL DEFAULT 0,
  total_crc INT UNSIGNED NOT NULL DEFAULT 0,
  payment_method ENUM('Tarjeta','Transferencia','SINPE Móvil','Efectivo','Por verificar') NOT NULL DEFAULT 'Por verificar',
  idempotency_key VARCHAR(100) NULL,
  notes TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY order_idempotency (idempotency_key),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id CHAR(36) NOT NULL,
  product_id VARCHAR(120) NOT NULL,
  inventory_item_id INT UNSIGNED NULL,
  name VARCHAR(180) NOT NULL,
  variant_label VARCHAR(255) NULL,
  quantity INT UNSIGNED NOT NULL,
  unit_price_crc INT UNSIGNED NOT NULL,
  cost_crc INT UNSIGNED NOT NULL DEFAULT 0,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id CHAR(36) NOT NULL,
  amount_crc INT UNSIGNED NOT NULL,
  method ENUM('Tarjeta','Transferencia','SINPE Móvil','Efectivo','Por verificar') NOT NULL,
  status ENUM('Pendiente','Confirmado','Rechazado','Reembolsado') NOT NULL DEFAULT 'Pendiente',
  reference VARCHAR(180) NULL,
  paid_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS refunds (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id CHAR(36) NOT NULL,
  amount_crc INT UNSIGNED NOT NULL,
  reason VARCHAR(500) NOT NULL,
  approved_by INT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by) REFERENCES admins(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS promotions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  description VARCHAR(500) NULL,
  discount_crc INT UNSIGNED NOT NULL DEFAULT 0,
  minimum_quantity INT UNSIGNED NOT NULL DEFAULT 1,
  product_id VARCHAR(120) NULL,
  starts_at DATETIME(3) NULL,
  ends_at DATETIME(3) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS warranties (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id CHAR(36) NULL,
  product_id VARCHAR(120) NOT NULL,
  serial_number VARCHAR(180) NULL,
  customer_name VARCHAR(180) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  issue TEXT NOT NULL,
  status ENUM('Recibida','En revisión','Aprobada','Rechazada','En reparación','Completada','Cancelada') NOT NULL DEFAULT 'Recibida',
  resolution TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS expenses (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category VARCHAR(100) NOT NULL,
  description VARCHAR(500) NOT NULL,
  amount_crc INT UNSIGNED NOT NULL,
  incurred_at DATETIME(3) NOT NULL,
  supplier_id INT UNSIGNED NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (created_by) REFERENCES admins(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  audience ENUM('admin','team','worker') NOT NULL DEFAULT 'admin',
  type VARCHAR(80) NOT NULL,
  title VARCHAR(180) NOT NULL,
  body VARCHAR(500) NOT NULL,
  read_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  admin_id INT UNSIGNED NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(180) NULL,
  details JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (admin_id) REFERENCES admins(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
