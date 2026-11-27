# Pruebas y límites verificados

Verificado localmente:

- Migración `002_billing.sql` ejecutada contra MySQL de desarrollo.
- Login administrativo y `GET /api/admin/billing/documents` autenticados.
- 69 pruebas frontend y 2 pruebas backend existentes.
- Build de producción.
- `npm audit --omit=dev` sin vulnerabilidades.

Pendiente para una fase posterior: integración fiscal real, proveedor de correo, WhatsApp Cloud API, webhooks firmados, cola persistente, almacenamiento privado remoto y pruebas concurrentes con MySQL aislado.
