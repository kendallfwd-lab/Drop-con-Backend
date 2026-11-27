import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function encryptionKey() {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw || !/^[a-f0-9]{64}$/i.test(raw)) throw new Error('TOKEN_ENCRYPTION_KEY debe ser una clave hex de 32 bytes para activar MFA.');
  return Buffer.from(raw, 'hex');
}
export function encryptSecret(value) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const payload = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), payload]).toString('base64url');
}
export function decryptSecret(value) {
  const data = Buffer.from(value, 'base64url'); const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28)); return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
}
export function createTotpSecret() {
  const bytes = randomBytes(20); let bits = 0; let value = 0; let result = '';
  for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) result += alphabet[(value >>> (bits -= 5)) & 31]; }
  if (bits) result += alphabet[(value << (5 - bits)) & 31]; return result;
}
function decodeBase32(secret) {
  let bits = 0; let value = 0; const bytes = [];
  for (const char of secret.replace(/[\s-]/g, '').toUpperCase()) { const index = alphabet.indexOf(char); if (index < 0) throw new Error('Secreto TOTP inválido.'); value = (value << 5) | index; bits += 5; if (bits >= 8) bytes.push((value >>> (bits -= 8)) & 255); }
  return Buffer.from(bytes);
}
export function validTotp(secret, input, now = Date.now()) {
  if (!/^\d{6}$/.test(input)) return false; const key = decodeBase32(secret);
  for (let offset = -1; offset <= 1; offset += 1) { const message = Buffer.alloc(8); message.writeBigUInt64BE(BigInt(Math.floor(now / 30000) + offset)); const digest = createHmac('sha1', key).update(message).digest(); const position = digest[digest.length - 1] & 15; const expected = String((digest.readUInt32BE(position) & 0x7fffffff) % 1_000_000).padStart(6, '0'); if (timingSafeEqual(Buffer.from(expected), Buffer.from(input))) return true; }
  return false;
}
export function requestIp(req) { return String(req.ip || req.socket?.remoteAddress || '').slice(0, 64) || null; }
