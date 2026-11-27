# Límites legales y fiscales

El modo por defecto es `BILLING_MODE=commercial_only`. Los PDF generados incluyen la leyenda **Documento comercial - no válido como comprobante fiscal**.

Este módulo no emite XML, no firma documentos, no obtiene consecutivos fiscales y no afirma una respuesta de Hacienda. Para activar facturación electrónica se requiere un proveedor fiscal autorizado, datos del emisor, CABYS, impuestos parametrizados, firma y revisión contable vigente en Costa Rica.

Los recibos comerciales requieren un pago con estado `Confirmado` en MySQL. Un clic de entrega nunca confirma un pago.
