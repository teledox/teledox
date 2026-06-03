# Notas de configuración Vercel

## ⚠️ CRON — Plan Hobby (NO agregar crons aquí)

El plan Hobby de Vercel **solo permite crons que corran 1 vez al día**.
El cron de recordatorios necesita correr **cada 15 minutos** → incompatible.

**NO agregar esto al vercel.json con plan Hobby:**
```json
"crons": [{ "path": "/api/cron", "schedule": "*/15 * * * *" }]
```

### Solución actual
Usar un servicio externo gratuito que llame al endpoint manualmente:
- **cron-job.org** (gratuito, soporta cada 15 min)
- URL a configurar: `https://<dominio>.vercel.app/api/cron`
- Método: GET
- Frecuencia: cada 15 minutos

### Para el futuro
Si se sube a **Plan Pro de Vercel**, agregar de vuelta al vercel.json:
```json
"crons": [{ "path": "/api/cron", "schedule": "*/15 * * * *" }]
```

## Funciones declaradas explícitamente
Solo 3 funciones serverless (límite Hobby = 12):
- `webhook.js` — bot WhatsApp (Twilio)
- `cron.js`    — recordatorios automáticos
- `compress.js` — compresión de PDFs

Los demás archivos en `api/` (flows/, services/, etc.) son módulos internos,
NO funciones. Están declarados explícitamente en `vercel.json` con `functions`
para que Vercel no los cuente como funciones individuales.
