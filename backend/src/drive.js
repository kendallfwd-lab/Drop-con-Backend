import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { google } from 'googleapis';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

const scope = ['https://www.googleapis.com/auth/drive.readonly'];
const allowedTypes = new Set([
  'application/vnd.google-apps.document',
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const oauthStates = new Map();

function key() {
  const value = process.env.TOKEN_ENCRYPTION_KEY;
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) throw new Error('TOKEN_ENCRYPTION_KEY debe ser una clave hex de 32 bytes');
  return Buffer.from(value, 'hex');
}
function encrypt(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}
function decrypt(value) {
  const data = Buffer.from(value, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', key(), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8'));
}
function oauthClient() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) return null;
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
}
export function driveStatus() {
  return { configured: Boolean(oauthClient() && process.env.GOOGLE_DRIVE_FOLDER_ID && process.env.TOKEN_ENCRYPTION_KEY), folderConfigured: Boolean(process.env.GOOGLE_DRIVE_FOLDER_ID) };
}
export function issueOAuthState() {
  const state = randomBytes(24).toString('hex');
  oauthStates.set(state, Date.now() + 10 * 60 * 1000);
  return state;
}
export function consumeOAuthState(state) {
  const expiry = oauthStates.get(state);
  oauthStates.delete(state);
  return Boolean(expiry && expiry > Date.now());
}
export function driveAuthorizationUrl(state) {
  const client = oauthClient();
  if (!client) throw new Error('Faltan GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o GOOGLE_REDIRECT_URI');
  return client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope, state });
}
export async function saveDriveCallback(pool, code) {
  const client = oauthClient();
  if (!client) throw new Error('OAuth de Google no configurado');
  const { tokens } = await client.getToken(code);
  await pool.execute(`INSERT INTO google_drive_connections (id, folder_id, encrypted_tokens, status, updated_at)
    VALUES (1, ?, ?, 'connected', UTC_TIMESTAMP())
    ON DUPLICATE KEY UPDATE folder_id=VALUES(folder_id), encrypted_tokens=VALUES(encrypted_tokens), status='connected', updated_at=UTC_TIMESTAMP()`,
  [process.env.GOOGLE_DRIVE_FOLDER_ID || '', encrypt(tokens)]);
}
async function driveClient(pool) {
  const [[row]] = await pool.execute('SELECT encrypted_tokens FROM google_drive_connections WHERE id=1 AND status="connected"');
  if (!row) throw new Error('Google Drive no está autorizado');
  const client = oauthClient();
  client.setCredentials(decrypt(row.encrypted_tokens));
  return google.drive({ version: 'v3', auth: client });
}
async function textFromFile(drive, file) {
  if (file.mimeType === 'application/vnd.google-apps.document') {
    const response = await drive.files.export({ fileId: file.id, mimeType: 'text/plain' }, { responseType: 'text' });
    return response.data;
  }
  const response = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(response.data);
  if (file.mimeType === 'application/pdf') return (await pdfParse(buffer)).text;
  if (file.mimeType.includes('wordprocessingml')) return (await mammoth.extractRawText({ buffer })).value;
  return buffer.toString('utf8');
}
export async function syncDriveFolder(pool, actorId) {
  if (!process.env.GOOGLE_DRIVE_FOLDER_ID) throw new Error('Definí GOOGLE_DRIVE_FOLDER_ID antes de sincronizar');
  const drive = await driveClient(pool);
  const result = await drive.files.list({ q: `'${process.env.GOOGLE_DRIVE_FOLDER_ID}' in parents and trashed = false`, fields: 'files(id,name,mimeType,modifiedTime,webViewLink)', pageSize: 100 });
  let synced = 0;
  for (const file of result.data.files || []) {
    if (!allowedTypes.has(file.mimeType)) continue;
    try {
      const text = (await textFromFile(drive, file)).replace(/\s+/g, ' ').trim();
      const chunks = text.match(/.{1,1200}(?:\s|$)/g)?.map((chunk) => chunk.trim()).filter(Boolean) || [];
      await pool.query('DELETE FROM drive_chunks WHERE document_id IN (SELECT id FROM drive_documents WHERE file_id=?)', [file.id]);
      await pool.execute(`INSERT INTO drive_documents (file_id,title,mime_type,source_url,audience,modified_time,status,error,updated_at)
        VALUES (?,?,?,?, 'team', ?, 'indexed', NULL, UTC_TIMESTAMP())
        ON DUPLICATE KEY UPDATE title=VALUES(title),mime_type=VALUES(mime_type),source_url=VALUES(source_url),modified_time=VALUES(modified_time),status='indexed',error=NULL,updated_at=UTC_TIMESTAMP()`,
      [file.id, file.name, file.mimeType, file.webViewLink || '', file.modifiedTime ? new Date(file.modifiedTime) : null]);
      const [[doc]] = await pool.execute('SELECT id FROM drive_documents WHERE file_id=?', [file.id]);
      for (const [index, chunk] of chunks.entries()) await pool.execute('INSERT INTO drive_chunks (document_id,chunk_no,body) VALUES (?,?,?)', [doc.id, index + 1, chunk]);
      synced += 1;
    } catch (error) {
      await pool.execute(`INSERT INTO drive_documents (file_id,title,mime_type,source_url,audience,modified_time,status,error,updated_at)
        VALUES (?,?,?,?, 'team', ?, 'error', ?, UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE status='error',error=VALUES(error),updated_at=UTC_TIMESTAMP()`,
      [file.id, file.name, file.mimeType, file.webViewLink || '', file.modifiedTime ? new Date(file.modifiedTime) : null, error.message.slice(0, 500)]);
    }
  }
  await pool.execute('INSERT INTO drive_sync_runs (actor_id,files_synced,created_at) VALUES (?,?,UTC_TIMESTAMP())', [actorId, synced]);
  return { synced };
}
