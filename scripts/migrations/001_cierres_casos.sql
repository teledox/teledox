-- Migración 001: tabla de cierres de casos (lazo cerrado)
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS cierres_casos (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo               TEXT NOT NULL CHECK (tipo IN ('prescripcion', 'tracking', 'postquirurgico')),
  resultado          TEXT NOT NULL CHECK (resultado IN ('exitoso', 'parcial', 'sin_mejoria', 'abandono')),
  paciente_id        UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  empresa_id         UUID REFERENCES clientes_b2b(id) ON DELETE SET NULL,
  consulta_id        UUID REFERENCES consultas(id) ON DELETE SET NULL,
  tracking_caso_id   UUID REFERENCES tracking_casos(id) ON DELETE SET NULL,
  medicamento        TEXT,
  duracion_dias      INTEGER,
  respuesta_paciente TEXT,
  cerrado_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cierres_casos_paciente_idx  ON cierres_casos(paciente_id);
CREATE INDEX IF NOT EXISTS cierres_casos_empresa_idx   ON cierres_casos(empresa_id);
CREATE INDEX IF NOT EXISTS cierres_casos_cerrado_idx   ON cierres_casos(cerrado_at DESC);
CREATE INDEX IF NOT EXISTS cierres_casos_resultado_idx ON cierres_casos(resultado);

COMMENT ON TABLE cierres_casos IS 'Registro formal de cierre de cada caso de seguimiento. Evidencia de resultado para convenios.';
COMMENT ON COLUMN cierres_casos.tipo       IS 'prescripcion | tracking | postquirurgico';
COMMENT ON COLUMN cierres_casos.resultado  IS 'exitoso | parcial | sin_mejoria | abandono';
COMMENT ON COLUMN cierres_casos.duracion_dias IS 'Días que duró el seguimiento activo';
