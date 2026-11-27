function pdfText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/[\\()]/g, (character) => `\\${character}`);
}

function field(object, snake, camel) { return object?.[camel] ?? object?.[snake] ?? 0; }

export function buildCommercialSvg(document) {
  const customer = document.customerSnapshot || {};
  const order = document.orderSnapshot || {};
  const items = document.itemsSnapshot || [];
  const rows = items.map((item, index) => `<text x="48" y="${250 + index * 28}" class="body">${index + 1}. ${String(item.name || '').slice(0, 42)} x${item.quantity} · CRC ${Number(item.unit_price_crc || item.unitPriceCRC || 0).toLocaleString('en-US')}</text>`).join('');
  const total = Number(field(document, 'total_crc', 'totalCRC')).toLocaleString('en-US');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="620" viewBox="0 0 720 620"><rect width="720" height="620" fill="#f4f7fb"/><rect x="24" y="24" width="672" height="572" rx="18" fill="#fff" stroke="#d7e0ec"/><text x="48" y="72" class="title">DROP ZONE CR</text><text x="48" y="104" class="warning">VISTA PREVIA GENERADA · NO ES COMPROBANTE FISCAL</text><text x="48" y="154" class="body">Cliente: ${String(customer.name || 'Consumidor').slice(0, 58)}</text><text x="48" y="180" class="body">Pedido: ${String(order.id || document.order_id || '').slice(0, 36)}</text>${rows}<text x="48" y="520" class="total">TOTAL CRC ${total}</text><text x="48" y="558" class="small">Revisá los datos antes de guardar o emitir.</text><style>.title{font:700 30px Arial;fill:#0e172a}.warning{font:700 14px Arial;fill:#d97706}.body{font:16px Arial;fill:#334155}.total{font:700 24px Arial;fill:#2563eb}.small{font:13px Arial;fill:#64748b}</style></svg>`;
}

export function buildCommercialPdf(document) {
  const customer = document.customerSnapshot || {};
  const order = document.orderSnapshot || {};
  const items = document.itemsSnapshot || [];
  const lines = [
    'DROP ZONE CR',
    'DOCUMENTO COMERCIAL - NO VALIDO COMO COMPROBANTE FISCAL',
    `Tipo: ${document.documentKind}`,
    `Documento: ${document.id}`,
    `Pedido: ${order.id || document.orderId}`,
    `Fecha: ${new Date(document.createdAt || Date.now()).toLocaleString('es-CR')}`,
    '',
    `Cliente: ${customer.name || 'Consumidor'}`,
    `Telefono: ${customer.phone || 'No indicado'}`,
    `Correo: ${customer.email || 'No indicado'}`,
    '',
    'DETALLE',
    ...items.map((item) => `${item.quantity} x ${item.name}${item.variant_label ? ` (${item.variant_label})` : ''} - CRC ${Number(item.unit_price_crc).toLocaleString('en-US')}`),
    '',
    `Subtotal: CRC ${Number(field(document, 'subtotal_crc', 'subtotalCRC')).toLocaleString('en-US')}`,
    `Descuento: CRC ${Number(field(document, 'discount_crc', 'discountCRC')).toLocaleString('en-US')}`,
    `Impuestos: CRC ${Number(field(document, 'tax_crc', 'taxCRC')).toLocaleString('en-US')} (no parametrizados)`,
    `TOTAL: CRC ${Number(field(document, 'total_crc', 'totalCRC')).toLocaleString('en-US')}`,
    '',
    'Conserve este documento como referencia comercial. No sustituye una factura o tiquete electronico autorizado.',
  ];
  const content = ['BT', '/F1 11 Tf', '50 780 Td', ...lines.flatMap((line, index) => [index ? '0 -18 Td' : '', `(${pdfText(line)}) Tj`]), 'ET'].filter(Boolean).join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'ascii');
}
