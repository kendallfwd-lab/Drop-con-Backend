# Despliegue en Vercel

1. Importá el repositorio y seleccioná la raíz como Root Directory.
2. Usá Node.js 22 o superior. `vercel.json` establece `npm run build` y `frontend/dist`.
3. Configurá una base MySQL accesible desde funciones serverless. Aplicá el esquema/importación con `npm run db:migrate` desde un entorno autorizado y con las mismas credenciales.
4. Configurá como variables de entorno de Vercel:
   - `NODE_ENV=production`
   - `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_TLS=true`
   - `APP_ORIGIN=https://<dominio-real>`
   - `ADMIN_EMAIL` y `ADMIN_PASSWORD` solo al crear la cuenta administrativa; luego retiralas si no se requieren en funciones.
   - Opcionales: `GEMINI_API_KEY`, `GEMINI_MODEL`, credenciales Google OAuth, `GOOGLE_DRIVE_FOLDER_ID`, `TOKEN_ENCRYPTION_KEY`.
5. Para Drive, registrá como redirect URI el valor de `GOOGLE_REDIRECT_URI`, usando el dominio HTTPS desplegado y `/api/drive/oauth/callback`.
6. Desplegá y comprobá `/api/health`, `/api/products` y una ruta frontend profunda.

Las funciones serverless son efímeras: no uses archivos locales como almacenamiento persistente. El backend usa MySQL. No incluyas archivos `.env` en Git ni asumas que una build local valida acceso a servicios externos.
