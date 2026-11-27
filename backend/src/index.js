import express from 'express';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { createPool, transaction } from './db.js';
import { adminRoutes } from './admin.js';
import { catalog, legacyData } from './catalog.js';
import { calculateOrderTotals } from './pricing.js';
import { consumeOAuthState, saveDriveCallback } from './drive.js';
import { publicDocumentRoutes } from './billing.js';

const production = process.env.NODE_ENV === 'production';
const origin = new URL(process.env.APP_ORIGIN || 'http://127.0.0.1:5173');
const allowedAdminOrigins = new Set([origin.origin]);
const isAllowedAdminOrigin = (requestOrigin) => {
  if (allowedAdminOrigins.has(requestOrigin)) return true;
  if (production || !requestOrigin) return false;
  try {
    const candidate = new URL(requestOrigin);
    return candidate.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(candidate.hostname)
      && ['127.0.0.1', 'localhost'].includes(origin.hostname);
  } catch {
    return false;
  }
};
if (production && origin.protocol !== 'https:') throw new Error('APP_ORIGIN debe usar HTTPS en producción.');

const pool = createPool();
const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY_HOPS) app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS));
app.use(helmet({
  contentSecurityPolicy: { directives: { 'img-src': ["'self'", 'data:', 'blob:'], 'form-action': ["'self'"], 'frame-ancestors': ["'none'"], 'object-src': ["'none'"] } },
  strictTransportSecurity: production ? undefined : false,
}));
app.use('/api', (req, res, next) => {
  const requestOrigin = req.get('Origin');
  res.set('Vary', 'Origin');
  if (requestOrigin && !isAllowedAdminOrigin(requestOrigin)) return res.status(403).json({ error: 'Origen de la solicitud no autorizado.' });
  if (requestOrigin) {
    res.set('Access-Control-Allow-Origin', requestOrigin);
    res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use('/api', express.json({ limit: '16kb' }));
app.use('/api/admin', adminRoutes(pool, { production, origin: origin.origin, allowedOrigins: allowedAdminOrigins, isAllowedOrigin: isAllowedAdminOrigin }));
app.use('/api/public/documents', publicDocumentRoutes(pool));
app.get('/api/health', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok' });
});
app.get('/api/drive/oauth/callback', async (req, res) => {
  try {
    if (!consumeOAuthState(String(req.query.state || ''))) return res.status(400).send('Estado OAuth inválido o vencido.');
    const state = consumeOAuthState(String(req.query.state || ''));
    if (!state) return res.status(400).send('Estado OAuth inválido o vencido.');
    await saveDriveCallback(pool, String(req.query.code || ''), state.verifier);
    res.send('Google Drive autorizado. Ya podés cerrar esta ventana.');
  } catch (error) {
    console.error('Drive OAuth error', JSON.stringify({
      code: error.code || error.name,
      message: error.message,
      status: error.response?.status,
      oauthError: error.response?.data?.error,
      oauthDescription: error.response?.data?.error_description,
    }));
    res.status(400).send('No se pudo completar la autorización de Google Drive.');
  }
});
app.get('/api/products', async (req, res) => res.set('Cache-Control', 'no-store').json(await catalog(pool)));
app.get('/api/settings', (req, res) => res.json(legacyData.settings));
app.get('/api/siteSections', (req, res) => res.json(legacyData.siteSections));
app.post('/api/orders', (req, res, next) => {
  if (!req.get('Origin') || !isAllowedAdminOrigin(req.get('Origin'))) return res.status(403).json({ error: 'Origen de la solicitud no autorizado.' });
  next();
}, async (req, res) => {
  const body = z.object({
    customerName: z.string().trim().min(1).max(180),
    phone: z.string().trim().min(8).max(30),
    email: z.string().trim().email().max(254).optional().or(z.literal('')),
    channel: z.enum(['WhatsApp','Tienda','Telefono','Otro']).default('Tienda'),
    idempotencyKey: z.string().trim().min(1).max(100),
    notes: z.string().trim().max(2000).optional(),
    items: z.array(z.object({
      productId: z.string().min(1).max(120),
      variantLabel: z.string().max(255).optional(),
      quantity: z.number().int().min(1).max(99),
    })).min(1).max(50),
  }).parse(req.body);

  const id = randomUUID();
  const result = await transaction(pool, async (connection) => {
    const [[existing]] = await connection.execute('SELECT id FROM orders WHERE idempotency_key=?', [body.idempotencyKey]);
    if (existing) return { idempotent: existing.id };

    const [customerRows] = await connection.execute(
      'INSERT INTO customers(name,phone,email,notes) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),email=COALESCE(VALUES(email),email),notes=COALESCE(VALUES(notes),notes)',
      [body.customerName, body.phone, body.email || null, body.notes || null],
    );
    const [[customer]] = await connection.execute('SELECT id FROM customers WHERE phone=?', [body.phone]);

    const checkedItems = [];
    for (const item of body.items) {
      const [[product]] = await connection.execute(
          'SELECT id,name,category,price_crc,cost_crc,presentation FROM products WHERE id=? AND active=TRUE',
        [item.productId],
      );
      if (!product) return { error: `Producto no disponible: ${item.productId}` };

      let inventoryQuery = 'SELECT id,sku,label,quantity FROM inventory_items WHERE product_id=?';
      const inventoryParams = [item.productId];
      if (item.variantLabel) {
        inventoryQuery += ' AND label=?';
        inventoryParams.push(item.variantLabel);
      }
      inventoryQuery += ' ORDER BY id LIMIT 1';
      const [[inventory]] = await connection.execute(inventoryQuery + ' FOR UPDATE', inventoryParams);
      if (!inventory) return { error: `No existe inventario para ${product.name}.` };
      if (inventory.quantity !== null && inventory.quantity < item.quantity) {
        return { error: `Stock insuficiente para ${product.name}.` };
      }

      let unitPrice = Number(product.price_crc);
      const variants = product.presentation?.variants;
      if (Array.isArray(variants) && item.variantLabel) {
        const variant = variants.find((entry) => entry.name === item.variantLabel);
        if (variant?.priceCRC != null) unitPrice = Number(variant.priceCRC);
      }
      checkedItems.push({ ...item, inventory, name: product.name, category: product.category, unitPrice, cost: Number(product.cost_crc) });
    }

    const [promotions] = await connection.execute(
      `SELECT product_id, discount_crc, minimum_quantity, active FROM promotions
       WHERE active=TRUE AND (starts_at IS NULL OR starts_at <= UTC_TIMESTAMP())
       AND (ends_at IS NULL OR ends_at >= UTC_TIMESTAMP())`,
    );
    const totals = calculateOrderTotals(checkedItems, promotions);
    await connection.execute(
      `INSERT INTO orders(id,customer_id,customer_name,phone,channel,status,subtotal_crc,discount_crc,total_crc,idempotency_key,notes)
       VALUES (?,?,?,?,?, 'Pendiente',?,?,?, ?,?)`,
      [id, customer.id, body.customerName, body.phone, body.channel, totals.subtotalCRC, totals.discountCRC, totals.totalCRC, body.idempotencyKey, body.notes || null],
    );
    for (const item of checkedItems) {
      await connection.execute(
        'INSERT INTO order_items(order_id,product_id,inventory_item_id,name,variant_label,quantity,unit_price_crc,cost_crc) VALUES (?,?,?,?,?,?,?,?)',
        [id, item.productId, item.inventory.id, item.name, item.variantLabel || null, item.quantity, item.unitPrice, item.cost],
      );
      if (item.inventory.quantity !== null) {
        await connection.execute('UPDATE inventory_items SET quantity=quantity-? WHERE id=?', [item.quantity, item.inventory.id]);
      }
    }
    return { id };
  });

  if (result.error) return res.status(409).json({ error: result.error });
  res.status(201).json({ id: result.id, status: 'Pendiente' });
});
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof ZodError || error.status === 400) return res.status(400).json({ error: 'Revisá los datos ingresados.' });
  if (error.status === 413) return res.status(413).json({ error: 'La solicitud es demasiado grande.' });
  if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ese identificador ya existe.' });
  console.error('Error en Drop Zone API', error.code || error.name);
  res.status(500).json({ error: 'Servicio temporalmente no disponible.' });
});

export default app;
