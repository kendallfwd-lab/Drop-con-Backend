# Continuar la configuración local de Drop Zone

Guía de continuidad para configurar MySQL y ejecutar la aplicación en Windows. Las contraseñas y claves se escriben solo en la computadora local; no las envíes por chat ni las subas al repositorio.

## Estado actual

- Proyecto: `C:\Users\DELL1\Desktop\proyecto fiinal\Drop_Zone`
- Rama: `refactor/consolidacion-fullstack-drop-zone`
- Node.js `v24.19.0` y npm `11.17.0` están instalados.
- El puerto local de MySQL `127.0.0.1:3306` respondió como accesible.
- MySQL Workbench está instalado, pero todavía falta confirmar que la conexión se abre y que las credenciales funcionan.
- El comando `mysql --version` no está disponible en PowerShell; se puede continuar usando Workbench.
- `.env` no debe subirse al repositorio. La plantilla pública es `.env.example`.
- No se ha ejecutado la migración en la base de datos de este equipo ni se ha confirmado `/api/health`.

## 1. Comprobar la conexión en MySQL Workbench

1. Abre MySQL Workbench desde el menú Inicio.
2. En la pantalla inicial, abre la conexión local que usa el puerto `3306`.
3. Si Workbench pide una contraseña, escríbela allí, no en la terminal ni en el chat.
4. Comprueba que se abre el editor SQL y que no aparece un error de conexión.

Si no aparece una conexión guardada, crea una conexión nueva con:

- Hostname: `127.0.0.1`
- Port: `3306`
- Username: el usuario administrador local de MySQL que ya tengas

La contraseña se puede guardar en el almacén local de Workbench, si lo deseas. Si la conexión falla, conserva el mensaje de error, pero oculta nombres de usuario, host público y cualquier dato sensible antes de compartirlo.

## 2. Crear la base de datos y un usuario dedicado

En Workbench, abre una pestaña SQL y ejecuta:

```sql
CREATE DATABASE IF NOT EXISTS drop_zone
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

Es preferible usar un usuario exclusivo para la aplicación en lugar de `root`. En **Server > Users and Privileges**, crea el usuario `drop_zone` con host `127.0.0.1` y una contraseña nueva. En **Schema Privileges**, asígnale todos los privilegios solo sobre `drop_zone`. La contraseña se define dentro de Workbench; no la escribas en archivos compartidos.

Si el usuario `drop_zone` ya existe, actualiza su contraseña desde Workbench y verifica que sus privilegios apliquen a `drop_zone`. No hace falta crear otro usuario con un nombre distinto.

## 3. Crear y editar `.env`

Abre PowerShell en la carpeta del proyecto y ejecuta:

```powershell
Set-Location 'C:\Users\DELL1\Desktop\proyecto fiinal\Drop_Zone'
Copy-Item .env.example .env
notepad .env
```

En el Bloc de notas, configura como mínimo estas variables:

```dotenv
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=drop_zone
DB_USER=drop_zone
DB_PASSWORD=ESCRIBE_AQUI_LA_CONTRASENA_LOCAL
DB_TLS=false
```

Guarda y cierra el Bloc de notas. Reemplaza el texto de ejemplo por la contraseña elegida en Workbench. No envíes el contenido de `.env` ni una captura donde se vean secretos. Las variables de Gemini y Google Drive son opcionales para el inicio básico.

## 4. Instalar dependencias y migrar

En PowerShell, desde la raíz de `Drop_Zone`, ejecuta estos comandos, uno por uno:

```powershell
npm ci
```

Si termina correctamente:

```powershell
npm run db:migrate
```

El segundo comando crea las tablas e importa el catálogo inicial. Si muestra un error, comparte solo el texto del error y elimina cualquier contraseña o cadena de conexión antes de enviarlo.

## 5. Crear el administrador inicial (cuando quieras usar `/admin`)

En `.env`, define `ADMIN_EMAIL` y `ADMIN_PASSWORD`. La contraseña debe tener entre 14 y 128 caracteres. No la reutilices de MySQL y no la compartas.

Luego ejecuta una sola vez:

```powershell
npm run admin:create
```

Este comando crea el administrador inicial. Si ya fue creado, no lo vuelvas a ejecutar; el correo es único.

## 6. Iniciar y comprobar la aplicación

Desde la raíz del proyecto:

```powershell
npm run dev
```

Deja esa terminal abierta. La aplicación inicia Vite y la API juntos:

- Frontend: `http://127.0.0.1:5173`
- Estado de la API y MySQL: `http://127.0.0.1:3001/api/health`
- Administración: `http://127.0.0.1:5173/admin`

Abre el frontend y luego la URL de salud en el navegador. Si `/api/health` responde con error, MySQL, las credenciales o la migración aún no están listos.

Si PowerShell informa que el puerto `5173` ya está en uso, no ejecutes una segunda copia de `npm run dev`. Busca la terminal anterior que ejecuta Vite y presiona `Ctrl+C`; después vuelve a iniciar el comando. Para detener la aplicación, usa `Ctrl+C` en la terminal de `npm run dev`.

## Si algo falla

Comparte el comando que ejecutaste y el mensaje de error, pero nunca el archivo `.env`, contraseñas, tokens ni claves. Indica también si el fallo ocurrió al abrir Workbench, al migrar, al iniciar los servidores o al abrir una URL.

La instalación, las pruebas, el build y el CI de GitHub ya se habían verificado previamente. La migración y la conexión real de este equipo son los siguientes puntos por validar. El repositorio remoto es `https://github.com/kendallfwd-lab/Drop-con-Backend`; la rama de trabajo publicada es `refactor/consolidacion-fullstack-drop-zone`. No se debe cambiar ni fusionar `main` para completar la configuración local.
