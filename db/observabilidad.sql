-- MediLyft — Observabilidad del bot WhatsApp
-- Ejecutar en Supabase: Dashboard → SQL Editor → New query → pegar y Run
--
-- Crea dos tablas:
--   1. bot_mensajes_procesados — idempotencia: 1 fila por wamid entrante ya
--      procesado. Sirve para deduplicar los reintentos de webhook de Meta.
--   2. bot_eventos — bitácora de observabilidad: entrantes, salientes, callbacks
--      de estado (sent/delivered/read/failed), duplicados bloqueados y errores.

-- ── 1. Dedup de mensajes entrantes ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bot_mensajes_procesados (
  wamid       TEXT PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── 2. Bitácora de eventos ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bot_eventos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ DEFAULT now(),
  -- 'entrante' | 'saliente' | 'estado' | 'duplicado' | 'error'
  tipo        TEXT NOT NULL,
  -- 'in' | 'out' | NULL
  direccion   TEXT,
  telefono    TEXT,
  -- id de mensaje de WhatsApp (wamid). En 'estado' referencia al saliente.
  wamid       TEXT,
  flujo       TEXT,
  paso        TEXT,
  -- saliente: 'ok'|'fail' · estado: 'sent'|'delivered'|'read'|'failed'
  estado      TEXT,
  error       TEXT,
  detalle     JSONB,
  CONSTRAINT bot_eventos_tipo_valido
    CHECK (tipo IN ('entrante','saliente','estado','duplicado','error'))
);

CREATE INDEX IF NOT EXISTS idx_bot_eventos_created   ON bot_eventos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_eventos_tipo      ON bot_eventos(tipo);
CREATE INDEX IF NOT EXISTS idx_bot_eventos_telefono  ON bot_eventos(telefono);
CREATE INDEX IF NOT EXISTS idx_bot_eventos_wamid     ON bot_eventos(wamid);
CREATE INDEX IF NOT EXISTS idx_bot_eventos_estado    ON bot_eventos(estado);

-- RLS: desactivado — acceso vía service_role key desde el backend
ALTER TABLE bot_mensajes_procesados DISABLE ROW LEVEL SECURITY;
ALTER TABLE bot_eventos             DISABLE ROW LEVEL SECURITY;

-- ── Limpieza opcional (programar con pg_cron si se desea) ───────────────────
-- Conservar solo 30 días de bitácora y de dedup:
-- DELETE FROM bot_eventos             WHERE created_at < now() - INTERVAL '30 days';
-- DELETE FROM bot_mensajes_procesados WHERE created_at < now() - INTERVAL '30 days';
