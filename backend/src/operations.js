import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { transaction } from './db.js';

const roles = [
  ['super_admin', 'Super administrador'], ['store_admin', 'Administrador de tienda'],
  ['seller', 'Vendedor'], ['warehouse', 'Bodega'], ['support', 'Atención al cliente'], ['accounting', 'Contabilidad'],
];
const permissions = [
  ['products.manage', 'Gestionar productos'], ['inventory.adjust', 'Ajustar inventario'], ['inventory.transfer', 'Trasladar inventario'],
  ['orders.manage', 'Gestionar pedidos'], ['purchases.manage', 'Gestionar compras'], ['returns.manage', 'Gestionar devoluciones'],
  ['payments.verify', 'Verificar pagos'], ['refunds.approve', 'Aprobar reembolsos'], ['cash.manage', 'Gestionar caja'],
  ['billing.issue', 'Emitir documentos fiscales'], ['users.manage', 'Gestionar usuarios'], ['data.archive', 'Archivar información'],
];

export function operationsRoutes(pool) {
  const r = Router();
  r.get('/overview', async (req, res) => {
    const [[cash]] = await pool.execute("SELECT COUNT(*) AS open_sessions FROM cash_sessions WHERE status='Abierta'");
    const [[purchases]] = await pool.execute("SELECT COUNT(*) AS pending FROM purchase_orders WHERE status IN ('Solicitada','Aprobada','Parcial')");
    const [[returns]] = await pool.execute("SELECT COUNT(*) AS pending FROM return_requests WHERE status NOT IN ('Resuelta','Rechazada')");
    const [providers] = await pool.execute('SELECT provider,event_type,status,external_id,created_at FROM sandbox_provider_events ORDER BY id DESC LIMIT 20');
    res.json({ cash, purchases, returns, providers, sandbox: true });
  });
  r.post('/roles/seed', async (req, res) => {
    await transaction(pool, async (c) => {
      for (const [code, name] of roles) await c.execute('INSERT INTO roles(code,name) VALUES (?,?) ON DUPLICATE KEY UPDATE name=VALUES(name)', [code, name]);
      for (const [code, name] of permissions) await c.execute('INSERT INTO permissions(code,name) VALUES (?,?) ON DUPLICATE KEY UPDATE name=VALUES(name)', [code, name]);
      const [[adminRole]] = await c.execute("SELECT id FROM roles WHERE code='super_admin'");
      const [adminPerms] = await c.execute('SELECT id FROM permissions');
      for (const permission of adminPerms) await c.execute('INSERT IGNORE INTO role_permissions(role_id,permission_id) VALUES (?,?)', [adminRole.id, permission.id]);
      await c.execute('INSERT IGNORE INTO admin_roles(admin_id,role_id) VALUES (?,?)', [req.admin.id, adminRole.id]);
    });
    res.status(201).json({ seeded: true, roles: roles.length, permissions: permissions.length });
  });
  r.get('/roles', async (req, res) => {
    const [rows] = await pool.execute(`SELECT r.id,r.code,r.name,r.active,COUNT(DISTINCT ar.admin_id) AS users,COUNT(DISTINCT rp.permission_id) AS permissions
      FROM roles r LEFT JOIN admin_roles ar ON ar.role_id=r.id LEFT JOIN role_permissions rp ON rp.role_id=r.id GROUP BY r.id ORDER BY r.name`);
    res.json(rows);
  });
  r.get('/inventory', async (req, res) => {
    const [rows] = await pool.execute(`SELECT i.id,i.sku,i.label,p.name AS product_name,i.quantity,
      COALESCE(t.minimum_quantity,5) AS minimum_quantity,
      COALESCE((SELECT SUM(quantity) FROM stock_reservations sr WHERE sr.inventory_item_id=i.id AND sr.status='Activa'),0) AS reserved,
      i.quantity-COALESCE((SELECT SUM(quantity) FROM stock_reservations sr WHERE sr.inventory_item_id=i.id AND sr.status='Activa'),0) AS available
      FROM inventory_items i JOIN products p ON p.id=i.product_id LEFT JOIN inventory_thresholds t ON t.item_id=i.id ORDER BY p.name,i.label`);
    res.json(rows);
  });
  r.post('/inventory/reservations', async (req, res) => {
    const body = z.object({ inventoryItemId: z.number().int().positive(), orderId: z.string().uuid().optional(), quantity: z.number().int().positive(), idempotencyKey: z.string().min(8).max(180), expiresAt: z.string().datetime().optional() }).parse(req.body);
    const result = await transaction(pool, async (c) => {
      const [[existing]] = await c.execute('SELECT id FROM stock_reservations WHERE idempotency_key=?', [body.idempotencyKey]);
      if (existing) return { id: existing.id, idempotent: true };
      const [[item]] = await c.execute(`SELECT i.quantity-COALESCE((SELECT SUM(quantity) FROM stock_reservations WHERE inventory_item_id=i.id AND status='Activa'),0) AS available FROM inventory_items i WHERE i.id=? FOR UPDATE`, [body.inventoryItemId]);
      if (!item || item.available === null || item.available < body.quantity) return { error: 'Stock disponible insuficiente.' };
      const id = randomUUID();
      await c.execute('INSERT INTO stock_reservations(id,order_id,inventory_item_id,quantity,idempotency_key,expires_at,created_by) VALUES (?,?,?,?,?,?,?)', [id, body.orderId || null, body.inventoryItemId, body.quantity, body.idempotencyKey, body.expiresAt ? new Date(body.expiresAt) : null, req.admin.id]);
      return { id };
    });
    if (result.error) return res.status(409).json({ error: result.error });
    res.status(201).json(result);
  });
  r.get('/purchases', async (req, res) => {
    const [rows] = await pool.execute(`SELECT p.id,p.status,p.expected_at,p.created_at,s.name AS supplier_name,COUNT(i.id) AS line_count
      FROM purchase_orders p JOIN suppliers s ON s.id=p.supplier_id LEFT JOIN purchase_order_items i ON i.purchase_order_id=p.id GROUP BY p.id ORDER BY p.created_at DESC`);
    res.json(rows);
  });
  r.post('/purchases', async (req, res) => {
    const body = z.object({ supplierId: z.number().int().positive(), notes: z.string().max(1000).optional(), idempotencyKey: z.string().min(8).max(180), items: z.array(z.object({ productId: z.string().min(1), inventoryItemId: z.number().int().positive().optional(), quantity: z.number().int().positive(), unitCostCRC: z.number().int().nonnegative() })).min(1) }).parse(req.body);
    const id = randomUUID();
    await transaction(pool, async (c) => {
      await c.execute('INSERT INTO purchase_orders(id,supplier_id,notes,idempotency_key,created_by) VALUES (?,?,?,?,?)', [id, body.supplierId, body.notes || null, body.idempotencyKey, req.admin.id]);
      for (const item of body.items) await c.execute('INSERT INTO purchase_order_items(purchase_order_id,product_id,inventory_item_id,quantity,unit_cost_crc) VALUES (?,?,?,?,?)', [id, item.productId, item.inventoryItemId || null, item.quantity, item.unitCostCRC]);
      await c.execute('INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,details) VALUES (?,?,?,?,?)', [req.admin.id, 'Creó orden de compra', 'purchase_order', id, JSON.stringify({ items: body.items.length })]);
    });
    res.status(201).json({ id, status: 'Borrador' });
  });
  r.get('/returns', async (req, res) => {
    const [rows] = await pool.execute(`SELECT r.*,o.customer_name,c.phone FROM return_requests r JOIN orders o ON o.id=r.order_id LEFT JOIN customers c ON c.id=r.customer_id ORDER BY r.created_at DESC`);
    res.json(rows);
  });
  r.post('/returns', async (req, res) => {
    const body = z.object({ orderId: z.string().uuid(), reason: z.string().trim().min(5).max(1000), idempotencyKey: z.string().min(8).max(180), orderItemId: z.number().int().positive(), quantity: z.number().int().positive() }).parse(req.body);
    const id = randomUUID();
    await transaction(pool, async (c) => {
      const [[order]] = await c.execute('SELECT customer_id FROM orders WHERE id=?', [body.orderId]);
      if (!order) throw Object.assign(new Error('Pedido no encontrado.'), { status: 404 });
      await c.execute('INSERT INTO return_requests(id,order_id,customer_id,reason,idempotency_key,created_by) VALUES (?,?,?,?,?,?)', [id, body.orderId, order.customer_id, body.reason, body.idempotencyKey, req.admin.id]);
      await c.execute('INSERT INTO return_items(return_id,order_item_id,quantity) VALUES (?,?,?)', [id, body.orderItemId, body.quantity]);
    });
    res.status(201).json({ id, status: 'Solicitada' });
  });
  r.patch('/returns/:id', async (req, res) => {
    const id = z.string().uuid().parse(req.params.id); const body = z.object({ status: z.enum(['Solicitada','Evaluando','Aprobada','Recibida','Inspeccionada','Resuelta','Rechazada']), resolution: z.string().max(1000).optional() }).parse(req.body);
    const [result] = await pool.execute('UPDATE return_requests SET status=?,resolution=?,updated_at=UTC_TIMESTAMP(3) WHERE id=?', [body.status, body.resolution || null, id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Devolución no encontrada.' });
    await pool.execute('INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,details) VALUES (?,?,?,?,?)', [req.admin.id, 'Actualizó devolución', 'return', id, JSON.stringify(body)]);
    res.status(204).end();
  });
  r.get('/cash/sessions', async (req, res) => { const [rows] = await pool.execute(`SELECT s.*,a.email AS opened_by_email,COALESCE(SUM(CASE WHEN m.type IN ('Entrada','Venta') THEN m.amount_crc ELSE 0 END),0) AS inflows,COALESCE(SUM(CASE WHEN m.type IN ('Salida','Reembolso') THEN m.amount_crc ELSE 0 END),0) AS outflows FROM cash_sessions s JOIN admins a ON a.id=s.opened_by LEFT JOIN cash_movements m ON m.session_id=s.id GROUP BY s.id ORDER BY s.opened_at DESC`); res.json(rows); });
  r.post('/cash/sessions', async (req, res) => { const body = z.object({ openingAmountCRC: z.number().int().nonnegative() }).parse(req.body); const [[open]] = await pool.execute("SELECT id FROM cash_sessions WHERE status='Abierta'"); if (open) return res.status(409).json({ error: 'Ya existe una caja abierta.' }); const id = randomUUID(); await pool.execute('INSERT INTO cash_sessions(id,opening_amount_crc,opened_by) VALUES (?,?,?)', [id, body.openingAmountCRC, req.admin.id]); res.status(201).json({ id,status:'Abierta' }); });
  r.post('/cash/sessions/:id/movements', async (req, res) => { const id=z.string().uuid().parse(req.params.id); const body=z.object({ type:z.enum(['Entrada','Salida','Venta','Reembolso']), amountCRC:z.number().int().positive(), reason:z.string().trim().min(3).max(500), idempotencyKey:z.string().min(8).max(180) }).parse(req.body); await pool.execute('INSERT INTO cash_movements(session_id,type,amount_crc,reason,idempotency_key,created_by) VALUES (?,?,?,?,?,?)',[id,body.type,body.amountCRC,body.reason,body.idempotencyKey,req.admin.id]); res.status(201).json({ recorded:true }); });
  r.post('/cash/sessions/:id/close', async (req, res) => { const id=z.string().uuid().parse(req.params.id); const body=z.object({ closingAmountCRC:z.number().int().nonnegative() }).parse(req.body); const [result]=await pool.execute("UPDATE cash_sessions SET status='Cerrada',closing_amount_crc=?,closed_by=?,closed_at=UTC_TIMESTAMP(3) WHERE id=? AND status='Abierta'",[body.closingAmountCRC,req.admin.id,id]); if(!result.affectedRows)return res.status(409).json({error:'La caja no está abierta.'}); res.status(204).end(); });
  r.post('/providers/sandbox/events', async (req, res) => { const body=z.object({provider:z.string().trim().min(2).max(80),eventType:z.string().trim().min(2).max(120),externalId:z.string().trim().min(2).max(180),payload:z.record(z.string(),z.unknown())}).parse(req.body); const [result]=await pool.execute('INSERT IGNORE INTO sandbox_provider_events(provider,event_type,external_id,payload,status) VALUES (?,?,?,?,\'processed\')',[body.provider,body.eventType,body.externalId,JSON.stringify(body.payload)]); res.status(result.affectedRows?201:200).json({processed:true,idempotent:!result.affectedRows,sandbox:true}); });
  r.get('/providers/sandbox/events', async (req, res) => { const [rows]=await pool.execute('SELECT * FROM sandbox_provider_events ORDER BY id DESC LIMIT 100'); res.json(rows); });
  return r;
}
