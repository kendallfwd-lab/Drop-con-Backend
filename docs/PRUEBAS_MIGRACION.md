# Pruebas de migración

## Comandos reproducibles

Desde la raíz, después de configurar `.env`:

```sh
npm ci
npm test
npm run build
npm run db:migrate
```

`npm test` ejecuta las pruebas del frontend y la suite de Node del backend. La migración requiere que MySQL esté disponible y que las variables DB sean válidas. Las pruebas/build no prueban credenciales de Google/Gemini ni el despliegue real de Vercel.

## Verificaciones funcionales

- Catálogo y configuración se sirven desde la API y cuentan con datos semilla para fallback de desarrollo.
- La administración se monta en `/admin` y sus endpoints están bajo `/api/admin`.
- El envío de pedidos valida contenido en servidor y usa una clave de idempotencia.
- El endpoint `/api/health` consulta MySQL y responde correctamente solo si la API y la base están disponibles.

## Resultados

- `npm ci`: instalación limpia desde el lockfile raíz completada. Se actualizaron `googleapis`, `vitest` y `sharp` a versiones corregidas.
- `npm test`: correcto; 69 pruebas frontend y 2 pruebas backend pasaron.
- `npm run build`: correcto; Vite produjo `frontend/dist`. Sigue la advertencia existente de chunk JavaScript mayor a 500 kB (561.90 kB sin gzip).
- `npm audit`: cero vulnerabilidades.
- Sintaxis/configuración: los archivos backend/API pasaron `node --check` y los JSON de configuración se parsearon correctamente.
- El adaptador de Vercel pudo cargar la aplicación Express con variables de base de datos ficticias; no se conectó a MySQL.
- La migración MySQL, la respuesta real de `/api/health` y el despliegue Vercel quedan pendientes de credenciales/servicios externos.
- El workflow de GitHub Actions comprueba instalación, pruebas, compilación y auditoría en cada push y pull request.

No se declaran verificados servicios externos ni despliegue productivo.
