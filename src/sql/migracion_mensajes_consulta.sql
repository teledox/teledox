-- Preguntas del paciente al médico y respuestas del médico al paciente,
-- asociadas a una consulta específica. Canal Q&A post-consulta (72h).
CREATE TABLE IF NOT EXISTS mensajes_consulta (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consulta_id UUID REFERENCES consultas(id) ON DELETE CASCADE,
  paciente_id UUID REFERENCES pacientes(id),
  medico_id   UUID REFERENCES usuarios(id),
  tipo        VARCHAR(30) NOT NULL CHECK (tipo IN ('pregunta_paciente', 'respuesta_medico')),
  contenido   TEXT NOT NULL,
  leido       BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mensajes_consulta_consulta ON mensajes_consulta(consulta_id);
CREATE INDEX IF NOT EXISTS idx_mensajes_consulta_paciente ON mensajes_consulta(paciente_id);
-- Índice parcial para buscar preguntas sin leer eficientemente
CREATE INDEX IF NOT EXISTS idx_mensajes_consulta_no_leidos ON mensajes_consulta(consulta_id) WHERE leido = FALSE AND tipo = 'pregunta_paciente';
