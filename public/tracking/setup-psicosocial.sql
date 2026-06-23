-- MediLyft Tracking — evaluación psicosocial MRL
-- Ejecutar en Supabase: Dashboard → SQL Editor → New query → pegar y Run

-- 1. Columna de colesterol en biométricos (si no se corrió la migración antes)
ALTER TABLE tracking_biometricos ADD COLUMN IF NOT EXISTS colesterol INTEGER;

-- 2. Columnas para psicosocial en tracking_casos
ALTER TABLE tracking_casos ADD COLUMN IF NOT EXISTS psicosocial_activo BOOLEAN DEFAULT false;
ALTER TABLE tracking_casos ADD COLUMN IF NOT EXISTS proximo_psicosocial TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE tracking_casos ADD COLUMN IF NOT EXISTS ultima_evaluacion_psicosocial TIMESTAMPTZ DEFAULT NULL;

-- 3. Tabla de evaluaciones psicosociales (anónimas — solo se muestran por empresa)
CREATE TABLE IF NOT EXISTS tracking_psicosocial (
  id              BIGSERIAL PRIMARY KEY,
  empresa_id      UUID REFERENCES tracking_empresas(id),
  caso_id         UUID REFERENCES tracking_casos(id) ON DELETE SET NULL,
  dim_carga       INTEGER CHECK (dim_carga BETWEEN 0 AND 100),
  dim_autonomia   INTEGER CHECK (dim_autonomia BETWEEN 0 AND 100),
  dim_apoyo       INTEGER CHECK (dim_apoyo BETWEEN 0 AND 100),
  dim_relaciones  INTEGER CHECK (dim_relaciones BETWEEN 0 AND 100),
  dim_doble_pres  INTEGER CHECK (dim_doble_pres BETWEEN 0 AND 100),
  score_global    INTEGER CHECK (score_global BETWEEN 0 AND 100),
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_psi_empresa ON tracking_psicosocial(empresa_id);
CREATE INDEX IF NOT EXISTS idx_psi_fecha   ON tracking_psicosocial(created_at);

-- RLS desactivado — acceso vía service_role key
ALTER TABLE tracking_psicosocial DISABLE ROW LEVEL SECURITY;
