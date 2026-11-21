import { readFile } from 'node:fs/promises';
import { createPool, transaction } from './db.js';
import { inventoryLabels, legacyData } from './catalog.js';
import { hashPassword } from './password.js';

const pool = createPool();

async function migrate() {
  const schema = await readFile(new URL('../database/migrations/001_initial_schema.sql', import.meta.url), 'utf8');
  for (const statement of schema.split(';').map((sql) => sql.trim()).filter(Boolean)) {
    await pool.query(statement);
  }
  await transaction(pool, async (connection) => {
    const [accessMigration] = await connection.execute(
      "INSERT IGNORE INTO schema_migrations (version) VALUES ('002-staff-access')",
    );
    if (accessMigration.affectedRows) {
      await connection.execute("INSERT INTO staff_access (account_id, role) SELECT id, 'admin' FROM admins");
    }
    const [migration] = await connection.execute(
      "INSERT IGNORE INTO schema_migrations (version) VALUES ('001-catalogo-inicial')",
    );
    if (!migration.affectedRows) return;
    for (const product of legacyData.products) {
      const { id, name, category, priceCRC, image, shortDescription, availability, featured, displayOrder, ...presentation } = product;
      await connection.execute(
        `INSERT INTO products (id, name, category, price_crc, image, description, availability, featured, display_order, presentation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, name, category, priceCRC, image, shortDescription || '', availability || 'Consultar', Boolean(featured), displayOrder ?? 0, JSON.stringify(presentation)],
      );
      for (const [index, label] of inventoryLabels(product).entries()) {
        await connection.execute('INSERT INTO inventory_items (product_id, sku, label) VALUES (?, ?, ?)', [id, `${id}-${index + 1}`, label]);
      }
    }
  });
}

async function createAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length < 14 || password.length > 128) {
    throw new Error('Definí ADMIN_EMAIL y ADMIN_PASSWORD (de 14 a 128 caracteres).');
  }
  await transaction(pool, async (connection) => {
    const [user] = await connection.execute('INSERT INTO admins (email, password_hash) VALUES (?, ?)', [email, await hashPassword(password)]);
    await connection.execute("INSERT INTO staff_access (account_id, role) VALUES (?, 'admin')", [user.insertId]);
  });
}

try {
  if (process.argv[2] === 'admin') {
    await createAdmin();
    console.log('Administrador creado.');
  } else {
    await migrate();
    console.log('Migración e importación completadas.');
  }
} finally {
  await pool.end();
}
