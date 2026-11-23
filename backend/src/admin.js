import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { staffRoutes, requireAdmin } from './staff.js';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { catalog } from './catalog.js';
import { transaction } from './db.js';
import { hashPassword, verifyPassword } from './password.js';
import { billingRoutes } from './billing.js';

const sessionAge = 8 * 60 * 60 * 1000;
const cookieName = 'dz_admin';
const slug = z.string().max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const amount = z.number().int().min(0).max(1_000_000_000);
const productSchema = z.object({
  name: z.string().trim().min(1).max(180),
  category: z.string().trim().min(1).max(80),
  priceCRC: amount,
  costCRC: amount,
  image: z.string().trim().max(500).regex(/^\/images\/[a-z0-9/_-]+\.(?:png|jpe?g|webp|avif)$/i),
  shortDescription: z.string().trim().max(2000),
  availability: z.string().trim().min(1).max(100),
  featured: z.boolean(),
  active: z.boolean(),
  displayOrder: amount,
});
const stockSchema = z.object({
  expected: amount.nullable(),
  quantity: amount,
  reason: z.string().trim().min(1).max(250),
});
const orderTransitions = {
  Pendiente: new Set(['Cancelado']),
  Pagado: new Set(['Preparacion', 'Cancelado']),
  Preparacion: new Set(['Despachado', 'Cancelado']),
  Despachado: new Set(['Entregado']),
  Entregado: new Set(),
  Cancelado: new Set(),
};

function tokenHash(token) {
  return createHash('sha256').update(token).digest();
}

function readToken(req) {
  return req.headers.cookie?.match(/(?:^|;\s*)dz_admin=([a-f0-9]{64})(?:;|$)/)?.[1];
}

export function adminRoutes(pool, { production, origin }) {
  const router = Router();
  const cookie = { httpOnly: true, secure: production, sameSite: 'strict', path: '/api/admin' };
  const dummyHash = hashPassword(randomBytes(24).toString('hex'));

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('Origin') !== origin) {
      return res.status(403).json({ error: 'Origen de la solicitud no autorizado.' });
    }
    next();
  });

  router.post('/login', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Demasiados intentos. Volvé a intentar en 15 minutos.' },
  }), async (req, res) => {
    const { email, password } = z.object({
      email: z.string().trim().toLowerCase().max(254).email(),
      password: z.string().min(1).max(128),
    }).parse(req.body);
    const [[admin]] = await pool.execute('SELECT a.id, a.email, a.password_hash, x.role FROM admins a JOIN staff_access x ON x.account_id=a.id WHERE a.email=? AND x.enabled=1', [email]);
    const valid = await verifyPassword(password, admin?.password_hash ?? await dummyHash);
    if (!admin || !valid) return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });

    const token = randomBytes(32).toString('hex');
    await transaction(pool, async (connection) => {
      await connection.execute('DELETE FROM admin_sessions WHERE expires_at <= UTC_TIMESTAMP(3)');
      const previous = readToken(req);
      if (previous) await connection.execute('DELETE FROM admin_sessions WHERE token_hash = ?', [tokenHash(previous)]);
      await connection.execute(
        'INSERT INTO admin_sessions (token_hash, admin_id, expires_at) VALUES (?, ?, ?)',
        [tokenHash(token), admin.id, new Date(Date.now() + sessionAge)],
      );
    });
    res.cookie(cookieName, token, { ...cookie, maxAge: sessionAge }).json({ email: admin.email, role: admin.role });
  });

  router.use(async (req, res, next) => {
    const token = readToken(req);
    if (token) {
      const [[admin]] = await pool.execute(
        `SELECT a.id, a.email, x.role FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
         JOIN staff_access x ON x.account_id=a.id AND x.enabled=1 WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(3)`,
        [tokenHash(token)],
      );
      if (admin) {
        req.admin = admin;
        return next();
      }
    }
    res.status(401).json({ error: 'Iniciá sesión para continuar.' });
  });

  router.get('/session', (req, res) => res.json({ email: req.admin.email, role: req.admin.role }));
  router.post('/logout', async (req, res) => {
    await pool.execute('DELETE FROM admin_sessions WHERE token_hash = ?', [tokenHash(readToken(req))]);
    res.clearCookie(cookieName, cookie).status(204).end();
  });

  router.use('/staff', staffRoutes(pool));
  router.use(requireAdmin);
  router.use('/billing', billingRoutes(pool));

  router.get('/products', async (req, res) => res.json(await catalog(pool, true)));

  router.post('/products', async (req, res) => {
    const { id, ...product } = productSchema.extend({ id: slug }).parse(req.body);
    await transaction(pool, async (connection) => {
      await connection.execute(
        `INSERT INTO products (id, name, category, price_crc, cost_crc, image, description, availability, featured, active, display_order, presentation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, JSON_OBJECT())`,
        [id, ...productValues(product)],
      );
      await connection.execute(
        'INSERT INTO inventory_items (product_id, sku, label) VALUES (?, ?, ?)', [id, `${id}-1`, 'Única'],
      );
    });
    res.status(201).json({ id });
  });

  router.put('/products/:id', async (req, res) => {
    const id = slug.parse(req.params.id);
    const product = productSchema.parse(req.body);
    const [result] = await pool.execute(
      `UPDATE products SET name = ?, category = ?, price_crc = ?, cost_crc = ?, image = ?, description = ?,
       availability = ?, featured = ?, active = ?, display_order = ? WHERE id = ?`,
      [...productValues(product), id],
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Producto no encontrado.' });
    res.status(204).end();
  });

  router.patch('/products/:id/variant-prices', async (req, res) => {
    const id = slug.parse(req.params.id);
    const prices = z.array(amount).min(1).max(100).parse(req.body);
    const updated = await transaction(pool, async (connection) => {
      const [[product]] = await connection.execute('SELECT presentation FROM products WHERE id = ? FOR UPDATE', [id]);
      const variants = product?.presentation.variants;
      if (!variants || variants.length !== prices.length) return false;
      for (const [index, variant] of variants.entries()) variant.priceCRC = prices[index];
      await connection.execute(
        "UPDATE products SET presentation = JSON_SET(presentation, '$.variants', CAST(? AS JSON)) WHERE id = ?",
        [JSON.stringify(variants), id],
      );
      return true;
    });
    if (!updated) return res.status(409).json({ error: 'Las opciones del producto no coinciden. Recargá el panel.' });
    res.status(204).end();
  });

  router.get('/inventory', async (req, res) => {
    const [rows] = await pool.execute(
      `SELECT i.id, i.product_id AS productId, i.sku, i.label, i.quantity, p.name, p.active
       FROM inventory_items i JOIN products p ON p.id = i.product_id ORDER BY p.display_order, p.id, i.id`,
    );
    res.json(rows);
  });

  router.get('/inventory/:id/movements', async (req, res) => {
    const id = z.coerce.number().int().positive().max(4_294_967_295).parse(req.params.id);
    const [rows] = await pool.execute(
      `SELECT m.previous_quantity AS previous, m.new_quantity AS quantity, m.reason,
              m.created_at AS createdAt, a.email
       FROM inventory_movements m JOIN admins a ON a.id = m.admin_id
       WHERE m.item_id = ? ORDER BY m.id DESC LIMIT 50`, [id],
    );
    res.json(rows);
  });

  router.post('/inventory/:id/movements', async (req, res) => {
    const id = z.coerce.number().int().positive().max(4_294_967_295).parse(req.params.id);
    const { quantity, expected, reason } = stockSchema.parse(req.body);
    const result = await transaction(pool, async (connection) => {
      const [[item]] = await connection.execute('SELECT quantity FROM inventory_items WHERE id = ? FOR UPDATE', [id]);
      if (!item) return 'missing';
      if (item.quantity !== expected) return 'conflict';
      if (item.quantity === quantity) return 'unchanged';
      await connection.execute('UPDATE inventory_items SET quantity = ? WHERE id = ?', [quantity, id]);
      await connection.execute(
        `INSERT INTO inventory_movements (item_id, admin_id, previous_quantity, new_quantity, reason, created_at)
         VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`, [id, req.admin.id, item.quantity, quantity, reason],
      );
      return 'saved';
    });
    if (result === 'missing') return res.status(404).json({ error: 'SKU no encontrado.' });
    if (result === 'conflict') return res.status(409).json({ error: 'El stock cambió. Volvé a seleccionar el SKU y verificá el conteo.' });
    if (result === 'unchanged') return res.status(422).json({ error: 'Ingresá una cantidad distinta de la registrada.' });
    res.status(201).json({ quantity });
  });

  router.get('/orders', async (req, res) => {
    const [rows] = await pool.execute(
      `SELECT o.*, COUNT(i.id) AS itemCount,
       COALESCE(SUM(i.quantity * i.unit_price_crc),0) AS itemSubtotal
       FROM orders o LEFT JOIN order_items i ON i.order_id=o.id
       GROUP BY o.id ORDER BY o.created_at DESC`,
    );
    res.json(rows);
  });

  router.get('/orders/:id', async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const [[order]] = await pool.execute('SELECT * FROM orders WHERE id=?', [id]);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado.' });
    const [items] = await pool.execute('SELECT * FROM order_items WHERE order_id=?', [id]);
    res.json({ ...order, items });
  });

  router.patch('/orders/:id/status', async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const status = z.enum(['Pendiente','Pagado','Preparacion','Despachado','Entregado','Cancelado']).parse(req.body?.status);
    const changed = await transaction(pool, async (connection) => {
      const [[order]] = await connection.execute('SELECT status FROM orders WHERE id=? FOR UPDATE', [id]);
      if (!order) return false;
      if (order.status === status) return 'unchanged';
      if (status === 'Pagado') return 'payment_required';
      if (!orderTransitions[order.status]?.has(status)) return 'invalid_transition';
      if (status === 'Cancelado') {
        const [items] = await connection.execute(
          'SELECT inventory_item_id, quantity FROM order_items WHERE order_id=? AND inventory_item_id IS NOT NULL', [id],
        );
        for (const item of items) {
          const [[inventory]] = await connection.execute('SELECT quantity FROM inventory_items WHERE id=? FOR UPDATE', [item.inventory_item_id]);
          if (inventory && inventory.quantity !== null) {
            await connection.execute('UPDATE inventory_items SET quantity=quantity+? WHERE id=?', [item.quantity, item.inventory_item_id]);
            await connection.execute(
              `INSERT INTO inventory_movements (item_id, admin_id, previous_quantity, new_quantity, reason, created_at)
               VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
              [item.inventory_item_id, req.admin.id, inventory.quantity, inventory.quantity + item.quantity, `Liberación por cancelación del pedido ${id}`],
            );
          }
        }
      }
      await connection.execute('UPDATE orders SET status=?, updated_at=UTC_TIMESTAMP(3) WHERE id=?', [status, id]);
      await connection.execute(
        'INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,details) VALUES (?, ?, ?, ?, ?)',
        [req.admin.id, 'Cambió estado', 'order', id, JSON.stringify({ from: order.status, to: status })],
      );
      return true;
    });
    if (!changed) return res.status(404).json({ error: 'Pedido no encontrado.' });
    if (changed === 'unchanged') return res.status(204).end();
    if (changed === 'payment_required') return res.status(409).json({ error: 'El pago debe confirmarse desde el flujo de pagos; no se puede marcar manualmente como Pagado.' });
    if (changed === 'invalid_transition') return res.status(409).json({ error: 'Transición de pedido no permitida para el estado actual.' });
    res.status(204).end();
  });

  router.get('/customers', async (req, res) => {
    const [rows] = await pool.execute(
      `SELECT c.*, COUNT(o.id) AS orderCount, COALESCE(SUM(o.total_crc),0) AS purchasedCRC
       FROM customers c LEFT JOIN orders o ON o.customer_id=c.id GROUP BY c.id ORDER BY c.created_at DESC`,
    );
    res.json(rows);
  });

  router.get('/suppliers', async (req, res) => {
    const [rows] = await pool.execute('SELECT * FROM suppliers ORDER BY active DESC, name');
    res.json(rows);
  });

  router.post('/suppliers', async (req, res) => {
    const body = z.object({
      name: z.string().trim().min(1).max(180),
      contactName: z.string().trim().max(180).optional(),
      phone: z.string().trim().max(30).optional(),
      email: z.string().trim().email().max(254).optional().or(z.literal('')),
    }).parse(req.body);
    const [result] = await pool.execute(
      'INSERT INTO suppliers(name,contact_name,phone,email) VALUES (?,?,?,?)',
      [body.name, body.contactName || null, body.phone || null, body.email || null],
    );
    res.status(201).json({ id: result.insertId });
  });

  router.get('/promotions', async (req, res) => {
    const [rows] = await pool.execute('SELECT * FROM promotions ORDER BY active DESC, starts_at DESC');
    res.json(rows);
  });

  router.post('/promotions', async (req, res) => {
    const body = z.object({
      name: z.string().trim().min(1).max(180),
      description: z.string().trim().max(500).optional(),
      discountCRC: amount,
      minimumQuantity: z.number().int().min(1).max(100),
      productId: z.string().max(120).optional().nullable(),
      active: z.boolean(),
    }).parse(req.body);
    const [result] = await pool.execute(
      'INSERT INTO promotions(name,description,discount_crc,minimum_quantity,product_id,active) VALUES (?,?,?,?,?,?)',
      [body.name, body.description || null, body.discountCRC, body.minimumQuantity, body.productId || null, body.active],
    );
    res.status(201).json({ id: result.insertId });
  });

  router.patch('/promotions/:id', async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const active = z.boolean().parse(req.body?.active);
    await pool.execute('UPDATE promotions SET active=? WHERE id=?', [active, id]);
    res.status(204).end();
  });

  router.get('/warranties', async (req, res) => {
    const [rows] = await pool.execute(
      `SELECT w.*, p.name AS productName FROM warranties w JOIN products p ON p.id=w.product_id ORDER BY w.created_at DESC`,
    );
    res.json(rows);
  });

  router.patch('/warranties/:id/status', async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = z.object({
      status: z.enum(['Recibida','En revisión','Aprobada','Rechazada','En reparación','Completada','Cancelada']),
      resolution: z.string().trim().max(1000).optional(),
    }).parse(req.body);
    await pool.execute('UPDATE warranties SET status=?, resolution=?, updated_at=UTC_TIMESTAMP(3) WHERE id=?',
      [body.status, body.resolution || null, id]);
    res.status(204).end();
  });

  router.get('/expenses', async (req, res) => {
    const [rows] = await pool.execute('SELECT * FROM expenses ORDER BY incurred_at DESC, id DESC LIMIT 300');
    res.json(rows);
  });

  router.post('/expenses', async (req, res) => {
    const body = z.object({
      category: z.string().trim().min(1).max(100),
      description: z.string().trim().min(1).max(500),
      amountCRC: amount,
      incurredAt: z.string().datetime(),
    }).parse(req.body);
    await pool.execute(
      'INSERT INTO expenses(category,description,amount_crc,incurred_at,created_by) VALUES (?,?,?,?,?)',
      [body.category, body.description, body.amountCRC, body.incurredAt, req.admin.id],
    );
    res.status(201).end();
  });

  router.get('/reports/profit', async (req, res) => {
    const [[sales]] = await pool.execute(
      `SELECT COALESCE(SUM(o.total_crc),0) AS revenue,
       COALESCE(SUM(o.total_crc - o.discount_crc),0) AS netSales
       FROM orders o WHERE o.status IN ('Pagado','Preparacion','Despachado','Entregado')`,
    );
    const [[costs]] = await pool.execute(
      `SELECT COALESCE(SUM(i.quantity*i.cost_crc),0) AS productCost
       FROM order_items i JOIN orders o ON o.id=i.order_id
       WHERE o.status IN ('Pagado','Preparacion','Despachado','Entregado')`,
    );
    const [[expenses]] = await pool.execute('SELECT COALESCE(SUM(amount_crc),0) AS expenses FROM expenses');
    const revenue = Number(sales.revenue);
    const productCost = Number(costs.productCost);
    const operatingExpenses = Number(expenses.expenses);
    res.json({
      revenue,
      productCost,
      operatingExpenses,
      grossProfit: revenue - productCost,
      estimatedNetProfit: revenue - productCost - operatingExpenses,
    });
  });

  router.get('/audit', async (req, res) => {
    const [rows] = await pool.execute(
      `SELECT l.*, a.email FROM audit_logs l LEFT JOIN admins a ON a.id=l.admin_id ORDER BY l.created_at DESC LIMIT 100`,
    );
    res.json(rows);
  });

  return router;
}

function productValues(product) {
  return [product.name, product.category, product.priceCRC, product.costCRC, product.image, product.shortDescription,
    product.availability, product.featured, product.active, product.displayOrder];
}
