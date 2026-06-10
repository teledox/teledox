-- Seguimiento de examen de laboratorio
-- Ejecutar manualmente en Supabase (SQL editor) antes de desplegar.

CREATE TABLE seguimiento_laboratorio (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consulta_id   UUID REFERENCES consultas(id),
  paciente_id   UUID REFERENCES pacientes(id),
  estado        VARCHAR(30) DEFAULT 'pendiente', -- pendiente | confirmado | sin_examen
  intento       INT DEFAULT 0,                   -- intentos enviados (0-4)
  proximo_envio TIMESTAMPTZ,
  activo        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE seguimiento_laboratorio_respuestas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seguimiento_id UUID REFERENCES seguimiento_laboratorio(id),
  paciente_id    UUID REFERENCES pacientes(id),
  consulta_id    UUID REFERENCES consultas(id),
  intento        INT,
  pregunta       TEXT,
  respuesta      VARCHAR(10), -- 'si' | 'no' | NULL (pendiente de respuesta)
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_seguimiento_lab_activo ON seguimiento_laboratorio(activo, proximo_envio);
CREATE INDEX idx_seguimiento_lab_resp_pendiente ON seguimiento_laboratorio_respuestas(paciente_id, respuesta);
