# Arquitectura

## Componentes

- **Frontend (`frontend/`)**: React 19, React Router y Vite. El catálogo carga desde `/api/products`, `/api/settings` y `/api/siteSections`; `data/seed/db.json` permite fallback local/desarrollo.
- **Backend (`backend/`)**: Express y MySQL. Administra catálogo, pedidos, inventario, usuarios del equipo, CRM y las rutas de conocimiento/RAG.
- **Adaptadores**: `backend/src/server.js` inicia Express localmente; `api/[...path].js` lo exporta como función de Vercel.
- **Persistencia**: `backend/database/migrations/001_initial_schema.sql` define el esquema y la migración importa el catálogo JSON una sola vez.

## Límites de producto

Los pedidos se registran como pendientes y pueden reservar/decrementar unidades únicamente cuando el inventario configurado es finito. No hay integración de pago, proveedor de envíos ni confirmación transaccional externa. La cuenta administrativa debe crearse de forma explícita con `npm run admin:create`.

Gemini y Google Drive son integraciones opcionales; requieren variables propias y autorización. Los documentos RAG no se almacenan en el frontend. Se recomienda configurar HTTPS, secretos y una base MySQL administrada fuera del repositorio.

## Flujo local

El frontend usa el proxy de Vite para enviar `/api/*` al servidor local en `127.0.0.1:3001`. La API valida entradas y persiste cambios en MySQL; el navegador no se conecta directamente a la base de datos.
