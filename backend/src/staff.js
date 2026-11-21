import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { hashPassword } from './password.js';
import { transaction } from './db.js';
import { policies, retrieve, answer, funnel, geminiStatus } from './knowledge.js';
import { driveStatus, driveAuthorizationUrl, issueOAuthState, syncDriveFolder } from './drive.js';

export function requireAdmin(req, res, next) {
  if (req.admin.role === 'admin') return next();
  res.status(403).json({ error: 'Se requiere una cuenta administradora.' });
}
const stages = {
  Consulta: ['Cotización', 'Perdida'],
  Cotización: ['Venta confirmada', 'Perdida'],
};

export function staffRoutes(pool) {
  const r = Router();
  r.get('/desk', async (req, res) => {
    const admin = req.admin.role === 'admin';
    const [leads] = await pool.execute(
      `SELECT l.id,p.name,l.channel,l.stage,l.updated_at FROM sales_inquiries l
      JOIN products p ON p.id=l.product_id WHERE (? OR l.owner_id=?) ORDER BY l.updated_at DESC,l.id DESC LIMIT 150`,
      [admin, req.admin.id],
    );
    const [products] = await pool.execute(
      'SELECT id,name FROM products WHERE active=1 ORDER BY name',
    );
    const [summary] = admin ? await funnel(pool) : [[]];
    const [[inventory]] = await pool.execute(`SELECT COUNT(*) AS skus,
      COALESCE(SUM(i.quantity IS NULL),0) AS pending, COALESCE(SUM(i.quantity=0),0) AS soldOut
      FROM inventory_items i JOIN products p ON p.id=i.product_id WHERE p.active=1`);
    res.json({ leads, products, policies, summary, inventory });
  });
  r.post('/inquiries', async (req, res) => {
    const { product, channel } = z
      .object({
        product: z.string().min(1).max(120),
        channel: z.enum(['WhatsApp', 'Instagram', 'Tienda']),
      })
      .parse(req.body);
    const [result] = await pool.execute(
      `INSERT INTO sales_inquiries(owner_id,product_id,channel,created_at,updated_at)
      SELECT ?,id,?,UTC_TIMESTAMP(),UTC_TIMESTAMP() FROM products WHERE id=? AND active=1`,
      [req.admin.id, channel, product],
    );
    if (!result.affectedRows)
      return res.status(400).json({ error: 'El producto no está disponible.' });
    res.status(201).json({ id: result.insertId });
  });
  r.patch('/inquiries/:id', async (req, res) => {
    const { previous, stage } = z
      .object({
        previous: z.enum(['Consulta', 'Cotización']),
        stage: z.enum(['Cotización', 'Venta confirmada', 'Perdida']),
      })
      .parse(req.body);
    if (!stages[previous].includes(stage))
      return res.status(400).json({ error: 'Transición inválida.' });
    const [result] = await pool.execute(
      `UPDATE sales_inquiries SET stage=?,updated_at=UTC_TIMESTAMP()
      WHERE id=? AND stage=? AND (owner_id=? OR ?)`,
      [
        stage,
        req.params.id,
        previous,
        req.admin.id,
        req.admin.role === 'admin',
      ],
    );
    if (!result.affectedRows)
      return res
        .status(409)
        .json({ error: 'Oportunidad no disponible en esa etapa.' });
    res.status(204).end();
  });
  r.post(
    '/chat',
    rateLimit({
      windowMs: 60000,
      limit: 12,
      keyGenerator: (req) => String(req.admin.id),
      message: { error: 'Esperá un minuto antes de volver a consultar.' },
    }),
    async (req, res) => {
      const question = z
        .string()
        .trim()
        .min(3)
        .max(800)
        .parse(req.body?.question);
      const sources = await retrieve(pool, req.admin, question);
      let reply;
      try {
        reply = await answer(sources, question);
        await pool.execute('INSERT INTO ai_usage (admin_id,model,input_tokens,output_tokens,success,created_at) VALUES (?,?,NULL,NULL,1,UTC_TIMESTAMP())', [req.admin.id, geminiStatus().model]);
      } catch {
        reply =
          'El modelo está temporalmente fuera de servicio. Podés consultar las fuentes recuperadas.';
      }
      res.json({ reply, sources });
    },
  );
  r.use(requireAdmin);
  r.get('/drive/status', async (req, res) => res.json(driveStatus()));
  r.get('/drive/oauth-url', async (req, res) => {
    const state = issueOAuthState();
    res.json({ url: driveAuthorizationUrl(state) });
  });
  r.post('/drive/sync', async (req, res) => res.json(await syncDriveFolder(pool, req.admin.id)));
  r.get('/articles', async (req, res) => {
    const [rows] = await pool.execute(
      'SELECT id,title,audience,published FROM knowledge_articles ORDER BY id DESC',
    );
    res.json(rows);
  });
  r.post('/articles', async (req, res) => {
    const { title, body, audience } = z
      .object({
        title: z.string().trim().min(3).max(160),
        body: z.string().trim().min(10).max(1600),
        audience: z.enum(['team', 'admin']),
      })
      .parse(req.body);
    await pool.execute(
      'INSERT INTO knowledge_articles(title,body,audience,author_id,created_at) VALUES (?,?,?,?,UTC_TIMESTAMP())',
      [title, body, audience, req.admin.id],
    );
    res.status(204).end();
  });
  r.patch('/articles/:id', async (req, res) => {
    const [result] = await pool.execute(
      'UPDATE knowledge_articles SET published=0 WHERE id=?',
      [req.params.id],
    );
    if (!result.affectedRows)
      return res.status(404).json({ error: 'Fuente no encontrada.' });
    res.status(204).end();
  });
  r.get('/access-events', async (req, res) => {
    const [rows] =
      await pool.execute(`SELECT e.id,e.action,e.occurred_at,a.email AS actor,b.email AS subject
      FROM access_events e JOIN admins a ON a.id=e.actor_id JOIN admins b ON b.id=e.subject_id ORDER BY e.id DESC LIMIT 50`);
    res.json(rows);
  });
  r.get('/users', async (req, res) => {
    const [rows] = await pool.execute(
      'SELECT a.id,a.email,x.role,x.enabled FROM admins a JOIN staff_access x ON x.account_id=a.id ORDER BY a.email',
    );
    res.json(rows);
  });
  r.post('/users', async (req, res) => {
    const { email, password, role } = z
      .object({
        email: z.string().trim().toLowerCase().email().max(254),
        password: z.string().min(14).max(128),
        role: z.enum(['admin', 'worker']),
      })
      .parse(req.body);
    const hash = await hashPassword(password);
    await transaction(pool, async (c) => {
      const [account] = await c.execute(
        'INSERT INTO admins(email,password_hash) VALUES (?,?)',
        [email, hash],
      );
      await c.execute(
        'INSERT INTO staff_access(account_id,role) VALUES (?,?)',
        [account.insertId, role],
      );
      await c.execute(
        "INSERT INTO access_events(actor_id,subject_id,action,occurred_at) VALUES (?,?,'Alta',UTC_TIMESTAMP())",
        [req.admin.id, account.insertId],
      );
    });
    res.status(204).end();
  });
  r.patch('/users/:id', async (req, res) => {
    const enabled = z.boolean().parse(req.body?.enabled);
    const updated = await transaction(pool, async (c) => {
      const [result] = await c.execute(
        "UPDATE staff_access SET enabled=? WHERE account_id=? AND role='worker'",
        [enabled, req.params.id],
      );
      if (result.affectedRows && !enabled)
        await c.execute('DELETE FROM admin_sessions WHERE admin_id=?', [
          req.params.id,
        ]);
      if (result.affectedRows)
        await c.execute(
          'INSERT INTO access_events(actor_id,subject_id,action,occurred_at) VALUES (?,?,?,UTC_TIMESTAMP())',
          [
            req.admin.id,
            req.params.id,
            enabled ? 'Activación' : 'Desactivación',
          ],
        );
      return result.affectedRows;
    });
    if (!updated)
      return res
        .status(404)
        .json({ error: 'Cuenta de trabajador no encontrada.' });
    res.status(204).end();
  });
  return r;
}
