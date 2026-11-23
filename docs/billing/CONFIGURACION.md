# Configuración

Variables disponibles:

```dotenv
BILLING_MODE=commercial_only
FISCAL_PROVIDER=none
FISCAL_SANDBOX=true
PUBLIC_API_ORIGIN=http://127.0.0.1:3001
```

Los archivos se guardan localmente en `storage/billing/`, excluido de Git. En producción debe sustituirse por almacenamiento privado con URLs firmadas y retención definida. No guardar tokens, certificados ni claves en el frontend.

Después de configurar MySQL:

```powershell
npm run db:migrate
npm run dev
```
