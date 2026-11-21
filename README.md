# Drop Zone CR

Aplicación de catálogo y pedidos de Drop Zone CR organizada como monorepo con npm workspaces. El frontend React/Vite consume la API Express; el backend conserva las herramientas administrativas, CRM y recuperación de información (RAG) de las otras versiones locales.

## Requisitos

- Node.js 22 o superior (incluye `--env-file-if-exists`).
- npm.
- MySQL compatible con la versión indicada en `backend/database/migrations/001_initial_schema.sql`.

## Inicio local

1. Copiá `.env.example` a `.env` y completá las variables de MySQL (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`). El backend no arranca sin conexión configurada.
2. Instalá las dependencias desde la raíz y prepará el esquema y el catálogo inicial:

   ```sh
   npm install
   npm run db:migrate
   ```

3. En una terminal, iniciá frontend y API juntos:

   ```sh
   npm run dev
   ```

   Frontend: `http://127.0.0.1:5173`. API: `http://127.0.0.1:3001/api/health`.

También se pueden iniciar por separado con `npm run dev:frontend` y `npm run dev:backend`. Si Vite encuentra ocupado el puerto 5173, detené el servidor anterior o abrí la URL que Vite indique.

Para crear el primer usuario administrativo, configurá `ADMIN_EMAIL` y `ADMIN_PASSWORD` en `.env` (mínimo 14 caracteres) y ejecutá `npm run admin:create`. El acceso está en `/admin`. No hay credenciales de demostración en el repositorio.

## Comandos

| Comando | Uso |
| --- | --- |
| `npm run dev` | Frontend y API en modo desarrollo |
| `npm run dev:frontend` / `npm run dev:backend` | Iniciar un workspace |
| `npm test` | Pruebas frontend y backend |
| `npm run build` | Compilar frontend |
| `npm run db:migrate` | Aplicar esquema e importar catálogo inicial a MySQL |
| `npm run admin:create` | Crear un administrador desde variables de entorno |
| `npm run optimize:images` | Ejecutar la optimización de recursos compatible con el proyecto |

El catálogo JSON en `data/seed/db.json` sirve como semilla y fallback local. Pedidos, usuarios administrativos, inventario, CRM y documentos RAG requieren MySQL. La confirmación de un pedido no procesa pagos; disponibilidad y entrega se coordinan aparte.

GitHub Actions ejecuta instalación reproducible, pruebas, build y auditoría de dependencias en cada push y pull request.

## Despliegue

Vercel compila `frontend/` y enruta `/api/*` a la función catch-all de `api/`. Configurá en Vercel las variables de base de datos y `APP_ORIGIN` con el dominio HTTPS real. Las integraciones Gemini y Google Drive son opcionales; consultá [docs/DESPLIEGUE_VERCEL.md](./docs/DESPLIEGUE_VERCEL.md).

## Estructura

- `frontend/`: React, rutas, catálogo, carrito, comparador, promociones y panel de administración.
- `backend/`: API Express, MySQL, CRM, inventario, autenticación administrativa y RAG.
- `api/`: adaptador serverless de Vercel.
- `data/seed/`: catálogo inicial.
- `scripts/`: desarrollo y tareas de recursos.
- `docs/`: auditoría, arquitectura, migración, despliegue y validación.

Las fuentes originales fuera de este repositorio no se borraron. Los límites de alcance y el resultado de la consolidación están en [docs/AUDITORIA_FUENTES.md](./docs/AUDITORIA_FUENTES.md) y [docs/MAPA_MIGRACION.md](./docs/MAPA_MIGRACION.md).
