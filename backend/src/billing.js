import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { transaction } from './db.js';
import { buildCommercialPdf } from './billing-pdf.js';

const documentKinds = z.enum(['quote', 'order_confirmation', 'commercial_receipt']);
const deliveryChannels = z.enum(['whatsapp_web']);
const storageRoot = path.resolve(process.cwd(), 'storage', 'billing');

function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function parseJson(value) { return typeof value === 'string' ? JSON.parse(value) : (value || {}); }
function redactPhone(phone) { return String(phone || '').replace(/\d(?=\d{4})/g, '*'); }
function apiOrigin() { return process.env.PUBLIC_API_ORIGIN || `http://${process.env.BIND_HOST || '127.0.0.1'}:${process.env.PORT || 3001}`; }

async function documentSnapshot(pool, orderId) {
  const [[order]] = await pool.execute('SELECT * FROM orders WHERE id=?', [orderId]);
  if (!order) return null;
  const [items] = await pool.execute('SELECT * FROM order_items WHERE order_id=? ORDER BY id', [orderId]);
  const [[customer]] = order.customer_id
    ? await pool.execute('SELECT * FROM customers WHERE id=?', [order.customer_id])
    : [[]];
  return { order, items, customer: customer || { name: order.customer_name, phone: order.phone, email: null } };
}

async function getDocument(pool, id) {
  const [[document]] = await pool.execute(
    `SELECT d.*, c.email AS customer_email, c.phone AS customer_phone
     FROM billing_documents d LEFT JOIN customers c ON c.id=d.customer_id WHERE d.id=?`, [id],
  );
  if (!document) return null;
  const [deliveries] = await pool.execute('SELECT id,channel,recipient_redacted,delivery_status,idempotency_key,requested_at,sent_at FROM billing_delivery_attempts WHERE document_id=? ORDER BY requested_at DESC', [id]);
  const [events] = await pool.execute('SELECT id,event_type,event_details,created_at FROM billing_document_events WHERE document_id=? ORDER BY created_at DESC', [id]);
  return { ...document, customerSnapshot: parseJson(document.customer_snapshot), itemsSnapshot: parseJson(document.items_snapshot), orderSnapshot: parseJson(document.order_snapshot), deliveries, events };
}

async function ensurePdf(pool, document) {
  await mkdir(storageRoot, { recursive: true });
  const storageKey = `${document.id}.pdf`;
  const filePath = path.join(storageRoot, storageKey);
  let pdf;
  try { pdf = await readFile(filePath); } catch { pdf = buildCommercialPdf(document); await writeFile(filePath, pdf, { flag: 'wx' }).catch(() => {}); }
  const checksum = hash(pdf);
  await pool.execute(
    `INSERT INTO billing_document_files(document_id,file_kind,content_type,storage_key,sha256,byte_size)
     VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE sha256=VALUES(sha256),byte_size=VALUES(byte_size)`,
    [document.id, 'pdf', 'application/pdf', storageKey, checksum, pdf.length],
  );
  return pdf;
}

async function createAccessToken(pool, documentId) {
  const token = randomBytes(32).toString('hex');
  await pool.execute(
    `INSERT INTO billing_access_tokens(id,document_id,token_hash,expires_at,max_downloads)
     VALUES (?,?,?,?,3)`, [randomUUID(), documentId, hash(token), new Date(Date.now() + 15 * 60 * 1000)],
  );
  return token;
}

export function billingRoutes(pool) {
  const router = Router();
  router.get('/documents', async (req, res) => {
    const [rows] = await pool.execute(
      `SELECT d.id,d.order_id,d.document_kind,d.document_status,d.fiscal_status,d.total_crc,d.created_at,d.issued_at,
              c.name AS customer_name FROM billing_documents d LEFT JOIN customers c ON c.id=d.customer_id
       ORDER BY d.created_at DESC LIMIT 200`,
    );
    res.json(rows);
  });
  router.get('/documents/:id', async (req, res) => {
    const document = await getDocument(pool, z.string().uuid().parse(req.params.id));
    if (!document) return res.status(404).json({ error: 'Documento no encontrado.' });
    res.json(document);
  });
  router.post('/documents', async (req, res) => {
    const body = z.object({ orderId: z.string().uuid(), documentKind: documentKinds, idempotencyKey: z.string().trim().min(8).max(180) }).parse(req.body);
    const existing = await pool.execute('SELECT id FROM billing_documents WHERE idempotency_key=?', [body.idempotencyKey]);
    if (existing[0][0]) return res.status(200).json({ id: existing[0][0].id, idempotent: true });
    const snapshot = await documentSnapshot(pool, body.orderId);
    if (!snapshot) return res.status(404).json({ error: 'Pedido no encontrado.' });
    if (body.documentKind === 'commercial_receipt') {
      const [[payment]] = await pool.execute("SELECT id FROM payments WHERE order_id=? AND status='Confirmado' ORDER BY id DESC LIMIT 1", [body.orderId]);
      if (!payment) return res.status(409).json({ error: 'El recibo comercial requiere un pago confirmado.' });
    }
    const id = randomUUID();
    await transaction(pool, async (connection) => {
      await connection.execute(
        `INSERT INTO billing_documents(id,order_id,customer_id,document_kind,fiscal_status,document_status,subtotal_crc,discount_crc,tax_crc,total_crc,emitter_snapshot,customer_snapshot,items_snapshot,order_snapshot,idempotency_key,created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, body.orderId, snapshot.customer.id || null, body.documentKind, 'not_applicable', 'draft', snapshot.order.subtotal_crc, snapshot.order.discount_crc, 0, snapshot.order.total_crc, JSON.stringify({ name: 'Drop Zone CR', mode: process.env.BILLING_MODE || 'commercial_only' }), JSON.stringify(snapshot.customer), JSON.stringify(snapshot.items), JSON.stringify(snapshot.order), body.idempotencyKey, req.admin.id],
      );
      await connection.execute('INSERT INTO billing_document_events(document_id,actor_id,event_type,event_details) VALUES (?,?,?,?)', [id, req.admin.id, 'created', JSON.stringify({ documentKind: body.documentKind })]);
    });
    res.status(201).json({ id, documentStatus: 'draft' });
  });
  router.post('/documents/:id/issue', async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const document = await getDocument(pool, id);
    if (!document) return res.status(404).json({ error: 'Documento no encontrado.' });
    if (document.document_kind === 'commercial_receipt') {
      const [[payment]] = await pool.execute("SELECT id FROM payments WHERE order_id=? AND status='Confirmado' LIMIT 1", [document.order_id]);
      if (!payment) return res.status(409).json({ error: 'El recibo requiere pago confirmado.' });
    }
    await pool.execute("UPDATE billing_documents SET document_status='issued',issued_at=COALESCE(issued_at,UTC_TIMESTAMP(3)),updated_at=UTC_TIMESTAMP(3) WHERE id=? AND document_status IN ('draft','issued')", [id]);
    await pool.execute('INSERT INTO billing_document_events(document_id,actor_id,event_type) VALUES (?,?,?)', [id, req.admin.id, 'issued']);
    res.json({ id, documentStatus: 'issued' });
  });
  router.get('/documents/:id/download', async (req, res) => {
    const document = await getDocument(pool, z.string().uuid().parse(req.params.id));
    if (!document) return res.status(404).json({ error: 'Documento no encontrado.' });
    if (document.document_status !== 'issued') return res.status(409).json({ error: 'El documento debe emitirse antes de descargarlo.' });
    const pdf = await ensurePdf(pool, document);
    res.set('Content-Disposition', `inline; filename="drop-zone-${document.id}.pdf"`).type('application/pdf').send(pdf);
  });
  router.post('/documents/:id/deliver', async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = z.object({ channel: deliveryChannels, idempotencyKey: z.string().trim().min(8).max(180) }).parse(req.body);
    const document = await getDocument(pool, id);
    if (!document) return res.status(404).json({ error: 'Documento no encontrado.' });
    if (document.document_status !== 'issued') return res.status(409).json({ error: 'Emite el documento antes de solicitar su entrega.' });
    const existing = await pool.execute('SELECT id,provider_message_id,delivery_status FROM billing_delivery_attempts WHERE idempotency_key=?', [body.idempotencyKey]);
    if (existing[0][0]) return res.json(existing[0][0]);
    const token = await createAccessToken(pool, id);
    const phone = document.orderSnapshot.phone || document.customerSnapshot.phone;
    const message = `Hola ${document.customerSnapshot.name || ''}, tu documento comercial de Drop Zone CR para el pedido ${document.order_id} ya está disponible. Descarga privada: ${apiOrigin()}/api/public/documents/${token}`;
    const link = `https://wa.me/${String(phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
    const deliveryId = randomUUID();
    await pool.execute(
      `INSERT INTO billing_delivery_attempts(id,document_id,channel,recipient_redacted,delivery_status,idempotency_key,requested_by,sent_at)
       VALUES (?,?,?,?,?,?,?,UTC_TIMESTAMP(3))`, [deliveryId, id, body.channel, redactPhone(phone), 'manual_pending', body.idempotencyKey, req.admin.id],
    );
    await pool.execute('INSERT INTO billing_document_events(document_id,actor_id,event_type,event_details) VALUES (?,?,?,?)', [id, req.admin.id, 'delivery_requested', JSON.stringify({ deliveryId, channel: body.channel })]);
    res.status(201).json({ id: deliveryId, status: 'manual_pending', whatsappUrl: link });
  });
  return router;
}

export function publicDocumentRoutes(pool) {
  const router = Router();
  router.get('/:token', async (req, res) => {
    const token = z.string().regex(/^[a-f0-9]{64}$/).parse(req.params.token);
    const [[access]] = await pool.execute(
      `SELECT t.id,t.document_id,t.max_downloads,t.download_count,d.document_status
       FROM billing_access_tokens t JOIN billing_documents d ON d.id=t.document_id
       WHERE t.token_hash=? AND t.expires_at>UTC_TIMESTAMP(3) AND t.revoked_at IS NULL`, [hash(token)],
    );
    if (!access || access.document_status !== 'issued' || access.download_count >= access.max_downloads) return res.status(404).json({ error: 'Enlace no disponible.' });
    const document = await getDocument(pool, access.document_id);
    const pdf = await ensurePdf(pool, document);
    await pool.execute('UPDATE billing_access_tokens SET download_count=download_count+1 WHERE id=?', [access.id]);
    res.set('Content-Disposition', `inline; filename="drop-zone-${document.id}.pdf"`).type('application/pdf').send(pdf);
  });
  return router;
}
