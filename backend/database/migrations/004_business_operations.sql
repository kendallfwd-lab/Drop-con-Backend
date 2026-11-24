CREATE TABLE IF NOT EXISTS roles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS permissions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT UNSIGNED NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS admin_roles (
  admin_id INT UNSIGNED NOT NULL,
  role_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (admin_id, role_id),
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS warehouses (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL UNIQUE,
  address VARCHAR(300) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_reservations (
  id CHAR(36) PRIMARY KEY,
  order_id CHAR(36) NULL,
  inventory_item_id INT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  status ENUM('Activa','Liberada','Consumida','Expirada') NOT NULL DEFAULT 'Activa',
  idempotency_key VARCHAR(180) NOT NULL UNIQUE,
  expires_at DATETIME(3) NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id),
  FOREIGN KEY (created_by) REFERENCES admins(id),
  INDEX idx_reservation_item (inventory_item_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_transfers (
  id CHAR(36) PRIMARY KEY,
  inventory_item_id INT UNSIGNED NOT NULL,
  from_warehouse_id INT UNSIGNED NOT NULL,
  to_warehouse_id INT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  status ENUM('Borrador','En tránsito','Completado','Cancelado') NOT NULL DEFAULT 'Completado',
  reason VARCHAR(500) NOT NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id),
  FOREIGN KEY (from_warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (to_warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (created_by) REFERENCES admins(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_counts (
  id CHAR(36) PRIMARY KEY,
  inventory_item_id INT UNSIGNED NOT NULL,
  expected_quantity INT UNSIGNED NULL,
  counted_quantity INT UNSIGNED NOT NULL,
  difference INT NOT NULL,
  reason VARCHAR(500) NOT NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id),
  FOREIGN KEY (created_by) REFERENCES admins(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS purchase_orders (
  id CHAR(36) PRIMARY KEY,
  supplier_id INT UNSIGNED NOT NULL,
  status ENUM('Borrador','Solicitada','Aprobada','Parcial','Recibida','Cancelada') NOT NULL DEFAULT 'Borrador',
  expected_at DATETIME(3) NULL,
  notes VARCHAR(1000) NULL,
  idempotency_key VARCHAR(180) NOT NULL UNIQUE,
  created_by INT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (created_by) REFERENCES admins(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  purchase_order_id CHAR(36) NOT NULL,
  product_id VARCHAR(120) NOT NULL,
  inventory_item_id INT UNSIGNED NULL,
  quantity INT UNSIGNED NOT NULL,
  received_quantity INT UNSIGNED NOT NULL DEFAULT 0,
  unit_cost_crc INT UNSIGNED NOT NULL,
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS goods_receipts (
  id CHAR(36) PRIMARY KEY,
  purchase_order_id CHAR(36) NOT NULL,
  status ENUM('Recibida','Con diferencias','Cancelada') NOT NULL DEFAULT 'Recibida',
  notes VARCHAR(1000) NULL,
  idempotency_key VARCHAR(180) NOT NULL UNIQUE,
  created_by INT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id),
  FOREIGN KEY (created_by) REFERENCES admins(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS return_requests (
  id CHAR(36) PRIMARY KEY,
  order_id CHAR(36) NOT NULL,
  customer_id INT UNSIGNED NULL,
  status ENUM('Solicitada','Evaluando','Aprobada','Recibida','Inspeccionada','Resuelta','Rechazada') NOT NULL DEFAULT 'Solicitada',
  reason VARCHAR(1000) NOT NULL,
  resolution VARCHAR(1000) NULL,
  idempotency_key VARCHAR(180) NOT NULL UNIQUE,
  created_by INT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (created_by) REFERENCES admins(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS return_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  return_id CHAR(36) NOT NULL,
  order_item_id BIGINT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  inspection_status ENUM('Pendiente','Aprobado','Rechazado') NOT NULL DEFAULT 'Pendiente',
  FOREIGN KEY (return_id) REFERENCES return_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (order_item_id) REFERENCES order_items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cash_sessions (
  id CHAR(36) PRIMARY KEY,
  opening_amount_crc INT UNSIGNED NOT NULL,
  closing_amount_crc INT UNSIGNED NULL,
  status ENUM('Abierta','Cerrada') NOT NULL DEFAULT 'Abierta',
  opened_by INT UNSIGNED NOT NULL,
  closed_by INT UNSIGNED NULL,
  opened_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  closed_at DATETIME(3) NULL,
  FOREIGN KEY (opened_by) REFERENCES admins(id),
  FOREIGN KEY (closed_by) REFERENCES admins(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cash_movements (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id CHAR(36) NOT NULL,
  type ENUM('Entrada','Salida','Venta','Reembolso') NOT NULL,
  amount_crc INT UNSIGNED NOT NULL,
  reason VARCHAR(500) NOT NULL,
  idempotency_key VARCHAR(180) NOT NULL UNIQUE,
  created_by INT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (session_id) REFERENCES cash_sessions(id),
  FOREIGN KEY (created_by) REFERENCES admins(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sandbox_provider_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider VARCHAR(80) NOT NULL,
  event_type VARCHAR(120) NOT NULL,
  external_id VARCHAR(180) NOT NULL,
  status ENUM('received','processed','failed') NOT NULL DEFAULT 'received',
  payload JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_sandbox_event (provider, external_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
