-- Health Score de adherencia/engagement para pacientes regulares (no B2B tracking).
-- Se calcula desde datos de comportamiento ya capturados por el bot: adherencia a
-- medicamentos, bienestar reportado, controles preventivos (laboratorio) y
-- participación en check-ins. Independiente de tracking_biometricos (vitales B2B).

CREATE TABLE IF NOT EXISTS paciente_health_score (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id               UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  score_calculado            INTEGER,
  etiqueta                   TEXT CHECK (etiqueta IN ('controlado','en_riesgo','alerta')),
  adherencia_tratamiento_pct INTEGER,
  bienestar_promedio         NUMERIC(3,2),
  controles_preventivos_pct  INTEGER,
  participacion_activa_pct   INTEGER,
  periodo_desde              TIMESTAMPTZ NOT NULL,
  periodo_hasta              TIMESTAMPTZ NOT NULL,
  created_at                 TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_score_paciente ON paciente_health_score(paciente_id, created_at DESC);

-- Controla cuándo le toca a cada paciente el próximo cálculo mensual.
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS proximo_health_score TIMESTAMPTZ DEFAULT NOW();
