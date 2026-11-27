# Operación de Facturación y Documentos

El MVP crea documentos comerciales a partir de un pedido existente y guarda un snapshot inmutable de cliente, líneas y totales.

1. Entrar a `/admin/facturacion`.
2. Seleccionar un pedido real y el tipo: cotización, confirmación o recibo comercial.
3. Emitir el documento.
4. Abrir el PDF o preparar WhatsApp Web.
5. El operador verifica el destinatario y adjunta el PDF si corresponde.

El estado `manual_pending` significa que WhatsApp Web fue preparado; no significa que el cliente recibió el documento. Los reenvíos reutilizan el mismo documento y crean un intento separado.
