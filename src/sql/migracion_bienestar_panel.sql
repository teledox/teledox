-- MediLyft — Bienestar check-in en panel principal
-- Ejecutar en Supabase: Dashboard → SQL Editor → New query → pegar y Run
-- Seguro re-ejecutar (IF NOT EXISTS / IF EXISTS en todo).

-- 1. seguimiento_respuestas: tipo y nivel para distinguir medicamento vs bienestar
ALTER TABLE seguimiento_respuestas
  ADD COLUMN IF NOT EXISTS tipo            TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS nivel_bienestar INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS recordatorio_id UUID    REFERENCES recordatorios(id) ON DELETE SET NULL;

-- tipo: 'medicamento' | 'fin_tratamiento' | 'bienestar'
-- nivel_bienestar: 1=Excelente … 5=Muy mal (solo se llena cuando tipo='bienestar')
-- recordatorio_id: enlaza la respuesta con el recordatorio que la originó

CREATE INDEX IF NOT EXISTS idx_seg_respuestas_tipo          ON seguimiento_respuestas(tipo);
CREATE INDEX IF NOT EXISTS idx_seg_respuestas_recordatorio  ON seguimiento_respuestas(recordatorio_id);
CREATE INDEX IF NOT EXISTS idx_seg_respuestas_nivel         ON seguimiento_respuestas(nivel_bienestar);
