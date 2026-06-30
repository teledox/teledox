-- Migración 002: permite que el médico cierre un caso manualmente desde el panel
-- (dar de alta), en vez de depender únicamente de la respuesta del paciente por WhatsApp.
-- NULL en cerrado_por_medico_id = cierre automático impulsado por el paciente (como hasta ahora).

ALTER TABLE cierres_casos ADD COLUMN IF NOT EXISTS cerrado_por_medico_id UUID REFERENCES usuarios(id) ON DELETE SET NULL;

COMMENT ON COLUMN cierres_casos.cerrado_por_medico_id IS 'Médico que dio el alta manualmente desde el panel. NULL si el cierre fue automático (respuesta del paciente por WhatsApp).';
