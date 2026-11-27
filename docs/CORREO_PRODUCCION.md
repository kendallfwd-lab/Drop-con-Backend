# Correo transaccional en producción

El restablecimiento de contraseña usa Resend por API HTTPS. No usa SMTP ni expone la clave en el navegador.

1. Creá una cuenta de Resend y verificá el dominio desde el que saldrán los mensajes (por ejemplo, `dropzonecr.com`). Configurá los registros DNS que Resend indique.
2. Creá una API key con permiso exclusivo para enviar correos.
3. En el entorno de producción configurá secretos, nunca archivos versionados:

```env
NODE_ENV=production
APP_ORIGIN=https://tu-dominio.com
MAIL_PROVIDER=resend
MAIL_API_KEY=re_tu_clave_secreta
EMAIL_FROM=DROP ZONE CR <seguridad@tu-dominio.com>
```

4. Reiniciá el backend y solicitá una recuperación usando una cuenta de prueba. El enlace vence a los 30 minutos y se invalida al usarse.

En desarrollo se conserva `MAIL_PROVIDER=console`: el enlace se registra solamente en la consola del backend y la respuesta local lo muestra para pruebas. En producción ese modo se rechaza para evitar revelar enlaces de acceso.
