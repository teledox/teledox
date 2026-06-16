-- MediLyft Tracking — migración inicial
-- Ejecutar en Supabase: Dashboard → SQL Editor → New query → pegar y Run

-- 1. Empresas médicas externas (clientes del servicio de tracking)
CREATE TABLE IF NOT EXISTS tracking_empresas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre          TEXT NOT NULL,
  contacto_email  TEXT,
  activo          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 2. Casos de seguimiento (un caso = un paciente derivado por una empresa)
CREATE TABLE IF NOT EXISTS tracking_casos (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           UUID REFERENCES tracking_empresas(id),
  paciente_nombre      TEXT NOT NULL,
  telefono             TEXT NOT NULL,
  diagnostico          TEXT,
  tratamiento          TEXT,
  medicamentos         JSONB DEFAULT '[]',
  frecuencia_horas     INTEGER DEFAULT 24,
  proximo_seguimiento  TIMESTAMPTZ DEFAULT now(),
  estado               TEXT DEFAULT 'activo',
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT estado_valido CHECK (estado IN ('activo','alta','alerta','derivado','inactivo'))
);

-- 3. Registros de cada interacción diaria del bot con el paciente
CREATE TABLE IF NOT EXISTS tracking_registros (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caso_id      UUID REFERENCES tracking_casos(id) ON DELETE CASCADE,
  respuestas   JSONB DEFAULT '{}',
  nivel_alerta INTEGER DEFAULT 1,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Índices útiles para queries frecuentes
CREATE INDEX IF NOT EXISTS idx_tracking_casos_estado    ON tracking_casos(estado);
CREATE INDEX IF NOT EXISTS idx_tracking_casos_empresa   ON tracking_casos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_tracking_casos_proximo   ON tracking_casos(proximo_seguimiento);
CREATE INDEX IF NOT EXISTS idx_tracking_registros_caso  ON tracking_registros(caso_id);

-- RLS: desactivado — acceso vía service_role key desde el backend
ALTER TABLE tracking_empresas DISABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_casos    DISABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_registros DISABLE ROW LEVEL SECURITY;
