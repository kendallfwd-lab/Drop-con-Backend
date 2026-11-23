import { readFileSync } from 'node:fs';

export const legacyData = JSON.parse(readFileSync(new URL('../../data/seed/db.json', import.meta.url), 'utf8'));

export async function catalog(pool, includeInactive = false) {
  const [rows] = await pool.execute(
    `SELECT * FROM products WHERE (? OR active = TRUE) ORDER BY display_order, id`,
    [includeInactive],
  );
  return rows.map((row) => ({
    ...row.presentation,
    id: row.id,
    name: row.name,
    category: row.category,
    priceCRC: row.price_crc,
    image: row.image,
    shortDescription: row.description,
    availability: row.availability,
    featured: Boolean(row.featured),
    displayOrder: row.display_order,
    ...(includeInactive ? { active: Boolean(row.active), costCRC: row.cost_crc } : {}),
  }));
}

export function inventoryLabels(product) {
  if (product.variants?.length) return product.variants.map(({ name }) => name);
  const models = product.configurable && product.models?.length ? product.models : [''];
  const colors = (product.configurable || product.colorConfigurable) && product.colors?.length
    ? product.colors.map(({ name }) => name) : [''];
  return models.flatMap((model) => colors.map((color) => [model, color].filter(Boolean).join(' / ') || 'Única'));
}
