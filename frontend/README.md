# Frontend

Aplicación React 19 con React Router, Vite, Motion y Lucide. El proyecto completo se ejecuta desde la raíz del monorepo; consultar [../README.md](../README.md) para instalación, backend y despliegue.

## Desarrollo y validación

Desde la raíz:

```sh
npm run dev:frontend
npm run test
npm run build
```

La interfaz consulta `/api/products`, `/api/settings` y `/api/siteSections`; Vite reenvía esas rutas al workspace backend. `../data/seed/db.json` contiene los datos iniciales y fallback de desarrollo.

## Estructura

- `src/app/` composición y providers.
- `src/components/` navegación, layout y controles compartidos.
- `src/features/` catálogo, carrito, comparador, promociones y panel administrativo.
- `src/data/` adaptadores de datos y fallback.
- `public/images/` recursos gráficos del sitio.

## Catálogo e imágenes

Editá `../data/seed/db.json` para modificar los datos de semilla. Los datos persistidos del catálogo se administran por la API/MySQL después de ejecutar la migración. Las imágenes se encuentran en `public/images/products/` y `public/images/hero/`; comprobá que cada recurso se use antes de reemplazarlo o eliminarlo.

Las imágenes actuales son ilustraciones de demostración, no fotos del inventario real. Las características técnicas de los productos son referencias editoriales y no verifican el artículo físico disponible. Confirmá modelo, compatibilidad, contenido de la caja y garantía antes de publicar afirmaciones comerciales.
