# Auditoría de fuentes

## Fuentes examinadas

Se compararon las versiones locales `Drop_Zone`, `Drop_Zone_RAG`, `Drop_Zone_zip`, `frontend` y el archivo `Drop_Zone_RAG-entrega.zip`, junto con la especificación `PROMPT_MASTER_CODEX_REORGANIZACION_DROP_ZONE.md`.

## Hallazgos

- `Drop_Zone` es el repositorio Git y base de la aplicación pública: catálogo, rutas, carrito, comparador, promociones, pruebas y configuración Vercel.
- `Drop_Zone_RAG` aporta el backend Express/MySQL, CRM, inventario, autenticación administrativa, integración Gemini/Google Drive y módulo administrativo.
- `frontend` es mayormente una copia del frontend principal. El ZIP contiene una versión adicional anterior.
- Los 115 activos compartidos en las carpetas principales de imágenes de `Drop_Zone` y `Drop_Zone_RAG` coinciden por SHA-256. En `public/images/products - copia`, 51 de 53 nombres coincidentes tienen contenido distinto; no deben deduplicarse solo por nombre.
- `db.json` es compatible con los datos iniciales usados por la versión RAG y se conserva como `data/seed/db.json`.
- No se integró `server/demo.js`: incluía credenciales demo fijas. El archivo original no se modificó ni se borró.

## Protección y límites

Antes de mover archivos se generó un respaldo local (manifiesto: 806 archivos, 51,104,607 bytes) y se creó la rama `refactor/consolidacion-fullstack-drop-zone` desde `main`. El respaldo omitió `.env`, dependencias instaladas, artefactos generados y `.git`; las fuentes originales permanecen en sus ubicaciones.

No se subieron secretos ni se incorporó el `.env` de `Drop_Zone_RAG`. La integración no convierte el checkout en un procesador de pagos ni demuestra credenciales/servicios externos.
