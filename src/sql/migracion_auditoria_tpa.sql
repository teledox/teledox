-- ── Migración: Auditoría Clínica TPA (Mawdy) ───────────────────────────
-- Añade trazabilidad de auditoría de pertinencia médica sobre las consultas.

ALTER TABLE consultas 
  ADD COLUMN IF NOT EXISTS estado_auditoria VARCHAR(20) DEFAULT 'pendiente', -- 'pendiente' | 'aprobado' | 'observado' | 'rechazado'
  ADD COLUMN IF NOT EXISTS notas_auditoria TEXT,
  ADD COLUMN IF NOT EXISTS auditor_id UUID REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS auditado_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_consultas_auditoria ON consultas(estado_auditoria, empresa_id);
