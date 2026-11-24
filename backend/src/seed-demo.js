import { createPool, transaction } from './db.js';
import { hashPassword } from './password.js';

const pool = createPool();
const demo = '[DEMO]';
const orders = [
  { id: '11111111-1111-4111-8111-111111111111', customer: ['Demo María López', '+506 8888-1101', 'demo.maria@dropzone.local'], status: 'Entregado', amount: 129900, paid: 129900, daysAgo: 2, item: 0 },
  { id: '22222222-2222-4222-8222-222222222222', customer: ['Demo Carlos Rojas', '+506 8888-1102', 'demo.carlos@dropzone.local'], status: 'Despachado', amount: 65900, paid: 65900, daysAgo: 5, item: 1 },
  { id: '33333333-3333-4333-8333-333333333333', customer: ['Demo Andrea Mora', '+506 8888-1103', 'demo.andrea@dropzone.local'], status: 'Preparacion', amount: 220000, paid: 220000, daysAgo: 8, item: 2 },
  { id: '44444444-4444-4444-8444-444444444444', customer: ['Demo Diego Vargas', '+506 8888-1104', 'demo.diego@dropzone.local'], status: 'Pendiente', amount: 89900, paid: 0, daysAgo: 12, item: 3 },
  { id: '55555555-5555-4555-8555-555555555555', customer: ['Demo Sofía Rojas', '+506 8888-1105', 'demo.sofia@dropzone.local'], status: 'Pagado', amount: 145000, paid: 145000, daysAgo: 18, item: 4 },
  { id: '66666666-6666-4666-8666-666666666666', customer: ['Demo Laura Castro', '+506 8888-1106', 'demo.laura@dropzone.local'], status: 'Entregado', amount: 210000, paid: 210000, daysAgo: 24, item: 0 },
  { id: '88888888-8888-4888-8888-888888888888', customer: ['Demo MarÃ­a LÃ³pez', '+506 8888-1101', 'demo.maria@dropzone.local'], status: 'Entregado', amount: 78000, paid: 78000, daysAgo: 1, item: 1 },
  { id: '99999999-9999-4999-8999-999999999999', customer: ['Demo Carlos Rojas', '+506 8888-1102', 'demo.carlos@dropzone.local'], status: 'Preparacion', amount: 112000, paid: 112000, daysAgo: 3, item: 2 },
  { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', customer: ['Demo Andrea Mora', '+506 8888-1103', 'demo.andrea@dropzone.local'], status: 'Despachado', amount: 97000, paid: 97000, daysAgo: 6, item: 3 },
  { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', customer: ['Demo Felipe SolÃ­s', '+506 8888-1107', 'demo.felipe@dropzone.local'], status: 'Pendiente', amount: 56000, paid: 0, daysAgo: 9, item: 4 },
  { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', customer: ['Demo Valeria Torres', '+506 8888-1108', 'demo.valeria@dropzone.local'], status: 'Pagado', amount: 189000, paid: 189000, daysAgo: 14, item: 0 },
  { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', customer: ['Demo Diego Vargas', '+506 8888-1104', 'demo.diego@dropzone.local'], status: 'Preparacion', amount: 73500, paid: 0, daysAgo: 28, item: 1 },
];

async function seed() {
  await transaction(pool, async (connection) => {
    let [[admin]] = await connection.execute('SELECT id FROM admins ORDER BY id LIMIT 1');
    if (!admin) throw new Error('Crea primero un administrador con npm run admin:create.');
    if (process.env.NODE_ENV !== 'production') {
      const demoEmail = (process.env.DEMO_ADMIN_EMAIL || 'demo.admin@dropzone.local').trim().toLowerCase();
      const demoPassword = process.env.DEMO_ADMIN_PASSWORD || 'DropZoneDemo2026!';
      await connection.execute(
        `INSERT INTO admins (email, password_hash) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash)`,
        [demoEmail, await hashPassword(demoPassword)],
      );
      const [[demoAccount]] = await connection.execute('SELECT id FROM admins WHERE email=?', [demoEmail]);
      await connection.execute(
        `INSERT INTO staff_access (account_id, role, enabled) VALUES (?, 'admin', 1)
         ON DUPLICATE KEY UPDATE role='admin', enabled=1`,
        [demoAccount.id],
      );
    }
    const [products] = await connection.execute('SELECT id,name,price_crc,cost_crc FROM products ORDER BY display_order,id LIMIT 8');
    const [inventory] = await connection.execute('SELECT id,product_id,sku,label,quantity FROM inventory_items ORDER BY id LIMIT 8');
    if (products.length < 5 || inventory.length < 5) throw new Error('Se requieren al menos cinco productos e inventarios para cargar la demo.');

    for (const [index, item] of inventory.entries()) {
      await connection.execute('INSERT IGNORE INTO inventory_thresholds(item_id,minimum_quantity,updated_by) VALUES (?,?,?)', [item.id, index === 0 ? 5 : 10, admin.id]);
      if (index < 2) await connection.execute('UPDATE inventory_items SET quantity=? WHERE id=?', [index === 0 ? 2 : 7, item.id]);
    }

    const customerIds = new Map();
    for (const order of orders) {
      const [customerResult] = await connection.execute(
        `INSERT INTO customers(name,phone,email,notes) VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE name=VALUES(name),email=VALUES(email),notes=VALUES(notes)`,
        [...order.customer, `${demo} Cliente creado para validar el panel.`],
      );
      const [[customer]] = await connection.execute('SELECT id FROM customers WHERE phone=?', [order.customer[1]]);
      customerIds.set(order.customer[1], customer.id || customerResult.insertId);
      const [[existing]] = await connection.execute('SELECT id FROM orders WHERE id=?', [order.id]);
      if (existing) continue;
      const product = products[order.item % products.length];
      const inventoryItem = inventory.find((row) => row.product_id === product.id) || inventory[order.item % inventory.length];
      const cost = Number(product.cost_crc) || Math.round(Number(product.price_crc) * 0.62);
      const createdAt = new Date(Date.now() - order.daysAgo * 86400000);
      await connection.execute(
        `INSERT INTO orders(id,customer_id,customer_name,phone,channel,status,subtotal_crc,discount_crc,total_crc,payment_method,idempotency_key,notes,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,0,?,?,?, ?,?,?)`,
        [order.id, customer.id, order.customer[0], order.customer[1], order.item % 2 ? 'WhatsApp' : 'Tienda', order.status, order.amount, order.amount, order.paid ? 'Transferencia' : 'Por verificar', `${demo.toLowerCase()}:${order.id}`, `${demo} Pedido sintético para probar el panel.`, createdAt, createdAt],
      );
      await connection.execute('INSERT INTO order_items(order_id,product_id,inventory_item_id,name,variant_label,quantity,unit_price_crc,cost_crc) VALUES (?,?,?,?,?,?,?,?)', [order.id, product.id, inventoryItem.id, product.name, inventoryItem.label, 1, order.amount, cost]);
      if (order.paid) await connection.execute('INSERT INTO payments(order_id,amount_crc,method,status,reference,paid_at,created_at) VALUES (?,?,?,?,?,?,?)', [order.id, order.paid, 'Transferencia', 'Confirmado', `${demo}-PAY-${order.item + 1}`, createdAt, createdAt]);
      else await connection.execute('INSERT INTO payments(order_id,amount_crc,method,status,reference,created_at) VALUES (?,?,?,?,?,?)', [order.id, order.amount, 'SINPE Móvil', 'Pendiente', `${demo}-PENDING-${order.item + 1}`, createdAt]);
      await connection.execute('INSERT INTO order_shipping(order_id,status,carrier,tracking_number,delivery_notes,updated_by,updated_at) VALUES (?,?,?,?,?,?,?)', [order.id, order.status === 'Entregado' ? 'Entregado' : order.status === 'Despachado' ? 'Transito' : 'Preparando', `${demo} Transportes`, `${demo}-TRACK-${order.item + 1}`, `${demo} Entrega de prueba`, admin.id, createdAt]);
      await connection.execute('INSERT INTO order_status_history(order_id,admin_id,from_status,to_status,reason,ip_address,created_at) VALUES (?,?,?,?,?,?,?)', [order.id, admin.id, null, order.status, `${demo} Registro inicial`, '127.0.0.1', createdAt]);
      await connection.execute('INSERT INTO order_notes(order_id,admin_id,body,created_at) VALUES (?,?,?,?)', [order.id, admin.id, `${demo} No corresponde a una venta real.`, createdAt]);
    }

    await connection.execute(`INSERT INTO expenses(category,description,amount_crc,incurred_at,created_by)
      SELECT 'Demo', '${demo} Gasto de logística de prueba', 25000, DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY), ?
      WHERE NOT EXISTS (SELECT 1 FROM expenses WHERE description='${demo} Gasto de logística de prueba')`, [admin.id]);
    const [[demoOrder]] = await connection.execute('SELECT id,customer_id,total_crc,subtotal_crc FROM orders WHERE id=?', [orders[1].id]);
    if (demoOrder) {
      await connection.execute(`INSERT IGNORE INTO billing_documents
        (id,order_id,customer_id,document_kind,fiscal_status,document_status,subtotal_crc,discount_crc,tax_crc,total_crc,emitter_snapshot,customer_snapshot,items_snapshot,order_snapshot,idempotency_key,created_by)
        VALUES ('77777777-7777-4777-8777-777777777777',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [demoOrder.id, demoOrder.customer_id, 'fiscal_invoice', 'rejected', 'issued', demoOrder.subtotal_crc, 0, 0, demoOrder.total_crc, JSON.stringify({ name: 'Drop Zone CR', mode: 'demo' }), JSON.stringify({ name: 'Demo Carlos Rojas' }), JSON.stringify([]), JSON.stringify(demoOrder), `${demo.toLowerCase()}:invoice:1`, admin.id]);
    }
    await connection.execute('INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,details) VALUES (?,?,?,?,?)', [admin.id, 'Cargó datos demo', 'system', 'demo-seed-v1', JSON.stringify({ marker: demo, orders: orders.length })]);
  });
  console.log('Datos demo cargados o ya existentes. Marcador: [DEMO].');
}

try { await seed(); } finally { await pool.end(); }
