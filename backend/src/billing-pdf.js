function pdfText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/[\\()]/g, (character) => `\\${character}`);
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
    `Subtotal: CRC ${Number(document.subtotalCRC).toLocaleString('en-US')}`,
    `Descuento: CRC ${Number(document.discountCRC).toLocaleString('en-US')}`,
    `Impuestos: CRC ${Number(document.taxCRC).toLocaleString('en-US')} (no parametrizados)`,
    `TOTAL: CRC ${Number(document.totalCRC).toLocaleString('en-US')}`,
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
