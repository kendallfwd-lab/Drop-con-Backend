# Auditoría del panel administrativo

Fecha de revisión: 2026-11-26  
Arquitectura comprobada: React/Vite + Express 5 + MySQL 8 + migraciones SQL versionadas.

## Estado ejecutivo

El repositorio ya tiene un panel operativo conectado a MySQL con autenticación por sesión, CSRF, MFA TOTP, recuperación por código, catálogo, inventario, pedidos, clientes, proveedores, promociones, garantías, gastos, reportes, documentos comerciales, operaciones avanzadas y un asistente RAG. La base técnica permite continuar hacia un ERP, pero todavía hay áreas que son parciales o sandbox.

## Evidencia por área

| Área | Estado | Evidencia comprobada | Riesgo o pendiente |
|---|---|---|---|
| Autenticación | Implementado | `backend/src/admin.js`, `backend/src/auth-security.js`, migraciones `005` y `006` | MFA/passkeys requieren proveedor y pruebas de navegador para producción |
| CSRF/CORS | Implementado | `backend/src/index.js`, `backend/src/admin.js`; `/api/admin/csrf` responde 200 localmente | Mantener `APP_ORIGIN` correcto en cada entorno |
| Catálogo | Implementado | CRUD en `backend/src/admin.js`, UI en `AdminPage.jsx` | Falta separar mejor borrador/publicado y paginación server-side |
| Inventario | Parcial avanzado | movimientos, umbrales, reservas y operaciones en `admin.js`/`operations.js` | Faltan ubicaciones completas, recepción de compras y conteos operativos en UI |
| Pedidos | Implementado parcial | estados, historial, notas y envío en `admin.js` | Pago, devolución y transición requieren más pantallas y pruebas de concurrencia |
| Compras | Parcial | tablas y endpoints en `004_business_operations.sql` y `operations.js` | Falta recepción parcial y actualización de costo con autorización |
| CRM | Parcial | clientes, historial derivado y seguimiento comercial | Faltan consentimientos, segmentación persistida y ficha completa |
| Caja/finanzas | Parcial sandbox | `cash_sessions`, `cash_movements`, gastos y reportes | Falta conciliación bancaria y política de cierre/aprobación |
| Facturación | Comprobante comercial | `backend/src/billing.js`, `billing-pdf.js`, migración `002` | No es facturación fiscal; correo/WhatsApp dependen de proveedores reales |
| IA/RAG | Parcial supervisado | `gemini.js`, `knowledge.js`, `staff.js`, Drive RAG | Fallback local funciona; falta observabilidad por agente y la clave/modelo externo debe validarse |
| Auditoría | Implementado base | `audit_logs`, rutas `/audit` y registros de acciones | Falta cubrir todas las mutaciones y mostrar motivo/cambios en UI |
| Papelera | Parcial | vista y registros operativos en `AdminPage.jsx` | Debe centralizar archivado lógico y restauración por entidad |
| Responsive/UI | En mejora | `frontend/src/features/admin/admin.css` | Validar visualmente en navegador real cuando el host esté disponible |

## Validaciones ejecutadas

- `npm test`: 69 pruebas frontend y 2 backend aprobadas.
- `npm run build`: compilación Vite aprobada.
- `git diff --check`: sin errores de whitespace.
- `GET /api/health`: 200.
- `GET /api/admin/csrf`: 200.
- Login local con cuenta administrativa existente: 200.
- Logout con CSRF: 204.
- Rutas GET de dashboard, productos, inventario, pedidos, clientes, proveedores, promociones, garantías, gastos, reportes, auditoría, compras, devoluciones y caja: 200.

## Backlog priorizado

### P0 — integridad y seguridad

1. Cubrir mutaciones sensibles con pruebas de autorización, CSRF, idempotencia y auditoría.
2. Evitar que cualquier seed/demo se active en producción.
3. Validar configuración de secretos al inicio sin imprimirlos.

### P1 — operación comercial

1. Recepción parcial de compras con actualización transaccional de inventario.
2. Transferencias entre ubicaciones con rollback atómico.
3. Devoluciones parciales vinculadas a pedido, inspección y reposición autorizada.
4. Caja con apertura, movimientos, cierre y diferencia de arqueo.
5. Ficha CRM con consentimientos y segmentación persistida.

### P2 — analítica e IA

1. Filtros temporales y por canal consistentes en todos los KPIs.
2. Agentes especializados con herramientas de solo lectura y salida estructurada.
3. Registro de `ai_runs`, latencia, modelo, fallback y resultado redactado.
4. Automatizaciones mediante outbox, reintentos limitados y deduplicación.

## Decisiones y límites

- Los documentos actuales son comprobantes comerciales; no se presentan como factura fiscal autorizada.
- Gemini puede recomendar y resumir, pero no puede modificar precios, inventario, pagos ni emitir documentos por sí solo.
- No se realizaron cobros, envíos reales, cambios productivos ni eliminación de datos.
