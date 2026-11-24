# Matriz de cumplimiento verificable — Drop Zone CR

Estado actualizado: 24/11/2026. Los estados se basan en código y pruebas locales, no en promesas de producción.

| Área | Implementación verificable | Evidencia | Estado |
|---|---|---|---|
| Catálogo público | `GET /api/products`, imágenes y filtros existentes | Tests frontend | Implementado |
| Login administrativo | Cookie HTTP-only, rate limit, bcrypt | `AdminPage.jsx`, `admin.js` | Implementado |
| Dashboard | Métricas desde pagos, pedidos, costos, inventario y clientes | `GET /api/admin/staff/dashboard` HTTP 200 | Implementado |
| Datos demo | Clientes, pedidos, pagos, gastos, envíos y factura `[DEMO]` | `npm run db:seed:demo` | Implementado local |
| Expediente de pedido | Productos, pagos, documentos, envío, notas e historial | `GET /api/admin/orders/:id` | Implementado |
| Inventario | Movimientos, reservas, mínimos, traslados y conteos | Migración 004 + `operations.js` | Implementado API |
| Compras | Proveedores y órdenes de compra | `/api/admin/operations/purchases` | Implementado API |
| Devoluciones | Caso, estados, inspección y resolución | `/api/admin/operations/returns` | Implementado API |
| Caja | Sesiones, movimientos y cierre | `/api/admin/operations/cash` | Implementado API |
| Roles/permisos | Roles y permisos persistidos, seed de superadmin | `/api/admin/operations/roles` | Implementado base |
| Auditoría | `audit_logs`, historial de pedidos, acciones sensibles | MySQL + endpoints | Implementado base |
| Facturación comercial | Snapshot, PDF, SVG, enlace privado y WhatsApp Web manual | `billing.js`, `billing-pdf.js` | Implementado |
| Facturación fiscal/Hacienda | Adaptador pendiente, sin producción | `FISCAL_PROVIDER=none` | Sandbox pendiente |
| Gemini | Cliente backend, respuestas JSON validadas, dashboard y factura | `gemini.js`, endpoints IA | Implementado con credencial válida pendiente |
| Google Drive/RAG | OAuth, sincronización y citas por audiencia | `drive.js`, `knowledge.js` | Implementado local |
| Correo real | Adaptador/proveedor no configurado | Variables `.env.example` | Sandbox pendiente |
| WhatsApp Cloud | Solo WhatsApp Web manual | `billing.js` | Sandbox pendiente |
| Pagos externos | Pagos locales/modelo interno; sin pasarela real | `payments` | Sandbox pendiente |
| n8n/outbox | No conectado todavía | Requiere infraestructura | Pendiente |
| Gobernanza legal | Documentación y auditoría base | `docs/billing`, `audit_logs` | Parcial |
| Pruebas | Frontend y backend existentes, build y smoke tests locales | `npm test`, `npm run build` | Implementado local |
| Producción | No desplegada ni autorizada | Sin credenciales/URL pública | Pendiente |

## Regla de interpretación

“Implementado local” significa que existe código ejecutable y evidencia local. No significa que Hacienda, pagos, correo, WhatsApp Cloud o n8n estén conectados en producción.
