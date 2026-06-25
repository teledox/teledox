# Observabilidad del bot WhatsApp

Sistema para detectar fallos técnicos del bot: mensajes que no llegaron,
duplicados, errores de procesamiento y sesiones atascadas.

## Qué se agregó

### Backend (instrumentación + 3 arreglos de causa raíz)
- **Dedup de entrantes** ([webhook.js](../api/webhook.js)): cada `wamid` se
  registra en `bot_mensajes_procesados`; si WhatsApp reintenta la entrega del
  webhook, el mensaje repetido se ignora → no más respuestas/avances duplicados.
- **Captura de callbacks de estado** ([webhook.js](../api/webhook.js)): se
  procesan los `value.statuses` de Meta (sent / delivered / read / **failed**),
  antes se descartaban. Un `failed` con su motivo es cómo se sabe que un mensaje
  no llegó.
- **Registro de envíos** ([whatsapp.js](../src/services/whatsapp.js)): `_post`
  registra cada envío (ok/fail + wamid) en `bot_eventos`.
- **Registro de errores** ([webhook.js](../api/webhook.js)): el catch del
  webhook escribe el error en `bot_eventos` (antes solo iba a Telegram/console).
- Toda la bitácora pasa por [eventos.js](../src/services/eventos.js), que
  **nunca lanza**: la observabilidad no puede tumbar el procesamiento.

### Tablas (Supabase) — ver [db/observabilidad.sql](../db/observabilidad.sql)
- `bot_mensajes_procesados` — idempotencia (1 fila por wamid entrante).
- `bot_eventos` — bitácora: `entrante`, `saliente`, `estado`, `duplicado`, `error`.

### Dashboard — [public/flows/index.html](../public/flows/index.html)
Página standalone (`/flows`), login con los mismos usuarios del panel. Tres tabs:

**1. Salud técnica** (últimas 24 h, auto-refresh 30 s):
- Tarjetas: entrantes, enviados OK, fallidos, % entrega, duplicados, errores.
- Tabla de **mensajes que no llegaron** (con motivo).
- Tabla de **errores de procesamiento** (con paso y mensaje).
- **Sesiones atascadas**: activas en `sesiones_bot` sin actividad > 30 min.

**2. Flujos en vivo**: pacientes por estado (`_flujo` + `paso`), en tiempo real.

**3. Explorador**: esquema de cada flujo de inicio a fin. Cada nodo es
clickeable y muestra su mensaje real y sus bifurcaciones (condición → destino).
Se alimenta del manifiesto (ver abajo).

### Manifiesto de flujos — [public/flows/flow-graph.js](../public/flows/flow-graph.js)
Fuente de verdad declarativa de cada flujo (nodos, mensajes, ramas, trigger).
Lo lee el navegador (`<script>`) y Node (`require`). Alcance actual:
seguimiento + tracking (`seguimiento_pago`, `tracking_biometrico`,
`tracking_migracion`, `tracking`, `seg_med`, `seg_fin_trat`, `seg_bienestar`,
`seg_lab`).

**Sincronía garantizada por test**:
[scripts/test-bot/validate-flow-graph.js](../scripts/test-bot/validate-flow-graph.js)
cruza, para los flujos con `validar: true`, los nodos del manifiesto contra los
`paso === 'x'` reales del archivo fuente. Si se agrega/renombra un estado en el
código y no en el manifiesto (o viceversa), el test **falla**. Corre como parte
de `scripts/test-bot/run.js` y también suelto:
`node scripts/test-bot/validate-flow-graph.js`.

## Despliegue (paso obligatorio)

1. Ejecutar [db/observabilidad.sql](../db/observabilidad.sql) en Supabase
   (Dashboard → SQL Editor). **Sin esto el dashboard muestra un aviso y el
   dedup/logging quedan inactivos** (fail-open: no rompe nada, pero no observa).
2. Configurar el webhook de WhatsApp para suscribirse al campo `message_status`
   (entrega/lectura/fallo) además de `messages`, para recibir los callbacks de
   estado en `value.statuses`.
3. Desplegar el código (Vercel sirve `/flows` desde `public/flows/`).

## Notas
- El dashboard lee `bot_eventos` y `sesiones_bot` con la publishable key + la
  sesión del usuario logueado (mismo patrón que el panel de tracking). Ambas
  tablas tienen RLS deshabilitado.
- El orden de los estados en "Flujos en vivo" usa un mapa `ORDEN` embebido en la
  página; estados no listados se ordenan por cantidad. Si se renombran estados en
  `src/flows/*`, conviene actualizar ese mapa (solo afecta el layout, no el dato).
- Retención: el `.sql` incluye (comentado) un `DELETE` para conservar 30 días;
  se puede programar con pg_cron.
