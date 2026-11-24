# IA administrativa con Gemini

## Qué hace

Gemini se utiliza desde el backend para revisar facturas, resumir métricas y proponer acciones. La API key permanece en `GEMINI_API_KEY`; nunca se envía al navegador.

## Vista previa de factura

El flujo correcto es:

1. El administrador selecciona un pedido.
2. El backend obtiene cliente, productos, precios históricos, descuentos y totales desde MySQL.
3. El servidor valida y congela el JSON de la factura.
4. El servidor genera una vista SVG/PDF determinística con una marca visible de “vista previa, no comprobante fiscal”.
5. Gemini puede revisar campos faltantes, inconsistencias y redactar un resumen.
6. El administrador acepta, edita o descarta la sugerencia.

La IA no escribe números en la imagen, no calcula impuestos y no puede cambiar estados de pago o Hacienda.

## Prompt base recomendado

```text
Actúa como asistente administrativo de Drop Zone CR.

Usa exclusivamente el JSON recibido. No inventes ni corrijas silenciosamente nombres,
productos, precios, cantidades, descuentos, impuestos, fechas, moneda, pagos o estados.
Los totales calculados por el servidor son definitivos.

Devuelve únicamente JSON con esta estructura:
{
  "summary": "resumen breve de la factura",
  "missingFields": [],
  "inconsistencies": [],
  "draftMessage": "mensaje sugerido para revisión humana"
}

Si falta información, indícala en missingFields. Si hay una contradicción,
indícala en inconsistencies. No afirmes que la factura fue aceptada por Hacienda,
pagada o enviada. Todas tus recomendaciones requieren revisión humana.
```

## Endpoints

- `POST /api/admin/staff/dashboard/ai-analysis`: analiza métricas reales del dashboard.
- `POST /api/admin/billing/documents/:id/ai-review`: revisa una factura comercial.
- `GET /api/admin/billing/documents/:id/preview.svg`: crea una vista previa visual determinística.

Si Gemini no está configurado o devuelve un error, el dashboard, PDF y facturación comercial continúan funcionando. El error se muestra como recuperable y no se registra la clave ni el contenido sensible completo.

## Variables

```env
GEMINI_API_KEY=tu_clave_en_entorno
GEMINI_MODEL=gemini-2.5-flash
```

En producción se deben añadir límites de cuota, monitoreo y revisión de privacidad antes de enviar datos personales al proveedor.
