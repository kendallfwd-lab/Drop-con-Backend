import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import { staffRoutes, requireAdmin } from './staff.js';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { catalog } from './catalog.js';
import { transaction } from './db.js';
import { hashPassword, verifyPassword } from './password.js';
import { billingRoutes } from './billing.js';
import { operationsRoutes } from './operations.js';
import { createTotpSecret, decryptSecret, encryptSecret, requestIp, validTotp } from './auth-security.js';
import { sendPasswordResetCodeEmail, sendPasswordResetEmail } from './mailer.js';

const sessionAge = 8 * 60 * 60 * 1000;
const cookieName = 'dz_admin';
const csrfCookieName = 'dz_csrf';
const mfaCookieName = 'dz_mfa';
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

function recoverySettings() {
  return {
    adminEmail: process.env.ADMIN_EMAIL?.trim().toLowerCase(),
    recoveryEmail: process.env.ADMIN_RECOVERY_EMAIL?.trim().toLowerCase(),
  };
}

function recoveryRecipient(adminEmail) {
  return recoverySettings().recoveryEmail || adminEmail;
}

function readToken(req) {
  return req.headers.cookie?.match(/(?:^|;\s*)dz_admin=([a-f0-9]{64})(?:;|$)/)?.[1];
}

function readCsrfToken(req) {
  return req.headers.cookie?.match(/(?:^|;\s*)dz_csrf=([a-f0-9]{64})(?:;|$)/)?.[1];
}

function readCookie(req, name, pattern = '[a-f0-9-]{36,64}') {
  return req.headers.cookie?.match(new RegExp(`(?:^|;\\s*)${name}=(${pattern})(?:;|$)`))?.[1];
}
function webauthnConfig(origin) {
  const expectedOrigin = process.env.WEBAUTHN_ORIGIN || origin;
  const hostname = new URL(expectedOrigin).hostname;
  return { expectedOrigin, rpID: process.env.WEBAUTHN_RP_ID || hostname, rpName: process.env.WEBAUTHN_RP_NAME || 'DROP ZONE CR' };
}

export function adminRoutes(pool, { production, origin, allowedOrigins = new Set([origin]), isAllowedOrigin = (requestOrigin) => allowedOrigins.has(requestOrigin) }) {
  const router = Router();
  const cookie = { httpOnly: true, secure: production, sameSite: 'strict', path: '/api/admin' };
  const csrfCookie = { httpOnly: false, secure: production, sameSite: 'strict', path: '/api/admin' };
  const mfaCookie = { httpOnly: true, secure: production, sameSite: 'strict', path: '/api/admin', maxAge: 5 * 60 * 1000 };
  const dummyHash = hashPassword(randomBytes(24).toString('hex'));
  const issueSession = async (req, res, admin, familyId = randomUUID()) => {
    const token = randomBytes(32).toString('hex');
    await transaction(pool, async (connection) => {
      await connection.execute('DELETE FROM admin_sessions WHERE expires_at <= UTC_TIMESTAMP(3)');
      await connection.execute('INSERT INTO admin_sessions (token_hash, admin_id, family_id, expires_at) VALUES (?, ?, ?, ?)', [tokenHash(token), admin.id, familyId, new Date(Date.now() + sessionAge)]);
    });
    res.cookie(cookieName, token, { ...cookie, maxAge: sessionAge }).json({ email: admin.email, role: admin.role });
  };
  const createChallenge = async (adminId, kind, challenge) => {
    const id = randomUUID();
    await pool.execute('DELETE FROM admin_login_challenges WHERE expires_at <= UTC_TIMESTAMP(3)');
    await pool.execute('INSERT INTO admin_login_challenges (id,admin_id,kind,challenge,expires_at) VALUES (?,?,?,?,?)', [id, adminId, kind, challenge, new Date(Date.now() + 5 * 60 * 1000)]);
    return id;
  };
  const consumeChallenge = async (id, kind) => {
    const [[row]] = await pool.execute("SELECT id,admin_id,challenge FROM admin_login_challenges WHERE id=? AND kind=? AND consumed_at IS NULL AND expires_at>UTC_TIMESTAMP(3)", [id, kind]);
    if (!row) return null;
    await pool.execute('UPDATE admin_login_challenges SET consumed_at=UTC_TIMESTAMP(3) WHERE id=? AND consumed_at IS NULL', [id]);
    return row;
  };

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !isAllowedOrigin(req.get('Origin'))) {
      return res.status(403).json({ error: 'Origen de la solicitud no autorizado.' });
    }
    next();
  });

  router.get('/csrf', (req, res) => {
    const token = readCsrfToken(req) || randomBytes(32).toString('hex');
    res.cookie(csrfCookieName, token, { ...csrfCookie, maxAge: sessionAge });
    res.json({ csrfToken: token });
  });

  router.use((req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const cookieToken = readCsrfToken(req);
    const headerToken = req.get('X-CSRF-Token');
    if (!cookieToken || !headerToken || cookieToken.length !== headerToken.length || !timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
      return res.status(403).json({ error: 'Token CSRF invÃ¡lido o ausente.' });
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

    const [[mfa]] = await pool.execute('SELECT enabled FROM admin_mfa_totp WHERE admin_id=?', [admin.id]);
    if (mfa?.enabled) {
      const challengeId = await createChallenge(admin.id, 'mfa', randomBytes(24).toString('hex'));
      return res.cookie(mfaCookieName, challengeId, mfaCookie).status(202).json({ mfaRequired: true, message: 'Ingresá el código de tu autenticador.' });
    }
    await issueSession(req, res, admin);
  });

  router.post('/login/mfa', rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-8', legacyHeaders: false }), async (req, res) => {
    const code = z.object({ code: z.string().trim().regex(/^\d{6}$/) }).parse(req.body).code;
    const challenge = await consumeChallenge(readCookie(req, mfaCookieName), 'mfa');
    if (!challenge) return res.status(401).json({ error: 'El desafío de acceso venció. Iniciá sesión otra vez.' });
    const [[record]] = await pool.execute('SELECT encrypted_secret FROM admin_mfa_totp WHERE admin_id=? AND enabled=1', [challenge.admin_id]);
    if (!record || !validTotp(decryptSecret(record.encrypted_secret), code)) return res.status(401).json({ error: 'Código de verificación incorrecto.' });
    const [[admin]] = await pool.execute('SELECT a.id,a.email,x.role FROM admins a JOIN staff_access x ON x.account_id=a.id AND x.enabled=1 WHERE a.id=?', [challenge.admin_id]);
    if (!admin) return res.status(401).json({ error: 'Cuenta no disponible.' });
    res.clearCookie(mfaCookieName, mfaCookie);
    await issueSession(req, res, admin);
  });

  router.post('/password-reset/request', rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false }), async (req, res) => {
    const email = z.object({ email: z.string().trim().toLowerCase().email().max(254) }).parse(req.body).email;
    const [[admin]] = await pool.execute('SELECT a.id FROM admins a JOIN staff_access x ON x.account_id=a.id AND x.enabled=1 WHERE a.email=?', [email]);
    let debugResetUrl;
    if (admin) {
      const token = randomBytes(32).toString('base64url');
      const resetUrl = `${origin.replace(/\/$/, '')}/admin?reset=${encodeURIComponent(token)}`;
      await pool.execute('DELETE FROM password_reset_tokens WHERE admin_id=? OR expires_at<=UTC_TIMESTAMP(3)', [admin.id]);
      await pool.execute('INSERT INTO password_reset_tokens (token_hash,admin_id,expires_at,requested_ip) VALUES (?,?,?,?)', [tokenHash(token), admin.id, new Date(Date.now() + 30 * 60 * 1000), requestIp(req)]);
      try {
        await sendPasswordResetEmail({ to: email, resetUrl });
        if (!production) debugResetUrl = resetUrl;
      } catch (error) {
        await pool.execute('DELETE FROM password_reset_tokens WHERE token_hash=?', [tokenHash(token)]);
        if (production) return res.status(503).json({ error: 'No pudimos enviar el correo de recuperación. Intentá más tarde.' });
        throw error;
      }
    }
    res.status(202).json({ message: 'Si la cuenta existe, enviamos instrucciones para restablecer la contraseña.', ...(debugResetUrl ? { debugResetUrl } : {}) });
  });

  router.post('/password-reset/confirm', rateLimit({ windowMs: 60 * 60 * 1000, limit: 8, standardHeaders: 'draft-8', legacyHeaders: false }), async (req, res) => {
    const { token, password } = z.object({ token: z.string().min(32).max(256), password: z.string().min(15).max(128) }).parse(req.body);
    const result = await transaction(pool, async (connection) => {
      const [[reset]] = await connection.execute('SELECT admin_id FROM password_reset_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>UTC_TIMESTAMP(3) FOR UPDATE', [tokenHash(token)]);
      if (!reset) return false;
      await connection.execute('UPDATE admins SET password_hash=? WHERE id=?', [await hashPassword(password), reset.admin_id]);
      await connection.execute('UPDATE password_reset_tokens SET used_at=UTC_TIMESTAMP(3) WHERE token_hash=?', [tokenHash(token)]);
      await connection.execute('UPDATE admin_sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE admin_id=? AND revoked_at IS NULL', [reset.admin_id]);
      return true;
    });
    if (!result) return res.status(400).json({ error: 'El enlace no es válido o ya venció.' });
    res.status(204).end();
  });

  router.post('/password-reset/email-code/request', rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false }), async (req, res) => {
    const email = z.object({ email: z.string().trim().toLowerCase().email().max(254) }).parse(req.body).email;
    const { adminEmail, recoveryEmail } = recoverySettings();
    const [[admin]] = await pool.execute(
      'SELECT a.id, a.email FROM admins a JOIN staff_access x ON x.account_id=a.id AND x.enabled=1 WHERE a.email=? OR (a.email=? AND ?=?) LIMIT 1',
      [email, adminEmail || '', email, recoveryEmail || ''],
    );
    if (admin) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      await pool.execute('DELETE FROM password_reset_codes WHERE admin_id=? OR expires_at<=UTC_TIMESTAMP(3)', [admin.id]);
      await pool.execute('INSERT INTO password_reset_codes (admin_id,code_hash,expires_at,requested_ip) VALUES (?,?,?,?)', [admin.id, tokenHash(code), new Date(Date.now() + 10 * 60 * 1000), requestIp(req)]);
      try {
        await sendPasswordResetCodeEmail({ to: recoveryRecipient(admin.email), code });
      } catch (error) {
        await pool.execute('DELETE FROM password_reset_codes WHERE admin_id=?', [admin.id]);
        if (production) return res.status(503).json({ error: 'No pudimos enviar el correo de recuperacion. Intenta mas tarde.' });
        throw error;
      }
    }
    res.status(202).json({ message: 'Si la cuenta existe, enviamos un codigo de verificacion al correo.' });
  });

  router.post('/password-reset/email-code/confirm', rateLimit({ windowMs: 60 * 60 * 1000, limit: 8, standardHeaders: 'draft-8', legacyHeaders: false }), async (req, res) => {
    const { email, code, password } = z.object({ email: z.string().trim().toLowerCase().email().max(254), code: z.string().trim().regex(/^\d{6}$/), password: z.string().min(15).max(128) }).parse(req.body);
    const { adminEmail, recoveryEmail } = recoverySettings();
    const result = await transaction(pool, async (connection) => {
      const [[reset]] = await connection.execute(
        `SELECT r.admin_id, r.attempts FROM password_reset_codes r JOIN admins a ON a.id=r.admin_id
         JOIN staff_access x ON x.account_id=a.id AND x.enabled=1
         WHERE (a.email=? OR (a.email=? AND ?=?)) AND r.used_at IS NULL AND r.expires_at>UTC_TIMESTAMP(3) FOR UPDATE`,
        [email, adminEmail || '', email, recoveryEmail || ''],
      );
      if (!reset) return false;
      const [[match]] = await connection.execute('SELECT admin_id FROM password_reset_codes WHERE admin_id=? AND code_hash=? AND used_at IS NULL AND expires_at>UTC_TIMESTAMP(3)', [reset.admin_id, tokenHash(code)]);
      if (!match) {
        const nextAttempts = reset.attempts + 1;
        await connection.execute('UPDATE password_reset_codes SET attempts=?, used_at=IF(? >= 5, UTC_TIMESTAMP(3), used_at) WHERE admin_id=?', [nextAttempts, nextAttempts, reset.admin_id]);
        return false;
      }
      await connection.execute('UPDATE admins SET password_hash=? WHERE id=?', [await hashPassword(password), reset.admin_id]);
      await connection.execute('UPDATE password_reset_codes SET used_at=UTC_TIMESTAMP(3) WHERE admin_id=?', [reset.admin_id]);
      await connection.execute('UPDATE admin_sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE admin_id=? AND revoked_at IS NULL', [reset.admin_id]);
      return true;
    });
    if (!result) return res.status(400).json({ error: 'El codigo no es valido, ya vencio o supero los intentos permitidos.' });
    res.status(204).end();
  });

  router.post('/password-reset/totp', rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false }), async (req, res) => {
    const { email, code, password } = z.object({ email: z.string().trim().toLowerCase().email().max(254), code: z.string().trim().regex(/^\d{6}$/), password: z.string().min(15).max(128) }).parse(req.body);
    const [[admin]] = await pool.execute('SELECT a.id FROM admins a JOIN staff_access x ON x.account_id=a.id AND x.enabled=1 WHERE a.email=?', [email]);
    const [[totp]] = admin ? await pool.execute('SELECT encrypted_secret FROM admin_mfa_totp WHERE admin_id=? AND enabled=1', [admin.id]) : [[]];
    if (!admin || !totp || !validTotp(decryptSecret(totp.encrypted_secret), code)) return res.status(401).json({ error: 'No fue posible verificar el autenticador.' });
    await transaction(pool, async (connection) => {
      await connection.execute('UPDATE admins SET password_hash=? WHERE id=?', [await hashPassword(password), admin.id]);
      await connection.execute('UPDATE admin_sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE admin_id=? AND revoked_at IS NULL', [admin.id]);
    });
    res.status(204).end();
  });

  router.post('/login/passkey/options', rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-8', legacyHeaders: false }), async (req, res) => {
    const email = z.object({ email: z.string().trim().toLowerCase().email().max(254) }).parse(req.body).email;
    const [[admin]] = await pool.execute('SELECT a.id FROM admins a JOIN staff_access x ON x.account_id=a.id AND x.enabled=1 WHERE a.email=?', [email]);
    if (!admin) return res.status(404).json({ error: 'No hay una passkey disponible para esta cuenta.' });
    const [keys] = await pool.execute('SELECT credential_id,transports FROM admin_passkeys WHERE admin_id=?', [admin.id]);
    if (!keys.length) return res.status(404).json({ error: 'No hay una passkey disponible para esta cuenta.' });
    const options = await generateAuthenticationOptions({ ...webauthnConfig(origin), allowCredentials: keys.map((key) => ({ id: key.credential_id, transports: key.transports || undefined })), userVerification: 'required' });
    const challengeId = await createChallenge(admin.id, 'passkey-login', options.challenge);
    res.cookie(mfaCookieName, challengeId, mfaCookie).json({ options });
  });

  router.post('/login/passkey/verify', async (req, res) => {
    const response = z.object({ response: z.any() }).parse(req.body).response;
    const challenge = await consumeChallenge(readCookie(req, mfaCookieName), 'passkey-login');
    if (!challenge) return res.status(401).json({ error: 'El desafío de passkey venció. Intentá otra vez.' });
    const credentialId = String(response.id || '');
    const [[passkey]] = await pool.execute('SELECT id,credential_id,public_key,counter,transports FROM admin_passkeys WHERE admin_id=? AND credential_id=?', [challenge.admin_id, credentialId]);
    if (!passkey) return res.status(401).json({ error: 'Passkey no reconocida.' });
    const verification = await verifyAuthenticationResponse({ response, expectedChallenge: challenge.challenge, ...webauthnConfig(origin), credential: { id: passkey.credential_id, publicKey: new Uint8Array(passkey.public_key), counter: Number(passkey.counter), transports: passkey.transports || undefined }, requireUserVerification: true });
    if (!verification.verified) return res.status(401).json({ error: 'No fue posible verificar la passkey.' });
    await pool.execute('UPDATE admin_passkeys SET counter=?,last_used_at=UTC_TIMESTAMP(3) WHERE id=?', [verification.authenticationInfo.newCounter, passkey.id]);
    const [[admin]] = await pool.execute('SELECT a.id,a.email,x.role FROM admins a JOIN staff_access x ON x.account_id=a.id AND x.enabled=1 WHERE a.id=?', [challenge.admin_id]);
    if (!admin) return res.status(401).json({ error: 'Cuenta no disponible.' });
    res.clearCookie(mfaCookieName, mfaCookie); await issueSession(req, res, admin);
  });

  router.use(async (req, res, next) => {
    const token = readToken(req);
    if (token) {
      const [[admin]] = await pool.execute(
        `SELECT a.id, a.email, x.role FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
         JOIN staff_access x ON x.account_id=a.id AND x.enabled=1 WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(3) AND s.revoked_at IS NULL`,
        [tokenHash(token)],
      );
      if (admin) {
        req.admin = admin;
        return next();
      }
      const [[reused]] = await pool.execute('SELECT family_id,replaced_by_hash FROM admin_sessions WHERE token_hash=? AND revoked_at IS NOT NULL', [tokenHash(token)]);
      if (reused?.family_id && reused.replaced_by_hash) {
        await pool.execute('UPDATE admin_sessions SET revoked_at=COALESCE(revoked_at,UTC_TIMESTAMP(3)) WHERE family_id=?', [reused.family_id]);
      }
    }
    res.status(401).json({ error: 'Iniciá sesión para continuar.' });
  });

  router.get('/session', (req, res) => res.json({ email: req.admin.email, role: req.admin.role }));
  router.post('/logout', async (req, res) => {
    await pool.execute('UPDATE admin_sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE token_hash = ?', [tokenHash(readToken(req))]);
    res.clearCookie(cookieName, cookie).status(204).end();
  });

  router.post('/session/rotate', async (req, res) => {
    const previous = readToken(req); const next = randomBytes(32).toString('hex');
    const rotated = await transaction(pool, async (connection) => {
      const [[session]] = await connection.execute('SELECT family_id FROM admin_sessions WHERE token_hash=? AND admin_id=? AND revoked_at IS NULL AND expires_at>UTC_TIMESTAMP(3) FOR UPDATE', [tokenHash(previous), req.admin.id]);
      if (!session) return false;
      const familyId = session.family_id || randomUUID();
      await connection.execute('INSERT INTO admin_sessions (token_hash,admin_id,family_id,expires_at) VALUES (?,?,?,?)', [tokenHash(next), req.admin.id, familyId, new Date(Date.now() + sessionAge)]);
      await connection.execute('UPDATE admin_sessions SET revoked_at=UTC_TIMESTAMP(3),replaced_by_hash=? WHERE token_hash=?', [tokenHash(next), tokenHash(previous)]);
      return true;
    });
    if (!rotated) return res.status(401).json({ error: 'La sesión ya no es válida.' });
    res.cookie(cookieName, next, { ...cookie, maxAge: sessionAge }).status(204).end();
  });

  router.get('/security', async (req, res) => {
    const [[totp]] = await pool.execute('SELECT enabled,verified_at FROM admin_mfa_totp WHERE admin_id=?', [req.admin.id]);
    const [passkeys] = await pool.execute('SELECT id,label,created_at,last_used_at FROM admin_passkeys WHERE admin_id=? ORDER BY id DESC', [req.admin.id]);
    res.json({ totp: { enabled: Boolean(totp?.enabled), verifiedAt: totp?.verified_at || null }, passkeys });
  });

  router.post('/security/totp/enroll', async (req, res) => {
    const secret = createTotpSecret();
    await pool.execute(`INSERT INTO admin_mfa_totp (admin_id,encrypted_secret,enabled,updated_at) VALUES (?,?,FALSE,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE encrypted_secret=VALUES(encrypted_secret),enabled=FALSE,verified_at=NULL,updated_at=UTC_TIMESTAMP(3)`, [req.admin.id, encryptSecret(secret)]);
    const issuer = encodeURIComponent('DROP ZONE CR'); const account = encodeURIComponent(req.admin.email);
    res.json({ secret, otpauthUrl: `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30` });
  });

  router.post('/security/totp/verify', async (req, res) => {
    const code = z.object({ code: z.string().trim().regex(/^\d{6}$/) }).parse(req.body).code;
    const [[record]] = await pool.execute('SELECT encrypted_secret FROM admin_mfa_totp WHERE admin_id=?', [req.admin.id]);
    if (!record || !validTotp(decryptSecret(record.encrypted_secret), code)) return res.status(400).json({ error: 'Código de verificación incorrecto.' });
    await pool.execute('UPDATE admin_mfa_totp SET enabled=TRUE,verified_at=UTC_TIMESTAMP(3),updated_at=UTC_TIMESTAMP(3) WHERE admin_id=?', [req.admin.id]);
    res.status(204).end();
  });

  router.delete('/security/totp', async (req, res) => {
    await pool.execute('DELETE FROM admin_mfa_totp WHERE admin_id=?', [req.admin.id]); res.status(204).end();
  });

  router.post('/security/passkeys/options', async (req, res) => {
    const [keys] = await pool.execute('SELECT credential_id,transports FROM admin_passkeys WHERE admin_id=?', [req.admin.id]);
    const options = await generateRegistrationOptions({ ...webauthnConfig(origin), userName: req.admin.email, userID: new TextEncoder().encode(String(req.admin.id)), userDisplayName: req.admin.email, attestationType: 'none', authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' }, excludeCredentials: keys.map((key) => ({ id: key.credential_id, transports: key.transports || undefined })) });
    const id = await createChallenge(req.admin.id, 'passkey-register', options.challenge);
    res.json({ challengeId: id, options });
  });

  router.post('/security/passkeys/verify', async (req, res) => {
    const { challengeId, response, label } = z.object({ challengeId: z.string().uuid(), response: z.any(), label: z.string().trim().min(1).max(120).default('Passkey') }).parse(req.body);
    const challenge = await consumeChallenge(challengeId, 'passkey-register');
    if (!challenge || challenge.admin_id !== req.admin.id) return res.status(400).json({ error: 'El registro de passkey venció.' });
    const verification = await verifyRegistrationResponse({ response, expectedChallenge: challenge.challenge, ...webauthnConfig(origin), requireUserVerification: true });
    if (!verification.verified || !verification.registrationInfo) return res.status(400).json({ error: 'No fue posible verificar la passkey.' });
    const credential = verification.registrationInfo.credential;
    await pool.execute('INSERT INTO admin_passkeys (admin_id,credential_id,public_key,counter,transports,device_type,backed_up,label) VALUES (?,?,?,?,?,?,?,?)', [req.admin.id, credential.id, Buffer.from(credential.publicKey), credential.counter, JSON.stringify(credential.transports || []), verification.registrationInfo.credentialDeviceType, verification.registrationInfo.credentialBackedUp, label]);
    res.status(201).json({ id: credential.id, label });
  });

  router.delete('/security/passkeys/:id', async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await pool.execute('DELETE FROM admin_passkeys WHERE id=? AND admin_id=?', [id, req.admin.id]); res.status(204).end();
  });

  router.use('/staff', staffRoutes(pool));
  router.use(requireAdmin);
  router.use('/billing', billingRoutes(pool));
  router.use('/operations', operationsRoutes(pool));

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
       COALESCE((SELECT SUM(p.amount_crc) FROM payments p WHERE p.order_id=o.id AND p.status='Confirmado'),0) AS paid_crc,
       COALESCE((SELECT p.status FROM payments p WHERE p.order_id=o.id ORDER BY p.created_at DESC LIMIT 1),'Pendiente') AS payment_status,
       COALESCE((SELECT s.status FROM order_shipping s WHERE s.order_id=o.id),'Pendiente') AS shipping_status,
       COALESCE(SUM(i.quantity * i.unit_price_crc),0) AS itemSubtotal
       FROM orders o LEFT JOIN order_items i ON i.order_id=o.id
       GROUP BY o.id ORDER BY o.created_at DESC`,
    );
    res.json(rows);
  });

  router.get('/orders/:id', async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const [[order]] = await pool.execute(`SELECT o.*, s.status AS shipping_status, s.carrier,
      s.tracking_number, s.delivery_notes, a.email AS assigned_email
      FROM orders o LEFT JOIN order_shipping s ON s.order_id=o.id
      LEFT JOIN admins a ON a.id=s.updated_by WHERE o.id=?`, [id]);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado.' });
    const [items] = await pool.execute('SELECT * FROM order_items WHERE order_id=?', [id]);
    const [payments] = await pool.execute('SELECT id,amount_crc,method,status,reference,paid_at,created_at FROM payments WHERE order_id=? ORDER BY created_at DESC', [id]);
    const [documents] = await pool.execute('SELECT id,document_kind,document_status,fiscal_status,document_number,issued_at FROM billing_documents WHERE order_id=? ORDER BY created_at DESC', [id]);
    const [history] = await pool.execute(`SELECT h.*, a.email FROM order_status_history h
      LEFT JOIN admins a ON a.id=h.admin_id WHERE h.order_id=? ORDER BY h.created_at DESC`, [id]);
    const [notes] = await pool.execute(`SELECT n.*, a.email FROM order_notes n
      LEFT JOIN admins a ON a.id=n.admin_id WHERE n.order_id=? ORDER BY n.created_at DESC`, [id]);
    res.json({ ...order, items, payments, documents, history, notes });
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
        'INSERT INTO order_status_history(order_id,admin_id,from_status,to_status,reason,ip_address) VALUES (?,?,?,?,?,?)',
        [id, req.admin.id, order.status, status, req.body?.reason || null, req.ip || null],
      );
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

  router.post('/orders/:id/notes', async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = z.object({ body: z.string().trim().min(2).max(2000) }).parse(req.body);
    const [[order]] = await pool.execute('SELECT id FROM orders WHERE id=?', [id]);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado.' });
    const [result] = await pool.execute('INSERT INTO order_notes(order_id,admin_id,body) VALUES (?,?,?)', [id, req.admin.id, body.body]);
    await pool.execute('INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,details) VALUES (?,?,?,?,?)', [req.admin.id, 'Agregó nota', 'order', id, JSON.stringify({ noteId: result.insertId })]);
    res.status(201).json({ id: result.insertId });
  });

  router.patch('/orders/:id/shipping', async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = z.object({
      status: z.enum(['Pendiente','Preparando','Transito','Entregado','Incidencia']),
      carrier: z.string().trim().max(160).optional(),
      trackingNumber: z.string().trim().max(180).optional(),
      deliveryNotes: z.string().trim().max(1000).optional(),
    }).parse(req.body);
    const [[order]] = await pool.execute('SELECT id FROM orders WHERE id=?', [id]);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado.' });
    await pool.execute(`INSERT INTO order_shipping(order_id,status,carrier,tracking_number,delivery_notes,updated_by,updated_at)
      VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE status=VALUES(status),carrier=VALUES(carrier),tracking_number=VALUES(tracking_number),delivery_notes=VALUES(delivery_notes),updated_by=VALUES(updated_by),updated_at=UTC_TIMESTAMP(3)`,
    [id, body.status, body.carrier || null, body.trackingNumber || null, body.deliveryNotes || null, req.admin.id]);
    await pool.execute('INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,details) VALUES (?,?,?,?,?)', [req.admin.id, 'Actualizó envío', 'order', id, JSON.stringify(body)]);
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
