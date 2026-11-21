# Mapa de migración

| Fuente | Destino | Resultado |
| --- | --- | --- |
| `Drop_Zone/src/` | `frontend/src/` | Aplicación pública preservada; se agregó el panel administrativo. |
| `Drop_Zone/public/` | `frontend/public/` | Recursos del sitio preservados. |
| `Drop_Zone/db.json` | `data/seed/db.json` | Catálogo, configuración y secciones semilla. |
| `Drop_Zone_RAG/server/` | `backend/src/` | API, administración, CRM, inventario y RAG; se excluyó `demo.js`. |
| `Drop_Zone_RAG/schema.sql` | `backend/database/migrations/001_initial_schema.sql` | Esquema MySQL para migración e importación inicial. |
| Raíz del repositorio | `frontend/` | `index.html`, Vite, package manifest y lockfile original; el lockfile se reemplaza por uno único en la raíz del monorepo. |
| Adaptador API | `api/[...path].js` | Reenvía rutas `/api/*` a Express para Vercel. |

## Integraciones realizadas

- Workspace npm raíz con comandos para frontend, backend, pruebas, build y migración.
- Proxy local `/api` desde Vite al backend.
- Rutas del catálogo y carga de datos compatibles con API en producción.
- Ruta de administración `/admin`.
- Registro de pedidos con validación en servidor, transacción, idempotencia y decremento de inventario cuando el stock está administrado.
- Ejemplos `.env.example` sin valores secretos.

## No eliminados ni fusionados automáticamente

Las carpetas fuente y el ZIP externos al repositorio se dejaron intactos. Las imágenes con hash distinto, copias desconocidas y archivos no referenciados no se eliminaron. Los documentos duplicados exactos dentro del repositorio se consolidaron, manteniendo las versiones ubicadas en `docs/`.
