-- Registro de enlaces de teleconsulta (Meet/Zoom/Teams) enviados al paciente
-- Ejecutar manualmente en Supabase (SQL editor) antes de desplegar.

CREATE TABLE enlaces_teleconsulta (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consulta_id  UUID REFERENCES consultas(id),
  paciente_id  UUID REFERENCES pacientes(id),
  medico_id    UUID REFERENCES usuarios(id),
  link         TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_enlaces_teleconsulta_consulta ON enlaces_teleconsulta(consulta_id);

-- Mismo criterio que el resto de tablas nuevas: el backend/portal acceden con
-- la clave de servicio (sin políticas RLS), así que se desactiva aquí también.
ALTER TABLE enlaces_teleconsulta DISABLE ROW LEVEL SECURITY;
