# Plan de implementación del panel administrativo

## Estado inicial auditado

La aplicación usa React 19 + Vite en `frontend/`, Node.js + Express en `backend/` y MySQL 8 mediante `mysql2`. La sesión administrativa usa cookies HTTP-only y las rutas administrativas están bajo `/api/admin`.

Ya existen módulos funcionales para catálogo, inventario básico, pedidos, clientes, proveedores, promociones, garantías, gastos, reportes de utilidad, usuarios, auditoría, Gemini/Drive y documentos comerciales. La migración `001_initial_schema.sql` contiene el núcleo comercial y `002_billing.sql` contiene documentos y entregas privadas.

## Brechas encontradas

- El dashboard mostraba varios KPI fijos aunque ya existían pedidos, pagos, costos y gastos en MySQL.
- Algunos módulos administrativos usan datos demo cuando sus consultas reales están vacías; deben identificarse visualmente y no confundirse con datos reales.
- El inventario aún no modela bodegas, reservas, mínimos, lotes ni traslados como entidades separadas.
- El flujo de facturación fiscal, correo transaccional, WhatsApp Cloud y pagos externos no está conectado; debe mantenerse en sandbox hasta contar con proveedores y credenciales configuradas.
- El sistema tiene `audit_logs`, pero las acciones sensibles y los roles todavía deben granularse más.

## Orden de ejecución

1. Dashboard calculado desde MySQL y estados de datos reales.
2. Expediente de pedido con estados separados de pedido, pago y envío.
3. Inventario transaccional con reservas, mínimos y movimientos idempotentes.
4. Roles, permisos, papelera lógica y auditoría completa.
5. CRM, compras, devoluciones y garantías.
6. Caja, conciliación y proveedores de pago en sandbox.
7. Facturación fiscal, correo y WhatsApp en sandbox; producción solo con autorización explícita.

## Criterios de seguridad

- Migraciones idempotentes y no destructivas.
- Validación en servidor y consultas parametrizadas.
- Transacciones para inventario, pagos y cambios de estado.
- Claves de idempotencia para reintentos.
- Ningún secreto en frontend, Git o documentación.
- Ninguna integración externa se considerará exitosa sin confirmación del proveedor.

La matriz de evidencia y pendientes se mantiene en `docs/MATRIZ_CUMPLIMIENTO.md`.

## Verificación

Después de cada etapa se ejecutarán migraciones locales, pruebas de frontend/backend, build de producción y comprobaciones HTTP contra la API local.

## Datos de demostración

El comando `npm run db:seed:demo` carga registros sintéticos identificados con `[DEMO]`: clientes, pedidos, pagos, inventario bajo, envíos, notas, gastos y una factura fiscal rechazada de prueba. Es idempotente y no debe ejecutarse contra producción.
