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

-- Cédulas autorizadas por empresa B2B (empleados con acceso sin pago)
CREATE TABLE empleados_b2b (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID REFERENCES clientes_b2b(id) ON DELETE CASCADE,
  cedula      VARCHAR(20) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(empresa_id, cedula)
);

CREATE INDEX idx_empleados_b2b_cedula ON empleados_b2b(cedula);
CREATE INDEX idx_empleados_b2b_empresa ON empleados_b2b(empresa_id);

-- Codigo de acceso call center por empresa (agregar a tabla existente)
-- ALTER TABLE clientes_b2b ADD COLUMN IF NOT EXISTS codigo_acceso VARCHAR(20) UNIQUE;

-- Datos editables de cada documento por consulta (para que al reabrir una plantilla
-- ya generada aparezca todo lo llenado y solo haya que ajustar/actualizar lo que falte).
-- 'datos' guarda { campos:{id->valor}, radios:{name->valor}, checks:{id|cb#->bool} }.
CREATE TABLE documentos_datos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consulta_id UUID NOT NULL REFERENCES consultas(id) ON DELETE CASCADE,
  paciente_id UUID REFERENCES pacientes(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL, -- receta | certificado | laboratorio | historia | interconsulta
  datos       JSONB NOT NULL DEFAULT '{}'::jsonb,
  medico_id   UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (consulta_id, tipo)
);

CREATE INDEX idx_documentos_datos_consulta ON documentos_datos(consulta_id);

-- Sexo del paciente (M/F) — se infiere del nombre al registrar y es editable en el panel
-- ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS sexo VARCHAR(1);
