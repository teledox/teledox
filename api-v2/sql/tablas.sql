-- Antecedentes médicos del paciente (1 fila por paciente)
CREATE TABLE antecedentes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id   UUID REFERENCES pacientes(id) UNIQUE,
  alergias      TEXT,
  hipertension  TEXT,
  diabetes      TEXT,
  cirugias      TEXT,
  otros         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Documentos generados (historia clínica, recetas subidas por médico, etc.)
CREATE TABLE documentos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id      UUID REFERENCES pacientes(id),
  consulta_id      UUID REFERENCES consultas(id),
  tipo             VARCHAR(100), -- 'historia_clinica', 'receta', 'examen', etc.
  storage_path     VARCHAR(500), -- ruta en Supabase Storage
  enviado_paciente BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Índices útiles
CREATE INDEX idx_documentos_paciente ON documentos(paciente_id);
CREATE INDEX idx_antecedentes_paciente ON antecedentes(paciente_id);
