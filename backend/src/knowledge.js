import { generateGroundedAnswer, geminiStatus } from './gemini.js';

export const policies = [
  { title: 'Uso de datos', body: 'Registrá producto, etapa y canal. Evitá nombres, teléfonos, pagos y conversaciones personales.', audience: 'team' },
  { title: 'Uso del asistente', body: 'El asistente consulta fuentes según el rol. Verificá las citas antes de recomendar precios, disponibilidad o promociones.', audience: 'team' },
  { title: 'Accesos e incidentes', body: 'Cada persona usa una cuenta individual. Administración revisa respuestas dudosas y desactiva cuentas.', audience: 'team' },
  { title: 'Publicación y revisión', body: 'Administración comprueba vigencia antes de publicar fichas y retira versiones anteriores.', audience: 'admin' },
  { title: 'Control de inventario', body: 'Una cantidad pendiente indica que falta contar. Confirmá modelo, color y SKU antes de prometer entrega.', audience: 'team' },
];
const stop = new Set('como para cual cuales tengo este esta con que del los las una por mas sobre puedo hacer son mis hay'.split(' '));
function terms(value) {
  return new Set(value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().match(/[a-z0-9]+/g)?.filter((word) => word.length > 1 && !stop.has(word)) || []);
}

export async function retrieve(pool, user, question) {
  const [items] = await pool.execute(`SELECT p.name,p.price_crc,p.presentation->'$.variants' AS variants,i.sku,i.label,i.quantity FROM inventory_items i JOIN products p ON p.id=i.product_id WHERE p.active=1 ORDER BY p.display_order,i.id`);
  const [articles] = await pool.execute("SELECT id,title,body,audience FROM knowledge_articles WHERE published=1 AND (audience='team' OR ?)", [user.role === 'admin']);
  const sources = [
    ...policies.filter((source) => source.audience === 'team' || user.role === 'admin').map((source) => ({ ...source, sourceId: `policy:${source.title}`, type: 'policy' })),
    ...articles.map((article) => ({ ...article, sourceId: `article:${article.id}`, type: 'article' })),
    ...items.map((item) => ({ title: `${item.name} · ${item.sku}`, sourceId: `inventory:${item.sku}`, type: 'inventory', audience: 'team', body: `${item.label}. Precio CRC ${(item.variants?.find((variant) => variant.name === item.label)?.priceCRC ?? item.price_crc)}. Stock: ${item.quantity ?? 'pendiente de conteo'}.` })),
  ];
  if (user.role === 'admin') {
    const [stats] = await funnel(pool);
    sources.push(...stats.map((row) => ({ title: `Ventas y conversión por canal · ${row.channel}`, sourceId: `funnel:${row.channel}`, type: 'metric', audience: 'admin', body: `${row.total} consultas y ${row.won} ventas confirmadas en los últimos 30 días.` })));
  }
  const [chunks] = await pool.execute(`SELECT c.id,d.title,d.source_url,d.audience,c.chunk_no,c.body FROM drive_chunks c JOIN drive_documents d ON d.id=c.document_id WHERE d.status='indexed' AND (d.audience='team' OR ?)`, [user.role === 'admin']);
  sources.push(...chunks.map((chunk) => ({ title: `${chunk.title} · fragmento ${chunk.chunk_no}`, sourceId: `drive:${chunk.id}`, type: 'drive', audience: chunk.audience, url: chunk.source_url, body: chunk.body })));
  const tokens = terms(question);
  const ranked = sources.map((source) => {
    const title = terms(source.title);
    const body = terms(source.body);
    const exactTitle = question.toLowerCase().includes(source.title.split(' · ').at(-1).toLowerCase());
    const score = (exactTitle ? 12 : 0) + [...tokens].reduce((sum, token) => sum + (title.has(token) ? 3 : 0) + (body.has(token) ? 1 : 0), 0);
    return { ...source, score };
  }).sort((a, b) => b.score - a.score);
  const relevant = ranked.filter((source) => source.score > 0);
  // When the question is broad, provide a small grounded context instead of an empty RAG result.
  // Gemini must still cite these sources and explicitly say when the evidence is insufficient.
  return (relevant.length ? relevant : ranked).slice(0, 8).map((source) => ({
    ...source,
    body: source.body.slice(0, 2400),
  }));
}

export function funnel(pool) {
  return pool.execute(`SELECT channel, COUNT(*) AS total, SUM(stage='Venta confirmada') AS won, SUM(stage='Cotización') AS quoted, SUM(stage='Consulta') AS openCount, SUM(stage='Perdida') AS lost FROM sales_inquiries WHERE created_at >= UTC_TIMESTAMP() - INTERVAL 30 DAY GROUP BY channel ORDER BY total DESC`);
}

export async function answer(sources, question) {
  if (!sources.length) return 'No encontré una fuente pertinente para esa consulta. Probá con un producto, SKU o procedimiento.';
  const generated = await generateGroundedAnswer(question, sources);
  if (!generated) return 'Gemini no está configurado. Estos son los fragmentos recuperados para tu consulta.';
  return generated.text;
}

export { geminiStatus };
