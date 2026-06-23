-- MediLyft Tracking — biométricos
-- Ejecutar en Supabase: Dashboard → SQL Editor → New query → pegar y Run

-- 1. Columna para activar captura biométrica por caso
ALTER TABLE tracking_casos ADD COLUMN IF NOT EXISTS biometricos_activos BOOLEAN DEFAULT false;

-- 2. Tabla de registros biométricos
CREATE TABLE IF NOT EXISTS tracking_biometricos (
  id                   BIGSERIAL PRIMARY KEY,
  caso_id              UUID REFERENCES tracking_casos(id) ON DELETE CASCADE,
  presion_sistolica    INTEGER,
  presion_diastolica   INTEGER,
  glucosa              INTEGER,
  peso                 DECIMAL(5,2),
  score_calculado      INTEGER,
  etiqueta             TEXT CHECK (etiqueta IN ('controlado','en_riesgo','alerta')),
  created_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tracking_bio_caso ON tracking_biometricos(caso_id);
CREATE INDEX IF NOT EXISTS idx_tracking_bio_fecha ON tracking_biometricos(created_at);

-- RLS desactivado — acceso vía service_role key
ALTER TABLE tracking_biometricos DISABLE ROW LEVEL SECURITY;
